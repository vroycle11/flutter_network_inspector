import { EventEmitter } from 'events';
import WebSocket from 'ws';

export interface VmServiceRpcResponse<T = any> {
  jsonrpc: string;
  id: number | string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface VmEvent {
  streamId: string;
  event: {
    type: string;
    kind: string;
    isolate?: {
      id: string;
      name: string;
      number: string;
    };
    timestamp?: number;
    data?: any;
    extensionKind?: string;
    extensionData?: any;
    [key: string]: any;
  };
}

export class VmServiceClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reqId = 1;
  private pendingRequests = new Map<number | string, {
    resolve: (res: any) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
    method: string;
  }>();

  private _isConnected = false;
  private _currentUri: string | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private shouldReconnect = true;
  private activeStreams = new Set<string>();

  public get isConnected(): boolean {
    return this._isConnected;
  }

  public get currentUri(): string | null {
    return this._currentUri;
  }

  /**
   * Sanitizes a URI for logging by replacing the auth token with [REDACTED].
   */
  public static maskUri(uri: string): string {
    try {
      const parsed = new URL(uri);
      if (parsed.pathname && parsed.pathname.length > 1) {
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length > 0) {
          // Token is often the first path component or in query
          return `${parsed.protocol}//${parsed.host}/[REDACTED]/ws`;
        }
      }
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      return '[REDACTED_URI]';
    }
  }

  /**
   * Normalizes an HTTP/WS VM Service URI into a WebSocket URI.
   */
  public static normalizeWsUri(inputUri: string): string {
    let clean = inputUri.trim();
    if (!clean.startsWith('ws://') && !clean.startsWith('wss://') && !clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }

    const url = new URL(clean);
    if (url.protocol === 'http:') url.protocol = 'ws:';
    if (url.protocol === 'https:') url.protocol = 'wss:';

    // Ensure ending with /ws if not present
    if (!url.pathname.endsWith('/ws')) {
      if (url.pathname.endsWith('/')) {
        url.pathname = `${url.pathname}ws`;
      } else {
        url.pathname = `${url.pathname}/ws`;
      }
    }

    return url.toString();
  }

  public async connect(rawUri: string, redirectCount = 0): Promise<void> {
    if (redirectCount > 5) {
      throw new Error(`Too many redirects connecting to VM Service: ${rawUri}`);
    }

    if (redirectCount === 0) {
      this.disconnect();
      this.shouldReconnect = true;
    }

    const wsUri = VmServiceClient.normalizeWsUri(rawUri);
    this._currentUri = wsUri;

    return new Promise((resolve, reject) => {
      let resolved = false;
      let isRedirecting = false;

      try {
        const ws = new WebSocket(wsUri, {
          handshakeTimeout: 8000,
        });
        this.ws = ws;

        ws.on('open', async () => {
          this._isConnected = true;
          this.emit('connected', this._currentUri);
          if (!resolved) {
            resolved = true;
            resolve();
          }
        });

        ws.on('unexpected-response', async (_req, res) => {
          if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location) {
            isRedirecting = true;
            try {
              let redirectTarget = res.headers.location;
              try {
                const parsed = new URL(redirectTarget);
                const ddsUri = parsed.searchParams.get('uri');
                if (ddsUri) {
                  redirectTarget = ddsUri;
                }
              } catch (_) {}

              const nextWsUri = VmServiceClient.normalizeWsUri(redirectTarget);
              this.ws = null;
              await this.connect(nextWsUri, redirectCount + 1);
              if (!resolved) {
                resolved = true;
                resolve();
              }
              return;
            } catch (err: any) {
              if (!resolved) {
                resolved = true;
                reject(err);
              }
              return;
            }
          }

          if (!resolved) {
            resolved = true;
            reject(new Error(`Unexpected server response: ${res.statusCode}`));
          }
        });

        ws.on('message', (data: WebSocket.RawData) => {
          this.handleMessage(data.toString());
        });

        ws.on('error', (err) => {
          if (isRedirecting) {
            return;
          }
          this.emit('error', err);
          if (!resolved) {
            resolved = true;
            reject(err);
          }
        });

        ws.on('close', (code, reason) => {
          if (isRedirecting) {
            return;
          }
          this.handleClose(code, reason.toString());
          if (!resolved) {
            resolved = true;
            reject(new Error(`WebSocket closed before connection: code=${code}`));
          }
        });
      } catch (e) {
        if (!resolved) {
          resolved = true;
          reject(e);
        }
      }
    });
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Cancel all pending requests
    for (const [id, req] of this.pendingRequests.entries()) {
      clearTimeout(req.timer);
      req.reject(new Error(`VM Service disconnected while waiting for request ${id} (${req.method})`));
    }
    this.pendingRequests.clear();

    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }

    if (this._isConnected) {
      this._isConnected = false;
      this.emit('disconnected');
    }
  }

  public async call(method: string, params: Record<string, any> = {}, timeoutMs = 8000): Promise<any> {
    if (!this.ws || !this._isConnected) {
      throw new Error(`VM Service not connected (attempted to call ${method})`);
    }

    const id = this.reqId++;
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timeout (${timeoutMs}ms) waiting for VM Service response to ${method}`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer, method });

      try {
        this.ws!.send(payload, (err) => {
          if (err) {
            clearTimeout(timer);
            this.pendingRequests.delete(id);
            reject(err);
          }
        });
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  public async streamListen(streamId: string): Promise<void> {
    if (this.activeStreams.has(streamId)) return;
    try {
      await this.call('streamListen', { streamId });
      this.activeStreams.add(streamId);
    } catch (e: any) {
      // Stream might already be listened to
      if (!e.message?.includes('Stream already subscribed') && !e.message?.includes('103')) {
        throw e;
      }
      this.activeStreams.add(streamId);
    }
  }

  private handleMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // 1. JSON-RPC responses
    if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
      const pending = this.pendingRequests.get(msg.id)!;
      this.pendingRequests.delete(msg.id);
      clearTimeout(pending.timer);

      if (msg.error) {
        pending.reject(new Error(msg.error.message || `RPC Error code: ${msg.error.code}`));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    // 2. Stream notifications
    if (msg.method === 'streamNotify') {
      const params = msg.params;
      if (!params) return;

      const streamId = params.streamId as string;
      const event = params.event;
      if (!event) return;

      // Handle DDS Redirect event
      if (event.kind === 'DartDevelopmentServiceConnected') {
        const ddsUri = event.uri as string;
        if (ddsUri) {
          this.emit('ddsRedirect', ddsUri);
          // Auto reconnect to DDS
          this.connect(ddsUri).catch((err) => {
            this.emit('error', new Error(`Failed to redirect to DDS: ${err.message}`));
          });
          return;
        }
      }

      this.emit('streamEvent', { streamId, event });
    }
  }

  private handleClose(code: number, reason: string): void {
    const wasConnected = this._isConnected;
    this._isConnected = false;

    // Fail pending requests
    for (const [id, req] of this.pendingRequests.entries()) {
      clearTimeout(req.timer);
      req.reject(new Error(`WebSocket closed (code: ${code}) while waiting for ${req.method}`));
    }
    this.pendingRequests.clear();

    if (wasConnected) {
      this.emit('disconnected', { code, reason });
    }
  }
}

