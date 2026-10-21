import 'dart:convert';
import '../models/network_record.dart';
import 'redactor.dart';

class NetworkExportService {
  final NetworkDataRedactor redactor;

  NetworkExportService({NetworkDataRedactor? redactor})
      : redactor = redactor ?? NetworkDataRedactor();

  /// Exports a list of records as sanitized JSON session.
  String exportSessionJson(List<NetworkRecord> records, {bool sanitize = true}) {
    final processed = sanitize ? records.map(redactor.redactRecord).toList() : records;
    final map = {
      'generator': 'Flutter Network Inspector',
      'version': '1.0.0',
      'exportedAt': DateTime.now().toIso8601String(),
      'totalRecords': processed.length,
      'records': processed.map((r) => r.toJson()).toList(),
    };
    return const JsonEncoder.withIndent('  ').convert(map);
  }

  /// Exports a list of records as standard HAR (HTTP Archive) 1.2.
  String exportHar(List<NetworkRecord> records, {bool sanitize = true}) {
    final processed = sanitize ? records.map(redactor.redactRecord).toList() : records;

    final entries = processed.map((r) {
      final startedDateTime = DateTime.fromMicrosecondsSinceEpoch(
        r.startTime,
        isUtc: true,
      ).toIso8601String();

      final time = r.durationMs ?? 0.0;

      // Request headers for HAR
      final reqHeaders = <Map<String, String>>[];
      for (final entry in r.requestHeaders.entries) {
        for (final val in entry.value) {
          reqHeaders.add({'name': entry.key, 'value': val});
        }
      }

      // Query string for HAR
      final queryString = <Map<String, String>>[];
      for (final entry in r.queryParams.entries) {
        for (final val in entry.value) {
          queryString.add({'name': entry.key, 'value': val});
        }
      }

      // Response headers for HAR
      final respHeaders = <Map<String, String>>[];
      for (final entry in r.responseHeaders.entries) {
        for (final val in entry.value) {
          respHeaders.add({'name': entry.key, 'value': val});
        }
      }

      // Request post data
      Map<String, dynamic>? postData;
      if (r.requestBody != null) {
        final mimeType = r.requestHeaders['content-type']?.firstOrNull ?? 'text/plain';
        postData = {
          'mimeType': mimeType,
          'text': r.requestBody,
        };
      }

      // Response content
      final respMimeType = r.responseHeaders['content-type']?.firstOrNull ?? 'application/json';
      final content = {
        'size': r.responseSize ?? (r.responseBody?.length ?? 0),
        'mimeType': respMimeType,
        if (r.responseBody != null) 'text': r.responseBody,
      };

      return {
        'startedDateTime': startedDateTime,
        'time': time,
        'request': {
          'method': r.method,
          'url': r.uri,
          'httpVersion': 'HTTP/1.1',
          'headers': reqHeaders,
          'queryString': queryString,
          'cookies': [],
          'headersSize': -1,
          'bodySize': r.requestSize ?? (r.requestBody?.length ?? 0),
          if (postData != null) 'postData': postData,
        },
        'response': {
          'status': r.statusCode ?? (r.error != null ? 0 : 200),
          'statusText': r.statusText ?? (r.error != null ? 'Error' : 'OK'),
          'httpVersion': 'HTTP/1.1',
          'headers': respHeaders,
          'cookies': [],
          'content': content,
          'redirectURL': '',
          'headersSize': -1,
          'bodySize': r.responseSize ?? (r.responseBody?.length ?? 0),
        },
        'cache': {},
        'timings': {
          'send': 0,
          'wait': time,
          'receive': 0,
        },
      };
    }).toList();

    final har = {
      'log': {
        'version': '1.2',
        'creator': {
          'name': 'Flutter Network Inspector',
          'version': '1.0.0',
        },
        'entries': entries,
      }
    };

    return const JsonEncoder.withIndent('  ').convert(har);
  }

  /// Generates a faithful cURL command from a NetworkRecord.
  static String toCurl(NetworkRecord record, {bool sanitize = true}) {
    final buffer = StringBuffer('curl -X ${record.method} ');
    buffer.write('\'${record.uri}\'');

    for (final entry in record.requestHeaders.entries) {
      final headerName = entry.key;
      for (final val in entry.value) {
        final displayVal = (sanitize && (headerName.toLowerCase() == 'authorization' || headerName.toLowerCase() == 'cookie'))
            ? '[REDACTED]'
            : val;
        buffer.write(' \\\n  -H \'$headerName: $displayVal\'');
      }
    }

    if (record.requestBody != null && record.requestBody!.isNotEmpty) {
      final escaped = record.requestBody!.replaceAll('\'', '\'\\\'\'');
      buffer.write(' \\\n  --data \'$escaped\'');
    }

    return buffer.toString();
  }
}

