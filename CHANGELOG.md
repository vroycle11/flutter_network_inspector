# Changelog

All notable changes to the "Flutter Network Inspector" extension will be documented in this file.

## [1.0.2] - 2026-10-22

### Bug Fixes
- **Response Body Inspection**: Fixed an issue where switching between previously inspected requests would continue displaying the last clicked request's response body instead of updating to the currently selected API's data.
- **Detail Persistence**: Ensured `RetentionManager` preserves already fetched details and bodies when summary updates arrive from background VM Service profiler polling.
- **Webview Selection Sync**: Immediately render cached request details upon clicking a row in the virtual list and broadcast record updates when details are retrieved or already present.

## [1.0.1] - 2026-10-16

### Improvements
- **Branding & Visuals**: Updated official extension logo and icons to VroyCLe branding.
- **Marketplace Compatibility**: Fixed image display in README when viewed on Open VSX and VS Code extension marketplace pages.
- **Packaging**: Resolved relative asset rewrites during VSIX generation.

## [1.0.0] - 2026-10-15

### Initial Release
- **Real-Time Network Capture**: Native integration with Dart VM Service HTTP profiling (`ext.dart.io.getHttpProfile`, `ext.dart.io.getHttpProfileRequest`).
- **Zero-Configuration Capture**: Inspects Dio and `dart:io` `HttpClient` traffic without modifying application source code.
- **Companion Dio Interceptor**: Optional companion package `flutter_network_inspector_dio` for inspecting FormData uploads, custom adapters, and Dio-specific error details.
- **High-Performance Virtualized Table**: Renders only visible rows in DOM, supporting 10,000+ requests without extension lag.
- **Interactive JSON Inspector**: Collapsible JSON tree, search within payload, copy value, and copy formatted JSON.
- **Advanced Filtering & Search**: Instant substring search, method filters (GET, POST, PUT, DELETE), status code filters (2xx, 4xx, 5xx), and error filters.
- **Safe Memory Retention**: Configurable limits on retained request count, per-body size, and total body memory budget with body eviction.
- **Privacy & Security Redaction**: Automatic redaction of `Authorization`, `Cookie`, `Set-Cookie`, and sensitive query parameters (`token`, `api_key`, `secret`, `password`).
- **Exporting Capabilities**: One-click export to standard HAR 1.2 (for Charles, Proxyman, DevTools) and sanitized JSON session formats.
- **cURL Generation**: Generates reproducible cURL commands with sensitive headers redacted.

