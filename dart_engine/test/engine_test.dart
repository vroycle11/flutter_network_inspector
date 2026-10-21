import 'dart:convert';
import 'package:test/test.dart';
import 'package:flutter_net_inspector_engine/models/network_record.dart';
import 'package:flutter_net_inspector_engine/services/normalizer.dart';
import 'package:flutter_net_inspector_engine/services/redactor.dart';
import 'package:flutter_net_inspector_engine/services/retention_manager.dart';
import 'package:flutter_net_inspector_engine/services/filter_engine.dart';
import 'package:flutter_net_inspector_engine/services/export_service.dart';

void main() {
  group('HttpProfileNormalizer', () {
    final normalizer = const HttpProfileNormalizer(maxBodyBytes: 100);

    test('normalizes standard summary request', () {
      final raw = {
        'id': '101',
        'isolateId': 'isolates/1',
        'method': 'GET',
        'uri': 'https://api.example.com/v1/users?page=1&limit=20',
        'startTime': 1000000,
        'endTime': 1050000,
        'request': {
          'headers': {
            'User-Agent': ['Flutter/3.0'],
            'Authorization': ['Bearer secret_token_123']
          },
          'contentLength': 0,
        },
        'response': {
          'statusCode': 200,
          'reasonPhrase': 'OK',
          'headers': {
            'content-type': ['application/json']
          },
          'contentLength': 256,
        },
        'events': [
          {'timestamp': 1010000, 'event': 'Request sent'},
          {'timestamp': 1045000, 'event': 'Waiting (TTFB)'},
        ]
      };

      final record = normalizer.normalizeSummary(raw);
      expect(record.id, '101');
      expect(record.method, 'GET');
      expect(record.host, 'api.example.com');
      expect(record.path, '/v1/users');
      expect(record.queryParams['page'], ['1']);
      expect(record.queryParams['limit'], ['20']);
      expect(record.statusCode, 200);
      expect(record.statusText, 'OK');
      expect(record.durationMs, 50.0);
      expect(record.state, 'completed');
      expect(record.events.length, 2);
      expect(record.hasDetails, false);
    });

    test('normalizes failed request with error', () {
      final raw = {
        'id': '102',
        'method': 'POST',
        'uri': 'https://api.example.com/timeout',
        'startTime': 2000000,
        'request': {
          'error': 'SocketException: Connection timed out',
        }
      };

      final record = normalizer.normalizeSummary(raw);
      expect(record.id, '102');
      expect(record.error, contains('Connection timed out'));
      expect(record.state, 'failed');
      expect(record.statusCode, isNull);
    });

    test('normalizes detail with UTF-8 request and response body', () {
      final summary = NetworkRecord(
        id: '103',
        method: 'POST',
        uri: 'https://api.example.com/login',
        path: '/login',
        host: 'api.example.com',
        startTime: 3000000,
        state: 'completed',
      );

      final reqBytes = utf8.encode(jsonEncode({'username': 'dev', 'password': '123'}));
      final respBytes = utf8.encode(jsonEncode({'status': 'authenticated'}));

      final detailRaw = {
        'id': '103',
        'method': 'POST',
        'uri': 'https://api.example.com/login',
        'startTime': 3000000,
        'endTime': 3040000,
        'requestBody': reqBytes,
        'responseBody': respBytes,
      };

      final record = normalizer.normalizeDetail(summary, detailRaw);
      expect(record.hasDetails, true);
      expect(record.requestBody, contains('"username":"dev"'));
      expect(record.responseBody, contains('"status":"authenticated"'));
      expect(record.isRequestBodyTruncated, false);
    });

    test('truncates bodies exceeding maxBodyBytes', () {
      final summary = NetworkRecord(
        id: '104',
        method: 'GET',
        uri: 'https://api.example.com/big',
        path: '/big',
        host: 'api.example.com',
        startTime: 4000000,
        state: 'completed',
      );

      final bigBytes = List<int>.filled(500, 65); // 500 'A' characters, max is 100
      final detailRaw = {
        'id': '104',
        'method': 'GET',
        'uri': 'https://api.example.com/big',
        'startTime': 4000000,
        'responseBody': bigBytes,
      };

      final record = normalizer.normalizeDetail(summary, detailRaw);
      expect(record.isResponseBodyTruncated, true);
      expect(record.responseBody!.length, 100);
      expect(record.responseSize, 500);
    });
  });

  group('NetworkDataRedactor', () {
    final redactor = NetworkDataRedactor();

    test('redacts Authorization and cookie headers', () {
      final record = NetworkRecord(
        id: '201',
        method: 'GET',
        uri: 'https://api.example.com/data',
        path: '/data',
        host: 'api.example.com',
        startTime: 1000,
        state: 'completed',
        requestHeaders: {
          'Authorization': ['Bearer top_secret_token'],
          'Cookie': ['session=abc123xyz'],
          'Accept': ['application/json']
        },
      );

      final redacted = redactor.redactRecord(record);
      expect(redacted.requestHeaders['Authorization'], ['[REDACTED]']);
      expect(redacted.requestHeaders['Cookie'], ['[REDACTED]']);
      expect(redacted.requestHeaders['Accept'], ['application/json']);
    });

    test('redacts sensitive query parameters', () {
      final record = NetworkRecord(
        id: '202',
        method: 'GET',
        uri: 'https://api.example.com/auth?token=my_api_key_456&user=alice',
        path: '/auth',
        host: 'api.example.com',
        startTime: 1000,
        state: 'completed',
        queryParams: {
          'token': ['my_api_key_456'],
          'user': ['alice']
        },
      );

      final redacted = redactor.redactRecord(record);
      expect(redacted.queryParams['token'], ['[REDACTED]']);
      expect(redacted.queryParams['user'], ['alice']);
      expect(redacted.uri, contains('token=%5BREDACTED%5D'));
      expect(redacted.uri, isNot(contains('my_api_key_456')));
    });

    test('redacts sensitive keys in JSON bodies', () {
      final record = NetworkRecord(
        id: '203',
        method: 'POST',
        uri: 'https://api.example.com/login',
        path: '/login',
        host: 'api.example.com',
        startTime: 1000,
        state: 'completed',
        requestBody: '{"username":"john","password":"super_secret_password"}',
      );

      final redacted = redactor.redactRecord(record);
      expect(redacted.requestBody, contains('"password":"[REDACTED]"'));
      expect(redacted.requestBody, isNot(contains('super_secret_password')));
    });
  });

  group('NetworkRetentionManager', () {
    test('enforces maxRequests bounded retention', () {
      final manager = NetworkRetentionManager(
        policy: const RetentionPolicy(maxRequests: 3),
      );

      for (int i = 1; i <= 5; i++) {
        manager.addOrUpdate(NetworkRecord(
          id: '$i',
          method: 'GET',
          uri: 'https://api.example.com/$i',
          path: '/$i',
          host: 'api.example.com',
          startTime: i * 1000,
          state: 'completed',
        ));
      }

      expect(manager.count, 3);
      expect(manager.records.map((r) => r.id).toList(), ['3', '4', '5']);
    });

    test('evicts bodies when total body budget is exceeded', () {
      // 500 bytes max body budget
      final manager = NetworkRetentionManager(
        policy: const RetentionPolicy(
          maxRequests: 10,
          maxTotalBodyBytes: 300,
        ),
      );

      // Add record 1 with 200 byte body
      manager.addOrUpdate(NetworkRecord(
        id: '1',
        method: 'GET',
        uri: 'https://api.example.com/1',
        path: '/1',
        host: 'api.example.com',
        startTime: 1000,
        state: 'completed',
        responseBody: 'A' * 200,
      ));

      // Add record 2 with 200 byte body -> total 400 > 300
      manager.addOrUpdate(NetworkRecord(
        id: '2',
        method: 'GET',
        uri: 'https://api.example.com/2',
        path: '/2',
        host: 'api.example.com',
        startTime: 2000,
        state: 'completed',
        responseBody: 'B' * 200,
      ));

      expect(manager.count, 2);
      expect(manager.evictedBodiesCount, greaterThan(0));
      // Oldest record (1) body evicted, but metadata preserved
      expect(manager.getRecord('1')!.responseBody, contains('evicted'));
      // Newest record (2) body intact
      expect(manager.getRecord('2')!.responseBody, 'B' * 200);
    });
  });

  group('NetworkFilterEngine', () {
    final records = [
      NetworkRecord(
        id: '1',
        method: 'GET',
        uri: 'https://api.example.com/users/1',
        path: '/users/1',
        host: 'api.example.com',
        statusCode: 200,
        startTime: 1000,
        state: 'completed',
      ),
      NetworkRecord(
        id: '2',
        method: 'POST',
        uri: 'https://api.example.com/users',
        path: '/users',
        host: 'api.example.com',
        statusCode: 201,
        startTime: 2000,
        state: 'completed',
      ),
      NetworkRecord(
        id: '3',
        method: 'GET',
        uri: 'https://api.example.com/users/999',
        path: '/users/999',
        host: 'api.example.com',
        statusCode: 404,
        startTime: 3000,
        state: 'failed',
      ),
      NetworkRecord(
        id: '4',
        method: 'DELETE',
        uri: 'https://api.example.com/users/1',
        path: '/users/1',
        host: 'api.example.com',
        error: 'Connection reset by peer',
        startTime: 4000,
        state: 'failed',
      ),
    ];

    test('filters by search text', () {
      final res = NetworkFilterEngine.filter(
        records,
        const FilterCriteria(searchText: '999'),
      );
      expect(res.length, 1);
      expect(res.first.id, '3');
    });

    test('filters by method', () {
      final res = NetworkFilterEngine.filter(
        records,
        const FilterCriteria(methods: {'POST'}),
      );
      expect(res.length, 1);
      expect(res.first.id, '2');
    });

    test('filters by failed only', () {
      final res = NetworkFilterEngine.filter(
        records,
        const FilterCriteria(failedOnly: true),
      );
      expect(res.length, 2);
      expect(res.map((r) => r.id).toList(), ['3', '4']);
    });

    test('filters by status group 2xx', () {
      final res = NetworkFilterEngine.filter(
        records,
        const FilterCriteria(statusGroup: '2xx'),
      );
      expect(res.length, 2);
      expect(res.map((r) => r.id).toList(), ['1', '2']);
    });
  });

  group('NetworkExportService', () {
    final exportService = NetworkExportService();

    final testRecord = NetworkRecord(
      id: '501',
      method: 'POST',
      uri: 'https://api.example.com/v1/orders?token=my_secret_token',
      path: '/v1/orders',
      host: 'api.example.com',
      queryParams: {'token': ['my_secret_token']},
      statusCode: 200,
      startTime: 1600000000000000,
      endTime: 1600000000100000,
      durationMs: 100.0,
      requestHeaders: {
        'authorization': ['Bearer token_123'],
        'content-type': ['application/json']
      },
      responseHeaders: {'content-type': ['application/json']},
      requestBody: '{"item":"book","qty":1}',
      responseBody: '{"orderId":"ord-99"}',
      state: 'completed',
    );

    test('exports sanitized session JSON', () {
      final jsonStr = exportService.exportSessionJson([testRecord], sanitize: true);
      expect(jsonStr, contains('Flutter Network Inspector'));
      expect(jsonStr, isNot(contains('token_123')));
      expect(jsonStr, contains('[REDACTED]'));
    });

    test('exports valid HAR 1.2', () {
      final harStr = exportService.exportHar([testRecord], sanitize: true);
      final har = jsonDecode(harStr) as Map<String, dynamic>;
      expect(har['log']['version'], '1.2');
      final entries = har['log']['entries'] as List;
      expect(entries.length, 1);
      expect(entries.first['request']['method'], 'POST');
    });

    test('generates cURL command', () {
      final curl = NetworkExportService.toCurl(testRecord, sanitize: true);
      expect(curl, startsWith('curl -X POST'));
      expect(curl, contains('-H \'authorization: [REDACTED]\''));
      expect(curl, contains('--data \'{"item":"book","qty":1}\''));
    });
  });
}
