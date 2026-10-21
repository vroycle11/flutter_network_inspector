import * as vscode from 'vscode';
import { CaptureManager } from '../capture/manager';
import { getInspectorHtml } from '../webview/inspector_html';

export class InspectorViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'flutterNetworkInspector.view';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly captureManager: CaptureManager
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    const nonce = this.getNonce();
    webviewView.webview.html = getInspectorHtml(nonce);

    const sub = this.captureManager.registerWebview(webviewView.webview);
    webviewView.onDidDispose(() => sub.dispose());

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      await this.handleMessage(msg);
    });
  }

  private async handleMessage(msg: any): Promise<void> {
    switch (msg.type) {
      case 'ready':
        if (this._view) {
          this.captureManager.sendInitialState(this._view.webview);
        }
        break;

      case 'selectRecord':
        await this.captureManager.getRequestDetail(msg.id);
        break;

      case 'connect':
        await vscode.commands.executeCommand('flutter-network-inspector.connect');
        break;

      case 'disconnect':
        this.captureManager.disconnect();
        break;

      case 'pause':
        this.captureManager.pause();
        break;

      case 'resume':
        this.captureManager.resume();
        break;

      case 'clear':
        this.captureManager.clearHistory();
        break;

      case 'export':
        await vscode.commands.executeCommand('flutter-network-inspector.exportSession');
        break;

      case 'copy':
        if (msg.text) {
          await vscode.env.clipboard.writeText(msg.text);
          vscode.window.showInformationMessage(`Copied ${msg.label || 'content'} to clipboard.`);
        }
        break;

      case 'copyCurl':
        if (msg.id) {
          const curl = this.captureManager.toCurl(msg.id, true);
          if (curl) {
            await vscode.env.clipboard.writeText(curl);
            vscode.window.showInformationMessage('Copied cURL command to clipboard (sanitized).');
          }
        }
        break;
    }
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}

