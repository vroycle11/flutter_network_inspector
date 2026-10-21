import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { NetworkRecord, RetentionSettings, FilterCriteria, InspectorState } from '../types';
import { VmServiceClient } from '../vm_service/client';
import { HttpProfiler } from '../vm_service/http_profiler';
import { VmServiceDiscovery } from '../vm_service/discovery';
import { CaptureNormalizer } from './normalizer';
import { RetentionManager } from './retention';
import { DataSanitizer } from './sanitizer';

export class CaptureManager extends EventEmitter implements vscode.Disposable {
  private client: VmServiceClient;
  private profiler: HttpProfiler;
  private discovery: VmServiceDiscovery;
  private normalizer: CaptureNormalizer;
  private retention: RetentionManager;
  private sanitizer: DataSanitizer;

  private settings: RetentionSettings;
  private isPaused = false;
  private outputChannel: vscode.OutputChannel;
  private webviews = new Set<vscode.Webview>();

  constructor(settings: RetentionSettings) {
    super();
    this.settings = settings;
    this.outputChannel = vscode.window.createOutputChannel('Flutter Network Inspector');

    this.client = new VmServiceClient();
    this.profiler = new HttpProfiler(this.client, {
      pollingIntervalMs: settings.pollingIntervalMs,
    });
    this.discovery = new VmServiceDiscovery();
    this.normalizer = new CaptureNormalizer(settings.maxBodySizeBytes);
    this.retention = new RetentionManager(settings);
    this.sanitizer = new DataSanitizer(settings.sensitiveHeaders, settings.sensitiveQueryParams);

    this.setupListeners();
  }

  public get currentState(): InspectorState {
    return {
      isConnected: this.client.isConnected,
      isPaused: this.isPaused,
      activeUri: this.client.currentUri ? VmServiceClient.maskUri(this.client.currentUri) : undefined,
      targetIsolate: this.profiler.currentIsolateId || undefined,
      totalRecords: this.retention.count,
      evictedBodies: this.retention.evictedBodiesCount,
      bodyMemoryBytes: this.retention.currentTotalBodyBytes,
    };
  }

  public getRecords(criteria?: FilterCriteria): NetworkRecord[] {
    let all = this.retention.getAll();
    if (!criteria) return all;

    const query = criteria.searchText?.trim().toLowerCase();
    const methods = new Set(criteria.methods.map((m) => m.toUpperCase()));
    const statusGroup = criteria.statusGroup?.toLowerCase();
    const failedOnly = criteria.failedOnly;

    return all.filter((r) => {
      if (methods.size > 0 && !methods.has(r.method.toUpperCase())) return false;

      if (failedOnly) {
        const isFailed = r.state === 'failed' || (r.statusCode && r.statusCode >= 400) || r.error;
        if (!isFailed) return false;
      }

      if (statusGroup && statusGroup !== 'all') {
        const code = r.statusCode;
        if (code === undefined) {
          if (statusGroup !== 'other') return false;
        } else {
          const prefix = Math.floor(code / 100);
          if (statusGroup === '2xx' && prefix !== 2) return false;
          if (statusGroup === '3xx' && prefix !== 3) return false;
          if (statusGroup === '4xx' && prefix !== 4) return false;
          if (statusGroup === '5xx' && prefix !== 5) return false;
        }
      }

      if (query && query.length > 0) {
        if (r.uri.toLowerCase().includes(query)) return true;
        if (r.statusCode?.toString().includes(query)) return true;
        if (r.error?.toLowerCase().includes(query)) return true;
        if (criteria.searchBody) {
          if (r.requestBody?.toLowerCase().includes(query)) return true;
          if (r.responseBody?.toLowerCase().includes(query)) return true;
        }
        return false;
      }

      return true;
    });
  }

  public getRecord(id: string): NetworkRecord | undefined {
    return this.retention.get(id);
  }

