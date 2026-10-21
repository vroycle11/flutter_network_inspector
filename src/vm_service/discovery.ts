import * as vscode from 'vscode';
import { EventEmitter } from 'events';

export class VmServiceDiscovery extends EventEmitter implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private _activeSession: vscode.DebugSession | null = null;

  constructor() {
    super();
    this.disposables.push(
      vscode.debug.onDidStartDebugSession((session) => this.handleSessionStart(session)),
      vscode.debug.onDidTerminateDebugSession((session) => this.handleSessionTerminate(session)),
      vscode.debug.onDidReceiveDebugSessionCustomEvent((e) => {
        const isDartOrFlutter = e.session.type === 'dart' || e.session.type === 'flutter';
        if (!isDartOrFlutter) return;
        if (e.event === 'dart.debuggerUris' || e.event === 'dart.observatoryUri' || e.event === 'dart.vmServiceUri') {
          const uri = e.body?.vmServiceUri || e.body?.uri || e.body?.observatoryUri;
          if (uri && typeof uri === 'string') {
            this.emit('uriDiscovered', uri);
          }
        }
      })
    );

    // Check currently active session on startup
    if (vscode.debug.activeDebugSession) {
      this.handleSessionStart(vscode.debug.activeDebugSession);
    }
  }

  public get activeSession(): vscode.DebugSession | null {
    return this._activeSession;
  }

  /**
   * Prompts the user to manually enter a Dart VM Service URI.
   */
  public async promptManualUri(): Promise<string | undefined> {
    const input = await vscode.window.showInputBox({
      title: 'Connect to Flutter VM Service',
      prompt: 'Enter the Dart VM Service / DDS URI (http:// or ws://)',
      placeHolder: 'http://127.0.0.1:8181/xyz=/ or ws://127.0.0.1:8181/xyz=/ws',
      ignoreFocusOut: true,
      validateInput: (val) => {
        if (!val || val.trim().length === 0) {
          return 'URI cannot be empty';
        }
        try {
          const trimmed = val.trim();
          const withProto = trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('ws://') || trimmed.startsWith('wss://')
            ? trimmed
            : `http://${trimmed}`;
          new URL(withProto);
          return null;
        } catch {
          return 'Please enter a valid URI';
        }
      },
    });

    return input?.trim();
  }

  private async handleSessionStart(session: vscode.DebugSession): Promise<void> {
    const isDartOrFlutter = session.type === 'dart' || session.type === 'flutter';
    if (!isDartOrFlutter) return;

    this._activeSession = session;
    this.emit('sessionStarted', session);

    // Try finding URI from configuration or custom Dart-Code integration
    let vmUri = this.extractUriFromSession(session);
    if (vmUri) {
      this.emit('uriDiscovered', vmUri);
      return;
    }

    // Try polling session custom request or Dart-Code command
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((r) => setTimeout(r, 600));
      if (this._activeSession !== session) return;

      vmUri = this.extractUriFromSession(session);
      if (vmUri) {
        this.emit('uriDiscovered', vmUri);
        return;
      }

      // Try DAP custom requests supported by Dart-Code
      try {
        const customRes = await session.customRequest('_dart.getVmServiceUri');
        if (customRes?.vmServiceUri && typeof customRes.vmServiceUri === 'string') {
          this.emit('uriDiscovered', customRes.vmServiceUri);
          return;
        }
      } catch (_) {}

      try {
        const customRes2 = await session.customRequest('getVmServiceUri');
        if (customRes2?.vmServiceUri && typeof customRes2.vmServiceUri === 'string') {
          this.emit('uriDiscovered', customRes2.vmServiceUri);
          return;
        }
      } catch (_) {}

      // Check Dart-Code command
      try {
        const uriFromCmd = await vscode.commands.executeCommand<string>('dart.getVmServiceUri');
        if (uriFromCmd && typeof uriFromCmd === 'string') {
          this.emit('uriDiscovered', uriFromCmd);
          return;
        }
      } catch (_) {}
    }
  }

  private handleSessionTerminate(session: vscode.DebugSession): void {
    if (this._activeSession === session) {
      this._activeSession = null;
      this.emit('sessionTerminated', session);
    }
  }

  private extractUriFromSession(session: vscode.DebugSession): string | undefined {
    const config = session.configuration as any;
    if (!config) return undefined;

    return config.vmServiceUri || config.observatoryUri || config.vmserviceUri;
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}

