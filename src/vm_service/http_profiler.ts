import { EventEmitter } from 'events';
import { VmServiceClient } from './client';

export interface ProfilerOptions {
  pollingIntervalMs: number;
}

export class HttpProfiler extends EventEmitter {
  private client: VmServiceClient;
  private options: ProfilerOptions;
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private _isRunning = false;
  private activeIsolateId: string | null = null;
  private lastTimestamp = 0;
  private consecutiveEmptyPolls = 0;

  constructor(client: VmServiceClient, options: ProfilerOptions) {
    super();
    this.client = client;
    this.options = options;
  }

  public get isRunning(): boolean {
    return this._isRunning;
  }

  public get currentIsolateId(): string | null {
    return this.activeIsolateId;
  }

  public async start(): Promise<void> {
    if (this._isRunning) return;
    this._isRunning = true;
    this.consecutiveEmptyPolls = 0;

    await this.setupIsolateAndLogging();
    this.scheduleNextPoll(this.options.pollingIntervalMs);
  }

  public stop(): void {
    this._isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.isPolling = false;
  }

  public async clear(): Promise<void> {
    if (!this.client.isConnected || !this.activeIsolateId) return;
    try {
      await this.client.call('ext.dart.io.clearHttpProfile', {
        isolateId: this.activeIsolateId,
      });
      this.lastTimestamp = 0;
    } catch (e: any) {
      this.emit('log', `Warning: Failed to clear VM HTTP profile: ${e.message}`);
    }
  }

  public async getRequestDetail(id: string, isolateId?: string): Promise<any> {
    const targetIsolate = isolateId || this.activeIsolateId;
    if (!this.client.isConnected || !targetIsolate) {
      throw new Error('VM Service not connected or no active isolate');
    }

    const resp = await this.client.call('ext.dart.io.getHttpProfileRequest', {
      isolateId: targetIsolate,
      id,
    });
    return resp;
  }

  private async setupIsolateAndLogging(): Promise<void> {
    try {
      const vm = await this.client.call('getVM');
      const isolates = (vm.isolates || []) as Array<{ id: string; name: string }>;
      if (isolates.length === 0) {
        this.emit('log', 'No isolates found in VM');
        return;
      }

      // Find 'main' application isolate, or fall back to the first non-system isolate
      let target = isolates.find((iso) => iso.name === 'main');
      if (!target) {
        target = isolates[0];
      }
      this.activeIsolateId = target.id;
      this.emit('isolateSelected', target);

      // Enable HTTP timeline logging
      try {
        await this.client.call('ext.dart.io.httpEnableTimelineLogging', {
          isolateId: target.id,
          enabled: 'true',
        });
        this.emit('log', `HTTP timeline logging enabled on isolate ${target.id}`);
      } catch (e: any) {
        // Some runtimes accept boolean true
        try {
          await this.client.call('ext.dart.io.httpEnableTimelineLogging', {
            isolateId: target.id,
            enabled: true,
          });
        } catch {
          this.emit('log', `Notice: ext.dart.io.httpEnableTimelineLogging call returned: ${e.message}`);
        }
      }
    } catch (err: any) {
      this.emit('error', new Error(`Failed to configure isolate logging: ${err.message}`));
    }
  }

  private scheduleNextPoll(delayMs: number): void {
    if (!this._isRunning) return;
    this.pollTimer = setTimeout(async () => {
      await this.poll();
      if (!this._isRunning) return;

      // Adaptive polling delay:
      // When idle, slow down up to 1000ms. When requests are active, poll fast.
      let nextDelay = this.options.pollingIntervalMs;
      if (this.consecutiveEmptyPolls > 5) {
        nextDelay = Math.min(1200, this.options.pollingIntervalMs * 2.5);
      } else if (this.consecutiveEmptyPolls > 2) {
        nextDelay = Math.min(800, this.options.pollingIntervalMs * 1.5);
      }

      this.scheduleNextPoll(nextDelay);
    }, delayMs);
  }

  private async poll(): Promise<void> {
    if (this.isPolling || !this._isRunning || !this.client.isConnected) return;
    this.isPolling = true;

    try {
      if (!this.activeIsolateId) {
        await this.setupIsolateAndLogging();
        if (!this.activeIsolateId) {
          this.isPolling = false;
          return;
        }
      }

      const params: Record<string, any> = {
        isolateId: this.activeIsolateId,
      };
      if (this.lastTimestamp > 0) {
        params.updatedSince = this.lastTimestamp;
      }

      const res = await this.client.call('ext.dart.io.getHttpProfile', params);
      if (res && res.timestamp) {
        this.lastTimestamp = res.timestamp;
      }

      const requests = (res?.requests || []) as any[];
      if (requests.length > 0) {
        this.consecutiveEmptyPolls = 0;
        this.emit('requests', requests);
      } else {
        this.consecutiveEmptyPolls++;
      }
    } catch (e: any) {
      // If isolate was dropped or app restarted, refresh isolate
      if (e.message?.includes('Sentinel') || e.message?.includes('Isolate not found') || e.message?.includes('-32000')) {
        this.emit('log', 'Active isolate invalidated. Refreshing isolate...');
        this.activeIsolateId = null;
        this.lastTimestamp = 0;
      } else {
        this.emit('pollError', e);
      }
    } finally {
      this.isPolling = false;
    }
  }
}

