import 'dart:convert';
import '../models/network_record.dart';

class HttpProfileNormalizer {
  final int maxBodyBytes;

  const HttpProfileNormalizer({this.maxBodyBytes = 512 * 1024}); // 512 KB default

  NetworkRecord normalizeSummary(Map<String, dynamic> raw) {
    final id = raw['id']?.toString() ?? '';
    final isolateId = raw['isolateId']?.toString();
    final method = (raw['method'] as String?)?.toUpperCase() ?? 'GET';
    final uriStr = raw['uri'] as String? ?? '';

    Uri? parsedUri;
    try {
      parsedUri = Uri.parse(uriStr);
    } catch (_) {
      parsedUri = null;
    }

    final path = parsedUri?.path ?? uriStr;
    final host = parsedUri?.host ?? '';
    final queryParams = parsedUri?.queryParametersAll ?? <String, List<String>>{};

    final startTime = (raw['startTime'] as num?)?.toInt() ?? 0;
    final endTime = (raw['endTime'] as num?)?.toInt();
    double? durationMs;
    if (endTime != null && startTime > 0) {
      durationMs = (endTime - startTime) / 1000.0;
    }

    final reqMap = raw['request'] as Map<String, dynamic>? ?? {};
    final respMap = raw['response'] as Map<String, dynamic>?;

    final requestHeaders = _normalizeHeaders(reqMap['headers']);
    final responseHeaders = _normalizeHeaders(respMap?['headers']);

    final statusCode = (respMap?['statusCode'] as num?)?.toInt();
    final statusText = respMap?['reasonPhrase'] as String?;

    final error = reqMap['error'] as String?;

    String state = 'pending';
    if (error != null && error.isNotEmpty) {
      state = 'failed';
    } else if (statusCode != null) {
      state = (statusCode >= 400) ? 'failed' : 'completed';
    } else if (endTime != null) {
      state = 'completed';
    }

    final eventsRaw = raw['events'] as List?;
    final events = <TimingEvent>[];
    if (eventsRaw != null) {
      for (final e in eventsRaw) {
        if (e is Map<String, dynamic>) {
          events.add(TimingEvent(
            timestamp: (e['timestamp'] as num?)?.toInt() ?? 0,
            event: e['event']?.toString() ?? '',
          ));
        }
      }
    }

    return NetworkRecord(
      id: id,
      isolateId: isolateId,
      method: method,
      uri: uriStr,
      path: path.isEmpty ? '/' : path,
      host: host,
      queryParams: queryParams,
      statusCode: statusCode,
      statusText: statusText,
      startTime: startTime,
      endTime: endTime,
      durationMs: durationMs,
      requestHeaders: requestHeaders,
      responseHeaders: responseHeaders,
      requestSize: (reqMap['contentLength'] as num?)?.toInt(),
      responseSize: (respMap?['contentLength'] as num?)?.toInt(),
      error: error,
      events: events,
      state: state,
      source: 'vm_service',
      hasDetails: false,
    );
  }

  NetworkRecord normalizeDetail(NetworkRecord summary, Map<String, dynamic> rawDetail) {
    // rawDetail may contain updated summary info plus requestBody and responseBody
    final base = normalizeSummary(rawDetail);

    // Decode requestBody
    final (reqBodyStr, reqTruncated, reqBytesLen) = _decodeBody(rawDetail['requestBody']);
    final (respBodyStr, respTruncated, respBytesLen) = _decodeBody(rawDetail['responseBody']);

    final effectiveReqSize = base.requestSize != null && base.requestSize! > 0
        ? base.requestSize
        : (reqBytesLen > 0 ? reqBytesLen : null);

    final effectiveRespSize = base.responseSize != null && base.responseSize! > 0
        ? base.responseSize
        : (respBytesLen > 0 ? respBytesLen : null);

    return base.copyWith(
      id: summary.id,
      isolateId: summary.isolateId ?? base.isolateId,
      requestBody: reqBodyStr,
      responseBody: respBodyStr,
      isRequestBodyTruncated: reqTruncated,
      isResponseBodyTruncated: respTruncated,
      requestSize: effectiveReqSize,
      responseSize: effectiveRespSize,
      hasDetails: true,
    );
  }

  (String?, bool, int) _decodeBody(dynamic rawBody) {
    if (rawBody == null) return (null, false, 0);

    List<int> bytes;
    if (rawBody is List) {
      bytes = rawBody.whereType<int>().toList();
    } else if (rawBody is String) {
      return (rawBody, false, rawBody.length);
    } else {
      return (null, false, 0);
    }

    final totalBytes = bytes.length;
    if (totalBytes == 0) return ('', false, 0);

    bool truncated = false;
    List<int> slice = bytes;
    if (totalBytes > maxBodyBytes) {
      slice = bytes.sublist(0, maxBodyBytes);
      truncated = true;
    }

    try {
      final decoded = utf8.decode(slice, allowMalformed: true);
      return (decoded, truncated, totalBytes);
    } catch (_) {
      return ('[Binary data: $totalBytes bytes]', false, totalBytes);
    }
  }

  Map<String, List<String>> _normalizeHeaders(dynamic rawHeaders) {
    if (rawHeaders == null) return {};
    final result = <String, List<String>>{};

    if (rawHeaders is Map) {
      for (final entry in rawHeaders.entries) {
        final key = entry.key.toString();
        final val = entry.value;
        if (val is List) {
          result[key] = val.map((e) => e.toString()).toList();
        } else if (val != null) {
          result[key] = [val.toString()];
        }
      }
    }
    return result;
  }
}

