# Dio Compatibility & Network Profiling Guide

## Overview
Flutter Network Inspector is engineered specifically for Flutter developers using **Dio** and `dart:io` `HttpClient` on **Android**, **iOS**, **macOS**, **Linux**, and **Windows**.

The extension supports two complementary capture modes:
1. **Zero-Configuration Mode** (Default): Uses native Dart VM Service HTTP profiling (`ext.dart.io.getHttpProfile`). Works immediately with zero application code changes.
2. **Companion Adapter Mode** (Optional): Uses `flutter_network_inspector_dio` companion interceptor. Ideal for multipart FormData inspection, custom network adapters, or when detailed Dio error types are required.

---

## 1. Zero-Configuration Mode (Dart VM Service HTTP Profiling)

On Android and iOS, Dio uses Dart's `dart:io` `HttpClient` through `IOHttpClientAdapter` by default. Because of this, every network request made with Dio is automatically captured by the Dart runtime's internal HTTP profiler.

### What is Captured Without Application Changes:
- **HTTP Methods**: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS.
- **Full URLs**: Complete endpoint, host, path, and query parameters.
- **Request Headers**: All headers sent by Dio and Dart `HttpClient` (including `User-Agent`, `Authorization`, `Content-Type`, custom headers).
- **Response Headers**: All headers returned by the server (including `Set-Cookie`, `Content-Type`, cache headers).
- **HTTP Status Codes**: Complete status code (`200`, `201`, `400`, `401`, `404`, `500`, etc.) and status reason phrase (`OK`, `Not Found`).
- **Timing & Waterfall**:
  - Connection established timestamp.
  - Request sent timestamp.
  - Time To First Byte (TTFB / Waiting).
  - Content download duration.
- **Request Body**: Captured as UTF-8 byte stream from `ext.dart.io.getHttpProfileRequest` for JSON, URL-encoded, or raw text payloads.
- **Response Body**: Captured as UTF-8 byte stream from `ext.dart.io.getHttpProfileRequest` for JSON, HTML, or text responses.
- **Transport Errors**: Socket errors, connection refused, DNS lookup failures, timeouts.

---

## 2. When to Use the Companion Dio Package

While VM Service HTTP profiling is exceptional for standard REST APIs, certain advanced networking features benefit from the optional companion package:

| Feature | Pure VM Service Capture | With `flutter_network_inspector_dio` |
| :--- | :--- | :--- |
| **Standard JSON Requests & Responses** | Supported natively | Supported |
| **Authentication & Query Parameters** | Supported natively | Supported |
| **Timing & Status Codes** | Supported natively | Supported |
| **Multipart / FormData Fields** | Raw chunked byte stream only | **Structured fields & file metadata** (filename, size, MIME type) |
| **Custom Network Adapters** (e.g. `cupertino_http`, `cronet_http`) | Bypasses `dart:io` | **Captured via Dio Interceptor** |
| **Dio Error Types** (`cancel`, `connectionTimeout`) | Generic SocketException | **Explicit `DioExceptionType`** |
| **Flutter Web** | `dart:io` unavailable on Web | **Supported via Interceptor** |

---

## 3. How to Integrate the Optional Companion Interceptor

If you wish to inspect FormData uploads or use custom adapters, add the companion package to your `pubspec.yaml`:

```yaml
dependencies:
  dio: ^5.0.0
  flutter_network_inspector_dio: ^1.0.0
```

Then add the interceptor to your Dio instance:

```dart
import 'package:dio/dio.dart';
import 'package:flutter_network_inspector_dio/flutter_network_inspector_dio.dart';

final dio = Dio();

// Attach the inspector interceptor
dio.interceptors.add(DioNetworkInspector(
  logToConsole: false, // Set true to print debug messages to Flutter logs
));
```

The interceptor automatically uses `dart:developer` `postEvent('flutter_net_inspector', ...)` to stream events across the VM Service Extension stream directly into VS Code, with zero network overhead.

