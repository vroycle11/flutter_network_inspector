import 'dart:convert';
import 'dart:developer' as developer;
import 'package:dio/dio.dart';

/// Companion Dio Interceptor for Flutter Network Inspector.
///
/// Sends rich Dio lifecycle events (including FormData, custom adapters,
/// and Dio-specific errors) directly across the VM Service Extension stream.
class DioNetworkInspector extends Interceptor {
  final bool logToConsole;
  final int maxBodyBytes;

  DioNetworkInspector({
    this.logToConsole = false,
    this.maxBodyBytes = 512 * 1024,
  });

  static const String eventStreamName = 'flutter_net_inspector';

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final startTime = DateTime.now().microsecondsSinceEpoch;
    options.extra['_fni_start_time'] = startTime;
    final requestId = 'dio_${options.hashCode}_$startTime';
    options.extra['_fni_request_id'] = requestId;

    final requestBody = _serializeData(options.data);

    final eventData = {
      'type': 'request',
      'id': requestId,
      'source': 'dio_interceptor',
      'method': options.method.toUpperCase(),
      'uri': options.uri.toString(),
      'startTime': startTime,
      'headers': options.headers.map((k, v) => MapEntry(k, v is List ? v : [v.toString()])),
      'requestBody': requestBody,
    };

    _postEvent('request', eventData);
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    final startTime = response.requestOptions.extra['_fni_start_time'] as int? ??
        DateTime.now().microsecondsSinceEpoch;
    final endTime = DateTime.now().microsecondsSinceEpoch;
    final requestId = response.requestOptions.extra['_fni_request_id'] as String? ??
        'dio_${response.requestOptions.hashCode}_$startTime';

    final responseBody = _serializeData(response.data);

    final eventData = {
      'type': 'response',
      'id': requestId,
      'source': 'dio_interceptor',
      'method': response.requestOptions.method.toUpperCase(),
      'uri': response.requestOptions.uri.toString(),
      'startTime': startTime,
      'endTime': endTime,
      'durationMs': (endTime - startTime) / 1000.0,
      'statusCode': response.statusCode,
      'statusText': response.statusMessage,
      'requestHeaders': response.requestOptions.headers
          .map((k, v) => MapEntry(k, v is List ? v : [v.toString()])),
      'responseHeaders': response.headers.map.map(
        (k, v) => MapEntry(k, v),
      ),
      'requestBody': _serializeData(response.requestOptions.data),
      'responseBody': responseBody,
      'state': (response.statusCode != null && response.statusCode! >= 400) ? 'failed' : 'completed',
    };

    _postEvent('response', eventData);
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final startTime = err.requestOptions.extra['_fni_start_time'] as int? ??
        DateTime.now().microsecondsSinceEpoch;
    final endTime = DateTime.now().microsecondsSinceEpoch;
    final requestId = err.requestOptions.extra['_fni_request_id'] as String? ??
        'dio_${err.requestOptions.hashCode}_$startTime';

    final resp = err.response;
    final responseBody = resp != null ? _serializeData(resp.data) : null;

    final eventData = {
      'type': 'error',
      'id': requestId,
      'source': 'dio_interceptor',
      'method': err.requestOptions.method.toUpperCase(),
      'uri': err.requestOptions.uri.toString(),
      'startTime': startTime,
      'endTime': endTime,
      'durationMs': (endTime - startTime) / 1000.0,
      'statusCode': resp?.statusCode,
      'statusText': resp?.statusMessage ?? err.type.name,
      'error': '${err.type.name}: ${err.message ?? ""}',
      'requestHeaders': err.requestOptions.headers
          .map((k, v) => MapEntry(k, v is List ? v : [v.toString()])),
      'responseHeaders': resp?.headers.map.map((k, v) => MapEntry(k, v)) ?? {},
      'requestBody': _serializeData(err.requestOptions.data),
      'responseBody': responseBody,
      'state': 'failed',
    };

    _postEvent('error', eventData);
    handler.next(err);
  }

  String? _serializeData(dynamic data) {
    if (data == null) return null;

    if (data is FormData) {
      final fields = data.fields.map((f) => {'key': f.key, 'value': f.value}).toList();
      final files = data.files
          .map((f) => {
                'key': f.key,
                'filename': f.value.filename,
                'length': f.value.length,
                'contentType': f.value.contentType?.toString(),
              })
          .toList();
      return jsonEncode({'_type': 'FormData', 'fields': fields, 'files': files});
    }

    if (data is Map || data is List) {
      try {
        final encoded = jsonEncode(data);
        return encoded.length > maxBodyBytes
            ? '${encoded.substring(0, maxBodyBytes)}... [Truncated]'
            : encoded;
      } catch (_) {
        return data.toString();
      }
    }

    final str = data.toString();
    return str.length > maxBodyBytes ? '${str.substring(0, maxBodyBytes)}... [Truncated]' : str;
  }

  void _postEvent(String action, Map<String, dynamic> data) {
    try {
      developer.postEvent(eventStreamName, data);
      if (logToConsole) {
        developer.log('[$eventStreamName] $action: ${data['method']} ${data['uri']}');
      }
    } catch (_) {
      // Ignore if developer service not attached
    }
  }
}

