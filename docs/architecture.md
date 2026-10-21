# Flutter Network Inspector Architecture

## 1. System Overview

Flutter Network Inspector provides an in-editor alternative to Flutter DevTools Network Inspector. It bridges the running Flutter application and the VS Code interface with high performance, strict memory budgeting, and zero application changes required.

```
┌────────────────────────────────────────────────────────┐
│               Running Flutter Application               │
│  - Dio / HttpClient (dart:io)                          │
│  - Dart VM Service / DDS (Dart Development Service)   │
│  - Optional: flutter_network_inspector_dio Interceptor  │
└──────────────────────────┬─────────────────────────────┘
                           │ WebSocket JSON-RPC 2.0
                           │ (ext.dart.io.getHttpProfile)
                           ▼
┌────────────────────────────────────────────────────────┐
│             VS Code Extension Host (Node.js)           │
│                                                        │
│  ┌────────────────────┐      ┌──────────────────────┐  │
│  │ VmServiceDiscovery │ ───► │   VmServiceClient    │  │
│  │ (VS Code Debug API)│      │  (DDS Auto-Redirect) │  │
│  └────────────────────┘      └──────────┬───────────┘  │
│                                         │              │
│                                         ▼              │
│                              ┌──────────────────────┐  │
│                              │     HttpProfiler     │  │
│                              │  (Adaptive Polling)  │  │
│                              └──────────┬───────────┘  │
│                                         │              │
│                                         ▼              │
│  ┌──────────────────────────────────────────────────┐  │
│  │                  CaptureManager                  │  │
│  │  - CaptureNormalizer (UTF-8 byte decoding)      │  │
│  │  - RetentionManager  (Bounded memory & budgets)  │  │
│  │  - DataSanitizer     (Auth & token redaction)   │  │
│  └──────────────────────────────┬───────────────────┘  │
│                                 │ postMessage          │
│                                 ▼                      │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Inspector Webview (Virtualized UI)       │  │
│  │  - Virtual DOM Viewport (20-30 rows constant)    │  │
│  │  - On-Demand Request Detail Inspection           │  │
│  │  - Collapsible Lazy JSON Tree Viewer             │  │
│  │  - Theme-Aware VS Code CSS Integration           │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

---

## 2. Component Breakdown

### A. VmServiceClient (`src/vm_service/client.ts`)
- Implements a resilient WebSocket JSON-RPC 2.0 client for Dart VM Service.
- Detects the `DartDevelopmentServiceConnected` event sent when DDS attaches to the Dart VM, automatically redirecting the WebSocket to the DDS URI.
- Masks authentication tokens in all logs and status messages.
- Subscribes to `Isolate` and `Extension` streams.

### B. HttpProfiler (`src/vm_service/http_profiler.ts`)
- Calls `ext.dart.io.httpEnableTimelineLogging` on target isolates to activate HTTP profiling in `dart:io`.
- Uses `ext.dart.io.getHttpProfile` with `updatedSince` timestamp to retrieve only newly created or updated requests (delta fetching).
- Implements an adaptive polling algorithm: polls every 400ms during active traffic and backs off up to 1200ms when idle.
- Fetches full request/response bodies on demand via `ext.dart.io.getHttpProfileRequest` only when the user selects a request in the UI.

### C. Capture Normalizer (`src/capture/normalizer.ts` & `dart_engine/lib/services/normalizer.dart`)
- Translates VM Service summary and detail objects into standardized `NetworkRecord` models.
- Safely decodes UTF-8 byte arrays into text or labels binary data.
- Calculates durations and extracts timing event milestones.

### D. Retention & Memory Management (`src/capture/retention.ts` & `dart_engine/lib/services/retention_manager.dart`)
- **Bounded Request Count**: Default maximum 1,000 requests. Oldest records are discarded on arrival.
- **Per-Body Limit**: Bodies larger than 512KB are truncated safely.
- **Total Body Storage Budget**: Default 20MB. If total body memory exceeds 20MB, the oldest response/request bodies are evicted first (replaced with `[Body evicted by memory retention policy]`), leaving headers, URLs, status codes, and timings intact.

### E. Data Sanitizer & Privacy (`src/capture/sanitizer.ts`)
- Automatically redacts sensitive headers: `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key`, etc.
- Automatically redacts sensitive URL query parameters: `token`, `access_token`, `api_key`, `secret`, `password`, `key`, etc.
- Recursively masks credential keys in JSON bodies.
- Exports sanitized sessions to standard HAR 1.2 or JSON format.
- Generates safe cURL commands with masked tokens.

### F. Webview Layer (`src/webview/inspector_html.ts`)
- Fast virtualized table: computes scroll offset and renders only visible records (approx. 20-30 DOM elements) regardless of whether 100 or 10,000 requests are stored.
- Self-contained vanilla JavaScript with zero external scripts or CDNs.
- Strict Content Security Policy (`default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-...';`).
- Uses VS Code CSS variables for native dark/light theme integration.

