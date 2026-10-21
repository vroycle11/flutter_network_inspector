import * as vscode from 'vscode';
import { CaptureManager } from '../capture/manager';
import { getInspectorHtml } from '../webview/inspector_html';

export class InspectorPanel {
  public static currentPanel: InspectorPanel | undefined;
  public static readonly viewType = 'flutterNetworkInspector.panel';

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, captureManager: CaptureManager): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (InspectorPanel.currentPanel) {
      InspectorPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      InspectorPanel.viewType,
      'Flutter Network Inspector',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    InspectorPanel.currentPanel = new InspectorPanel(panel, extensionUri, captureManager);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly captureManager: CaptureManager
  ) {
    this.panel = panel;

    const nonce = this.getNonce();
    this.panel.webview.html = getInspectorHtml(nonce);

    const sub = this.captureManager.registerWebview(this.panel.webview);
    this.disposables.push(sub);

    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        await this.handleMessage(msg);
      },
      null,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private async handleMessage(msg: any): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this.captureManager.sendInitialState(this.panel.webview);
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

  public dispose(): void {
    InspectorPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) x.dispose();
    }
  }
}