  public async getRequestDetail(id: string): Promise<NetworkRecord | undefined> {
    const existing = this.retention.get(id);
    if (!existing) return undefined;

    // If details already loaded, return existing
    if (existing.hasDetails) return existing;

    // Fetch from VM Service
    if (this.client.isConnected && existing.source === 'vm_service') {
      try {
        const rawDetail = await this.profiler.getRequestDetail(id, existing.isolateId);
        const detailed = this.normalizer.normalizeDetail(existing, rawDetail);
        this.retention.addOrUpdate(detailed);
        this.broadcastRecordUpdate(detailed);
        return detailed;
      } catch (err: any) {
        this.log(`Failed to fetch detail for request ${id}: ${err.message}`);
      }
    }

    return existing;
  }

  public async connect(rawUri: string): Promise<void> {
    try {
      this.log(`Connecting to Dart VM Service: ${VmServiceClient.maskUri(rawUri)}`);
      await this.client.connect(rawUri);
      await this.client.streamListen('Isolate');
      await this.client.streamListen('Extension');

      await this.profiler.start();
      await vscode.commands.executeCommand('setContext', 'flutterNetworkInspector.isConnected', true);
      this.broadcastState();
      vscode.window.showInformationMessage('Flutter Network Inspector connected.');
    } catch (err: any) {
      this.log(`Connection error: ${err.message}`);
      vscode.window.showErrorMessage(`Failed to connect to VM Service: ${err.message}`);
      throw err;
    }
  }

  public disconnect(): void {
    this.profiler.stop();
    this.client.disconnect();
    vscode.commands.executeCommand('setContext', 'flutterNetworkInspector.isConnected', false);
    this.broadcastState();
    this.log('Disconnected from VM Service.');
  }

  public pause(): void {
    this.isPaused = true;
    vscode.commands.executeCommand('setContext', 'flutterNetworkInspector.isPaused', true);
    this.broadcastState();
  }

  public resume(): void {
    this.isPaused = false;
    vscode.commands.executeCommand('setContext', 'flutterNetworkInspector.isPaused', false);
    this.broadcastState();
  }

  public clearHistory(): void {
    this.retention.clear();
    this.profiler.clear();
    this.broadcast({ type: 'historyCleared' });
    this.broadcastState();
  }

  public exportSession(format: 'json' | 'har', sanitize = true): string {
    const records = this.retention.getAll();
    if (format === 'har') {
      return this.sanitizer.exportHar(records, sanitize);
    }
    return this.sanitizer.exportJson(records, sanitize);
  }

  public toCurl(id: string, sanitize = true): string | undefined {
    const record = this.retention.get(id);
    if (!record) return undefined;
    return this.sanitizer.toCurl(record, sanitize);
  }

  public updateSettings(newSettings: RetentionSettings): void {
    this.settings = newSettings;
    this.normalizer.setMaxBodyBytes(newSettings.maxBodySizeBytes);
    this.retention.updateSettings(newSettings);
    this.sanitizer.updateRules(newSettings.sensitiveHeaders, newSettings.sensitiveQueryParams);
  }

  public registerWebview(webview: vscode.Webview): vscode.Disposable {
    this.webviews.add(webview);
    this.sendInitialState(webview);

    return {
      dispose: () => {
        this.webviews.delete(webview);
      },
    };
  }

  public sendInitialState(webview: vscode.Webview): void {
    webview.postMessage({
      type: 'initialState',
      state: this.currentState,
      records: this.retention.getAll().map((r) => this.stripHeavyBodies(r)),
    });
  }

