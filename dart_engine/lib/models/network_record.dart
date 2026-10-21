/// Represents a normalized network request/response record.
class NetworkRecord {
  final String id;
  final String? isolateId;
  final String method;
  final String uri;
  final String path;
  final String host;
  final Map<String, List<String>> queryParams;
  final int? statusCode;
  final String? statusText;
  final int startTime; // microseconds
  final int? endTime; // microseconds
  final double? durationMs;
  final Map<String, List<String>> requestHeaders;
  final Map<String, List<String>> responseHeaders;
  final int? requestSize;
  final int? responseSize;
  final String? requestBody;
  final String? responseBody;
  final bool isRequestBodyTruncated;
  final bool isResponseBodyTruncated;
  final String? error;
  final List<TimingEvent> events;
  final String state; // 'pending' | 'completed' | 'failed'
  final String source; // 'vm_service' | 'dio_interceptor'
  final bool hasDetails;

  const NetworkRecord({
    required this.id,
    this.isolateId,
    required this.method,
    required this.uri,
    required this.path,
    required this.host,
    this.queryParams = const {},
    this.statusCode,
    this.statusText,
    required this.startTime,
    this.endTime,
    this.durationMs,
    this.requestHeaders = const {},
    this.responseHeaders = const {},
    this.requestSize,
    this.responseSize,
    this.requestBody,
    this.responseBody,
    this.isRequestBodyTruncated = false,
    this.isResponseBodyTruncated = false,
    this.error,
    this.events = const [],
    required this.state,
    this.source = 'vm_service',
    this.hasDetails = false,
  });

  NetworkRecord copyWith({
    String? id,
    String? isolateId,
    String? method,
    String? uri,
    String? path,
    String? host,
    Map<String, List<String>>? queryParams,
    int? statusCode,
    String? statusText,
    int? startTime,
    int? endTime,
    double? durationMs,
    Map<String, List<String>>? requestHeaders,
    Map<String, List<String>>? responseHeaders,
    int? requestSize,
    int? responseSize,
    String? requestBody,
    String? responseBody,
    bool? isRequestBodyTruncated,
    bool? isResponseBodyTruncated,
    String? error,
    List<TimingEvent>? events,
    String? state,
    String? source,
    bool? hasDetails,
  }) {
    return NetworkRecord(
      id: id ?? this.id,
      isolateId: isolateId ?? this.isolateId,
      method: method ?? this.method,
      uri: uri ?? this.uri,
      path: path ?? this.path,
      host: host ?? this.host,
      queryParams: queryParams ?? this.queryParams,
      statusCode: statusCode ?? this.statusCode,
      statusText: statusText ?? this.statusText,
      startTime: startTime ?? this.startTime,
      endTime: endTime ?? this.endTime,
      durationMs: durationMs ?? this.durationMs,
      requestHeaders: requestHeaders ?? this.requestHeaders,
      responseHeaders: responseHeaders ?? this.responseHeaders,
      requestSize: requestSize ?? this.requestSize,
      responseSize: responseSize ?? this.responseSize,
      requestBody: requestBody ?? this.requestBody,
      responseBody: responseBody ?? this.responseBody,
      isRequestBodyTruncated: isRequestBodyTruncated ?? this.isRequestBodyTruncated,
      isResponseBodyTruncated: isResponseBodyTruncated ?? this.isResponseBodyTruncated,
      error: error ?? this.error,
      events: events ?? this.events,
      state: state ?? this.state,
      source: source ?? this.source,
      hasDetails: hasDetails ?? this.hasDetails,
    );
  }

  Map<String, dynamic> toJson({bool includeBodies = true}) {
    return {
      'id': id,
      if (isolateId != null) 'isolateId': isolateId,
      'method': method,
      'uri': uri,
      'path': path,
      'host': host,
      'queryParams': queryParams,
      'statusCode': statusCode,
      'statusText': statusText,
      'startTime': startTime,
      'endTime': endTime,
      'durationMs': durationMs,
      'requestHeaders': requestHeaders,
      'responseHeaders': responseHeaders,
      'requestSize': requestSize,
      'responseSize': responseSize,
      if (includeBodies) 'requestBody': requestBody,
      if (includeBodies) 'responseBody': responseBody,
      'isRequestBodyTruncated': isRequestBodyTruncated,
      'isResponseBodyTruncated': isResponseBodyTruncated,
      'error': error,
      'events': events.map((e) => e.toJson()).toList(),
      'state': state,
      'source': source,
      'hasDetails': hasDetails,
    };
  }

  factory NetworkRecord.fromJson(Map<String, dynamic> json) {
    return NetworkRecord(
      id: json['id'] as String,
      isolateId: json['isolateId'] as String?,
      method: json['method'] as String? ?? 'GET',
      uri: json['uri'] as String? ?? '',
      path: json['path'] as String? ?? '',
      host: json['host'] as String? ?? '',
      queryParams: (json['queryParams'] as Map<String, dynamic>?)?.map(
            (k, v) => MapEntry(k, (v as List).map((e) => e.toString()).toList()),
          ) ??
          {},
      statusCode: json['statusCode'] as int?,
      statusText: json['statusText'] as String?,
      startTime: json['startTime'] as int? ?? 0,
      endTime: json['endTime'] as int?,
      durationMs: (json['durationMs'] as num?)?.toDouble(),
      requestHeaders: (json['requestHeaders'] as Map<String, dynamic>?)?.map(
            (k, v) => MapEntry(k, (v as List).map((e) => e.toString()).toList()),
          ) ??
          {},
      responseHeaders: (json['responseHeaders'] as Map<String, dynamic>?)?.map(
            (k, v) => MapEntry(k, (v as List).map((e) => e.toString()).toList()),
          ) ??
          {},
      requestSize: json['requestSize'] as int?,
      responseSize: json['responseSize'] as int?,
      requestBody: json['requestBody'] as String?,
      responseBody: json['responseBody'] as String?,
      isRequestBodyTruncated: json['isRequestBodyTruncated'] as bool? ?? false,
      isResponseBodyTruncated: json['isResponseBodyTruncated'] as bool? ?? false,
      error: json['error'] as String?,
      events: (json['events'] as List?)
              ?.map((e) => TimingEvent.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      state: json['state'] as String? ?? 'completed',
      source: json['source'] as String? ?? 'vm_service',
      hasDetails: json['hasDetails'] as bool? ?? false,
    );
  }
}

/// Timing event during HTTP lifecycle.
class TimingEvent {
  final int timestamp; // microseconds
  final String event;

  const TimingEvent({required this.timestamp, required this.event});

  Map<String, dynamic> toJson() => {'timestamp': timestamp, 'event': event};

  factory TimingEvent.fromJson(Map<String, dynamic> json) {
    return TimingEvent(
      timestamp: json['timestamp'] as int? ?? 0,
      event: json['event'] as String? ?? '',
    );
  }
}
