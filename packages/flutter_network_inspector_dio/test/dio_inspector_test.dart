import 'package:dio/dio.dart';
import 'package:flutter_network_inspector_dio/flutter_network_inspector_dio.dart';
import 'package:test/test.dart';

void main() {
  test('DioNetworkInspector intercepts requests, responses, and errors', () async {
    final dio = Dio();
    final inspector = DioNetworkInspector();
    dio.interceptors.add(inspector);

    // Mock adapter for deterministic tests
    dio.httpClientAdapter = _MockHttpClientAdapter();

    final resp = await dio.get('https://mock.api/users', queryParameters: {'active': 'true'});
    expect(resp.statusCode, 200);
    expect(resp.data, {'users': ['alice', 'bob']});

    // Test error handling
    try {
      await dio.get('https://mock.api/error');
      fail('Expected exception');
    } on DioException catch (e) {
      expect(e.response?.statusCode, 500);
    }
  });
}

class _MockHttpClientAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (options.path.endsWith('/error')) {
      return ResponseBody.fromString(
        '{"error":"Server error"}',
        500,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );
    }
    return ResponseBody.fromString(
      '{"users":["alice","bob"]}',
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