  private setupListeners(): void {
    // 1. Profiler batch of summary requests
    this.profiler.on('requests', (rawList: any[]) => {
      if (this.isPaused) return;

      const updatedRecords: NetworkRecord[] = [];
      for (const raw of rawList) {
        const record = this.normalizer.normalizeSummary(raw);
        const stored = this.retention.addOrUpdate(record);
        updatedRecords.push(stored);
      }

      if (updatedRecords.length > 0) {
        this.broadcastRecords(updatedRecords);
      }
    });

    this.profiler.on('log', (msg: string) => this.log(msg));
    this.profiler.on('error', (err: Error) => this.log(`Profiler error: ${err.message}`));

    // 2. Client stream events (Extension stream for companion Dio interceptor)
    this.client.on('streamEvent', ({ streamId, event }: { streamId: string; event: any }) => {
      if (streamId === 'Extension' && event.extensionKind === 'flutter_net_inspector') {
        this.handleCompanionEvent(event.extensionData);
      }
    });

    this.client.on('connected', (uri: string) => {
      this.log(`WebSocket connected to ${VmServiceClient.maskUri(uri)}`);
      this.broadcastState();
    });

    this.client.on('disconnected', () => {
      vscode.commands.executeCommand('setContext', 'flutterNetworkInspector.isConnected', false);
      this.broadcastState();
    });

    // 3. Auto discovery
    this.discovery.on('uriDiscovered', (uri: string) => {
      if (this.settings.autoConnect && !this.client.isConnected) {
        this.log(`Auto-discovered Flutter VM Service: ${VmServiceClient.maskUri(uri)}`);
        this.connect(uri).catch((e) => {
          this.log(`Auto-connect attempt failed: ${e.message}`);
        });
      }
    });

    this.discovery.on('sessionTerminated', () => {
      this.log('Flutter debug session terminated.');
      if (this.client.isConnected) {
        this.disconnect();
      }
    });
  }

  private handleCompanionEvent(data: any): void {
    if (!data || this.isPaused) return;

    const id = String(data.id || '');
    const type = data.type; // 'request' | 'response' | 'error'

    let record = this.retention.get(id);

    if (type === 'request') {
      const uri = String(data.uri || '');
      let path = uri;
      let host = '';
      const queryParams: Record<string, string[]> = {};
      try {
        const u = new URL(uri);
        path = u.pathname;
        host = u.host;
        u.searchParams.forEach((v, k) => {
          if (!queryParams[k]) queryParams[k] = [];
          queryParams[k].push(v);
        });
      } catch {}

      record = {
        id,
        method: String(data.method || 'GET'),
        uri,
        path: path || '/',
        host,
        queryParams,
        startTime: data.startTime || Date.now() * 1000,
        requestHeaders: data.headers || {},
        responseHeaders: {},
        requestBody: data.requestBody,
        state: 'pending',
        source: 'dio_interceptor',
        hasDetails: true,
        isRequestBodyTruncated: false,
        isResponseBodyTruncated: false,
        events: [{ timestamp: data.startTime || Date.now() * 1000, event: 'Dio request dispatched' }],
      };
    } else if (record) {
      record = {
        ...record,
        endTime: data.endTime,
        durationMs: data.durationMs,
        statusCode: data.statusCode,
        statusText: data.statusText,
        responseHeaders: data.responseHeaders || record.responseHeaders,
        responseBody: data.responseBody || record.responseBody,
        error: data.error,
        state: data.state || (data.error ? 'failed' : 'completed'),
        hasDetails: true,
      };
    }

    if (record) {
      const stored = this.retention.addOrUpdate(record);
      this.broadcastRecordUpdate(stored);
    }
  }

  private broadcastRecords(records: NetworkRecord[]): void {
    const stripped = records.map((r) => this.stripHeavyBodies(r));
    this.broadcast({
      type: 'recordsBatch',
      records: stripped,
      totalCount: this.retention.count,
    });
  }

  private broadcastRecordUpdate(record: NetworkRecord): void {
    this.broadcast({
      type: 'recordUpdated',
      record,
      totalCount: this.retention.count,
    });
  }

  private broadcastState(): void {
    this.broadcast({
      type: 'stateChanged',
      state: this.currentState,
    });
  }

  private broadcast(msg: any): void {
    for (const webview of this.webviews) {
      webview.postMessage(msg);
    }
  }

  private stripHeavyBodies(record: NetworkRecord): NetworkRecord {
    // Only strip bodies for list broadcast to keep webview messages small & fast
    return {
      ...record,
      requestBody: undefined,
      responseBody: undefined,
    };
  }

  public log(msg: string): void {
    if (this.settings.debugLogging) {
      this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);
    }
  }

  public dispose(): void {
    this.disconnect();
    this.discovery.dispose();
    this.outputChannel.dispose();
  }
}

