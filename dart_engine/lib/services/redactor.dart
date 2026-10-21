import 'dart:convert';
import '../models/network_record.dart';

class NetworkDataRedactor {
  final Set<String> sensitiveHeaders;
  final Set<String> sensitiveQueryParams;

  NetworkDataRedactor({
    Set<String>? sensitiveHeaders,
    Set<String>? sensitiveQueryParams,
  })  : sensitiveHeaders = (sensitiveHeaders ?? {
          'authorization',
          'proxy-authorization',
          'cookie',
          'set-cookie',
          'x-api-key',
          'x-auth-token',
        }).map((s) => s.toLowerCase()).toSet(),
        sensitiveQueryParams = (sensitiveQueryParams ?? {
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
        }).map((s) => s.toLowerCase()).toSet();

  NetworkRecord redactRecord(NetworkRecord record) {
    // Redact headers
    final redactedReqHeaders = _redactHeaders(record.requestHeaders);
    final redactedRespHeaders = _redactHeaders(record.responseHeaders);

    // Redact query params & URI
    final (redactedUri, redactedQueryParams) = _redactUri(record.uri, record.queryParams);

    // Redact bodies if containing JSON credentials
    final redactedReqBody = _redactJsonBody(record.requestBody);
    final redactedRespBody = _redactJsonBody(record.responseBody);

    return record.copyWith(
      uri: redactedUri,
      queryParams: redactedQueryParams,
      requestHeaders: redactedReqHeaders,
      responseHeaders: redactedRespHeaders,
      requestBody: redactedReqBody,
      responseBody: redactedRespBody,
    );
  }

  Map<String, List<String>> _redactHeaders(Map<String, List<String>> headers) {
    final result = <String, List<String>>{};
    for (final entry in headers.entries) {
      if (sensitiveHeaders.contains(entry.key.toLowerCase())) {
        result[entry.key] = ['[REDACTED]'];
      } else {
        result[entry.key] = List.from(entry.value);
      }
    }
    return result;
  }

  (String, Map<String, List<String>>) _redactUri(String uriStr, Map<String, List<String>> currentParams) {
    Uri? uri;
    try {
      uri = Uri.parse(uriStr);
    } catch (_) {
      return (uriStr, currentParams);
    }

    if (uri.queryParameters.isEmpty && currentParams.isEmpty) {
      return (uriStr, currentParams);
    }

    final newParams = <String, List<String>>{};
    bool changed = false;

    // Use currentParams if present, else parsed query parameters
    final sourceParams = currentParams.isNotEmpty ? currentParams : uri.queryParametersAll;

    for (final entry in sourceParams.entries) {
      if (sensitiveQueryParams.contains(entry.key.toLowerCase())) {
        newParams[entry.key] = ['[REDACTED]'];
        changed = true;
      } else {
        newParams[entry.key] = List.from(entry.value);
      }
    }

    if (!changed) {
      return (uriStr, sourceParams);
    }

    final newUri = uri.replace(queryParameters: newParams);
    return (newUri.toString(), newParams);
  }

  String? _redactJsonBody(String? body) {
    if (body == null || body.trim().isEmpty) return body;
    final trimmed = body.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return body;

    try {
      final parsed = jsonDecode(trimmed);
      final redacted = _redactJsonValue(parsed);
      return jsonEncode(redacted);
    } catch (_) {
      return body;
    }
  }

  dynamic _redactJsonValue(dynamic value) {
    if (value is Map<String, dynamic>) {
      final result = <String, dynamic>{};
      for (final entry in value.entries) {
        if (sensitiveQueryParams.contains(entry.key.toLowerCase())) {
          result[entry.key] = '[REDACTED]';
        } else {
          result[entry.key] = _redactJsonValue(entry.value);
        }
      }
      return result;
    } else if (value is List) {
      return value.map(_redactJsonValue).toList();
    } else if (value is String) {
      final trimmed = value.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          final parsed = jsonDecode(trimmed);
          final redacted = _redactJsonValue(parsed);
          return jsonEncode(redacted);
        } catch (_) {
          return value;
        }
      }
    }
    return value;
  }
}

