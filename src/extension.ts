import * as vscode from 'vscode';
import { CaptureManager } from './capture/manager';
import { InspectorViewProvider } from './providers/inspector_view_provider';
import { VmServiceDiscovery } from './vm_service/discovery';
import { registerCommands } from './commands';
import { RetentionSettings } from './types';

let captureManager: CaptureManager | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;

export function activate(context: vscode.ExtensionContext) {
  const settings = readSettings();
  const discovery = new VmServiceDiscovery();
  captureManager = new CaptureManager(settings);

  // Register Activity Bar Webview View Provider
  const provider = new InspectorViewProvider(context.extensionUri, captureManager);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(InspectorViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Register commands
  registerCommands(context, captureManager, discovery);

  // Status Bar Item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'flutter-network-inspector.openInspector';
  statusBarItem.tooltip = 'Click to open Flutter Network Inspector';
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Watch captureManager events for status bar updates
  captureManager.on('stateChanged', () => updateStatusBar());

  // Watch configuration updates
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('flutterNetworkInspector')) {
        const newSettings = readSettings();
        captureManager?.updateSettings(newSettings);
      }
    })
  );

  context.subscriptions.push(captureManager);
  context.subscriptions.push(discovery);
}

export function deactivate() {
  if (captureManager) {
    captureManager.dispose();
    captureManager = undefined;
  }
  if (statusBarItem) {
    statusBarItem.dispose();
    statusBarItem = undefined;
  }
}

function readSettings(): RetentionSettings {
  const config = vscode.workspace.getConfiguration('flutterNetworkInspector');
  return {
    autoConnect: config.get<boolean>('autoConnect', true),
    pollingIntervalMs: config.get<number>('pollingIntervalMs', 400),
    maxRequests: config.get<number>('maxRequests', 1000),
    maxBodySizeBytes: config.get<number>('maxBodySizeBytes', 512 * 1024),
    maxTotalBodyBudgetMB: config.get<number>('maxTotalBodyBudgetMB', 20),
    sensitiveHeaders: config.get<string[]>('sensitiveHeaders', [
      'authorization',
      'proxy-authorization',
      'cookie',
      'set-cookie',
      'x-api-key',
      'x-auth-token',
    ]),
    sensitiveQueryParams: config.get<string[]>('sensitiveQueryParams', [
      'token',
      'access_token',
      'api_key',
      'apikey',
      'secret',
      'password',
      'key',
      'auth',
      'signature',
      'bearer',
    ]),
    debugLogging: config.get<boolean>('debugLogging', false),
  };
}

function updateStatusBar() {
  if (!statusBarItem || !captureManager) return;
  const state = captureManager.currentState;
  if (state.isConnected) {
    statusBarItem.text = `$(pulse) Net: ${state.totalRecords} reqs`;
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = '$(debug-disconnect) Net: Offline';
    statusBarItem.backgroundColor = undefined;
  }
}

