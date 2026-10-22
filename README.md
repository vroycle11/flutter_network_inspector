# Flutter Network Inspector for VS Code

<p align="center">
  <img src="https://open-vsx.org/api/VroyCLe/flutter-network-inspector/latest/file/icon.png" width="128" height="128" alt="Flutter Network Inspector" />
</p>

![Version](https://img.shields.io/badge/version-1.0.1-blue.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
[![GitHub](https://img.shields.io/badge/GitHub-flutter__network__inspector-181717?logo=github)](https://github.com/vroycle11/flutter_network_inspector)

A fast, lightweight, in-editor alternative to Flutter DevTools Network Inspector for Visual Studio Code. Inspect HTTP & HTTPS traffic from your running Flutter applications (Dio and `dart:io` `HttpClient`) on Android, iOS, macOS, Windows, and Linux without switching to an external browser window.

---

## Features

- **Zero-Configuration Capture**: Automatically connects to your running Flutter application via the Dart VM Service / DDS and profiles network requests in real time without requiring any application code changes.
- **Full Dio Support**: Inspects Dio GET, POST, PUT, DELETE, and PATCH requests, headers, query parameters, status codes, and response bodies on Android & iOS.
- **Companion Interceptor**: Includes an optional companion package `flutter_network_inspector_dio` for inspecting FormData uploads, custom network adapters (`cupertino_http`, `cronet_http`), and detailed Dio error types.
- **High-Performance Virtualized Table**: Custom virtualized DOM viewport handles thousands of historical requests smoothly at 60 FPS without UI freezes or memory bloat.
- **Interactive JSON Inspector**: Syntax-highlighted, collapsible tree viewer with lazy rendering, copy-by-value, and search for complex JSON payloads.
- **Memory Retention Policies**: Strict in-memory bounds on retained request count (`maxRequests`), individual body size (`maxBodySizeBytes`), and total body budget (`maxTotalBodyBudgetMB`) with automatic body eviction.
- **Security & Privacy First**: Automatically redacts `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie`, and sensitive query parameters (`token`, `api_key`, `secret`, `password`) in UI, cURL, and exports.
- **cURL & HAR 1.2 Export**: Copy sanitized cURL commands directly to your clipboard or export entire network sessions to standard HTTP Archive (HAR 1.2) for analysis in Charles, Proxyman, or Postman.
- **Native VS Code Look & Feel**: Built exclusively with official VS Code theme variables and accessible styling supporting both Dark and Light themes.

---

## Installation & Getting Started

### 1. Install Extension
Download the `.vsix` file or install from the VS Code Extensions panel:
```bash
code --install-extension flutter-network-inspector-1.0.1.vsix
```

### 2. Launch Your Flutter Application
Start your Flutter app in VS Code debugging mode (`F5` or `Run -> Start Debugging`).

### 3. Open the Network Inspector
Open the Flutter Network Inspector by clicking the Network icon in the VS Code Activity Bar (left sidebar) or via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):
```text
Flutter Network Inspector: Open Inspector Panel
```

### 4. Connection
- **Automatic**: If `flutterNetworkInspector.autoConnect` is enabled (default), the extension discovers your active Flutter debug session and connects automatically.
- **Manual**: If automatic discovery is disabled or you are connecting to a remote device, run:
  ```text
  Flutter Network Inspector: Connect to VM Service
  ```
  and enter your VM Service / DDS URI (e.g., `http://127.0.0.1:8181/T-6POZAeusQ=/` or `ws://127.0.0.1:8181/T-6POZAeusQ=/ws`). Authentication tokens are automatically masked in all extension logs.

---

## Optional Companion Dio Interceptor

For standard JSON REST APIs, zero application changes are required.

If you are using multipart `FormData` uploads, custom network adapters (such as `cupertino_http` or `cronet_http`), or need explicit `DioExceptionType` inspection, integrate the optional companion interceptor:

### `pubspec.yaml`
```yaml
dependencies:
  dio: ^5.0.0
  flutter_network_inspector_dio: ^1.0.0
```

### In Your Dart Code
```dart
import 'package:dio/dio.dart';
import 'package:flutter_network_inspector_dio/flutter_network_inspector_dio.dart';

final dio = Dio();
dio.interceptors.add(DioNetworkInspector());
```

---

## Extension Settings

Configure the extension in VS Code Settings (`Preferences -> Settings -> Flutter Network Inspector`):

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `flutterNetworkInspector.autoConnect` | `boolean` | `true` | Automatically connect to running Flutter debug sessions. |
| `flutterNetworkInspector.pollingIntervalMs` | `number` | `400` | Adaptive polling interval (ms) for VM Service HTTP profiling. |
| `flutterNetworkInspector.maxRequests` | `number` | `1000` | Maximum number of retained requests in memory before FIFO eviction. |
| `flutterNetworkInspector.maxBodySizeBytes` | `number` | `524288` | Maximum in-memory size per request or response body (512 KB). |
| `flutterNetworkInspector.maxTotalBodyBudgetMB` | `number` | `20` | Total body memory budget in MB before evicting bodies of older requests. |
| `flutterNetworkInspector.sensitiveHeaders` | `array` | `["authorization", ...]` | Headers to redact automatically in UI, cURL, and exports. |
| `flutterNetworkInspector.sensitiveQueryParams` | `array` | `["token", "api_key", ...]` | URL query parameters to redact automatically in UI and exports. |
| `flutterNetworkInspector.debugLogging` | `boolean` | `false` | Enable verbose diagnostic logging to the Output Channel. |

---

## Development & Testing

### Prerequisites
- Node.js (>= 20.x)
- Dart SDK (>= 3.0.0)
- Flutter SDK (>= 3.0.0)

### Build the VS Code Extension
```bash
npm install
npm run compile
```

### Run Automated Tests
```bash
# Run TypeScript extension tests
npm test

# Run Dart Engine unit tests
cd dart_engine
dart test
dart analyze

# Run Companion Dio package tests
cd ../packages/flutter_network_inspector_dio
dart test
dart analyze

# Run Example Flutter test app
cd ../../example
flutter test
flutter analyze
```

### Package into `.vsix`
```bash
npx vsce package
```

---

## Architecture & Technical Documentation
- [Architecture Deep Dive](docs/architecture.md)
- [Dio Compatibility & Guide](docs/dio_compatibility.md)
- [Performance & Benchmark Report](docs/performance.md)

---

## Author & Maintainer

- **Developer**: [Vaibhav Ghadge](https://www.linkedin.com/in/vaibhav-ghadge-315841168/)
- **Publisher**: `VroyCLe`
- **GitHub Repository**: [https://github.com/vroycle11/flutter_network_inspector](https://github.com/vroycle11/flutter_network_inspector)
- **LinkedIn**: [https://www.linkedin.com/in/vaibhav-ghadge-315841168/](https://www.linkedin.com/in/vaibhav-ghadge-315841168/)

---

## License
[MIT](LICENSE)
