import * as vscode from 'vscode';
import * as path from 'path';
import { CaptureManager } from '../capture/manager';
import { InspectorPanel } from '../providers/inspector_panel';
import { VmServiceDiscovery } from '../vm_service/discovery';

export function registerCommands(
  context: vscode.ExtensionContext,
  captureManager: CaptureManager,
  discovery: VmServiceDiscovery
): void {
  // 1. Open Inspector Panel
  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-network-inspector.openInspector', () => {
      InspectorPanel.createOrShow(context.extensionUri, captureManager);
    })
  );

  // 1b. Focus Sidebar View
  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-network-inspector.focusView', async () => {
      await vscode.commands.executeCommand('flutterNetworkInspector.view.focus');
    })
  );

  // 2. Connect
  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-network-inspector.connect', async () => {
      const uri = await discovery.promptManualUri();
      if (uri) {
        await captureManager.connect(uri);
      }
    })
  );

  // 3. Disconnect
  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-network-inspector.disconnect', () => {
      captureManager.disconnect();
    })
  );

  // 4. Clear History
  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-network-inspector.clearHistory', () => {
      captureManager.clearHistory();
      vscode.window.showInformationMessage('Flutter network history cleared.');
    })
  );

  // 5. Pause Capture
  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-network-inspector.pauseCapture', () => {
      captureManager.pause();
    })
  );

  // 6. Resume Capture
  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-network-inspector.resumeCapture', () => {
      captureManager.resume();
    })
  );

  // 7. Export Session
  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-network-inspector.exportSession', async () => {
      const formatChoice = await vscode.window.showQuickPick(
        [
          { label: 'HAR (HTTP Archive 1.2)', description: 'Standard format for Charles, Proxyman, DevTools', format: 'har' as const },
          { label: 'JSON Session', description: 'Flutter Network Inspector JSON format', format: 'json' as const },
        ],
        { placeHolder: 'Select export format' }
      );
      if (!formatChoice) return;

      const sanitizeChoice = await vscode.window.showQuickPick(
        [
          { label: 'Sanitize Secrets (Recommended)', description: 'Redact Authorization, cookies, and sensitive tokens', sanitize: true },
          { label: 'Raw (Includes Secrets)', description: 'Preserve exact headers and tokens', sanitize: false },
        ],
        { placeHolder: 'Sanitize sensitive data?' }
      );
      if (!sanitizeChoice) return;

      const ext = formatChoice.format === 'har' ? 'har' : 'json';
      const filename = `network_session_${Date.now()}.${ext}`;

      let defaultUri: vscode.Uri | undefined;
      const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (wsFolder) {
        defaultUri = vscode.Uri.joinPath(wsFolder, filename);
      } else if (process.env.HOME) {
        defaultUri = vscode.Uri.file(path.join(process.env.HOME, filename));
      } else {
        defaultUri = vscode.Uri.file(path.join(process.cwd(), filename));
      }

      const fileUri = await vscode.window.showSaveDialog({
        defaultUri,
        saveLabel: 'Export Network Session',
        title: 'Export Flutter Network Session',
        filters: formatChoice.format === 'har'
          ? { 'HTTP Archive': ['har'] }
          : { 'JSON': ['json'] },
      });

      if (!fileUri) return;

      try {
        const content = captureManager.exportSession(formatChoice.format, sanitizeChoice.sanitize);
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
        vscode.window.showInformationMessage(`Network session exported successfully to ${fileUri.fsPath}`);
      } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to export network session: ${e.message}`);
      }
    })
  );
}

