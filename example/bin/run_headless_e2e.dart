import 'dart:convert';
import 'dart:developer' as developer;
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_network_inspector_dio/flutter_network_inspector_dio.dart';

void main() async {
  // 1. Start local mock HTTP server
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  final port = server.port;
  stdout.writeln('MOCK_SERVER_PORT:$port');

  server.listen((req) async {
    final path = req.uri.path;
    if (path == '/api/users') {
      req.response.headers.contentType = ContentType.json;
      req.response.headers.add('X-Custom-Header', 'MockResponse');
      req.response.statusCode = HttpStatus.ok;
      final body = await utf8.decoder.bind(req).join();
      req.response.write(jsonEncode({
        'users': [{'id': 1, 'name': 'Alice'}, {'id': 2, 'name': 'Bob'}],
        if (body.isNotEmpty) 'echo': body,
      }));
      await req.response.close();
    } else if (path == '/api/error-500') {
      req.response.statusCode = HttpStatus.internalServerError;
      req.response.headers.contentType = ContentType.json;
      req.response.write(jsonEncode({'error': 'Simulated 500 error'}));
      await req.response.close();
    } else if (path == '/api/large') {
      req.response.headers.contentType = ContentType.json;
      final bigList = List.generate(400, (i) => {'index': i, 'text': 'Large payload entry $i'});
      req.response.write(jsonEncode({'items': bigList}));
      await req.response.close();
    } else if (path == '/api/upload') {
      await req.drain();
      req.response.headers.contentType = ContentType.json;
      req.response.write(jsonEncode({'success': true, 'filename': 'doc.txt'}));
      await req.response.close();
    } else {
      req.response.statusCode = HttpStatus.notFound;
      req.response.headers.contentType = ContentType.json;
      req.response.write(jsonEncode({'error': 'Not found: $path'}));
      await req.response.close();
    }
  });

  // 2. Setup Dio with Companion Inspector
  final dio = Dio();
  final companionInspector = DioNetworkInspector(logToConsole: false);
  dio.interceptors.add(companionInspector);

  // 3. Print ready signal
  final serviceInfo = await developer.Service.getInfo();
  stdout.writeln('READY:VM_SERVICE_URI:${serviceInfo.serverUri}');

  // 4. Listen on stdin for commands
  stdin.transform(utf8.decoder).transform(const LineSplitter()).listen((line) async {
    final cmd = line.trim();
    if (cmd.isEmpty) return;

    try {
      switch (cmd) {
        case 'dio_get':
          final resp = await dio.get(
            'http://127.0.0.1:$port/api/users',
            queryParameters: {'role': 'admin', 'token': 'super_secret_token_123'},
            options: Options(headers: {'Authorization': 'Bearer secret_jwt_token_abc'}),
          );
          stdout.writeln('RESULT:dio_get:HTTP_${resp.statusCode}');
          break;

        case 'dio_post':
          final resp = await dio.post(
            'http://127.0.0.1:$port/api/users',
            data: {'user': 'Alice', 'password': 'my_raw_password_xyz'},
            options: Options(headers: {'Authorization': 'Bearer secret_post_token'}),
          );
          stdout.writeln('RESULT:dio_post:HTTP_${resp.statusCode}');
          break;

        case 'error_404':
          try {
            await dio.get('http://127.0.0.1:$port/api/nonexistent_route');
          } on DioException catch (e) {
            stdout.writeln('RESULT:error_404:HTTP_${e.response?.statusCode}');
          }
          break;

        case 'error_500':
          try {
            await dio.get('http://127.0.0.1:$port/api/error-500');
          } on DioException catch (e) {
            stdout.writeln('RESULT:error_500:HTTP_${e.response?.statusCode}');
          }
          break;

        case 'conn_failure':
          try {
            final client = HttpClient();
            final req = await client.getUrl(Uri.parse('http://127.0.0.1:1/nonexistent'));
            await req.close();
          } catch (_) {
            stdout.writeln('RESULT:conn_failure:CAUGHT_EXCEPTION');
          }
          break;

        case 'dio_formdata':
          final formData = FormData.fromMap({
            'title': 'Test Report',
            'file': MultipartFile.fromString('Hello file bytes', filename: 'report.txt'),
          });
          final resp = await dio.post('http://127.0.0.1:$port/api/upload', data: formData);
          stdout.writeln('RESULT:dio_formdata:HTTP_${resp.statusCode}');
          break;

        case 'large_payload':
          final resp = await dio.get('http://127.0.0.1:$port/api/large');
          stdout.writeln('RESULT:large_payload:HTTP_${resp.statusCode}');
          break;

        case 'burst_30':
          final futures = <Future>[];
          for (int i = 0; i < 30; i++) {
            futures.add(dio.get('http://127.0.0.1:$port/api/users', queryParameters: {'seq': i}));
          }
          await Future.wait(futures);
          stdout.writeln('RESULT:burst_30:DONE');
          break;

        case 'exit':
          await server.close();
          exit(0);

        default:
          stdout.writeln('UNKNOWN_CMD:$cmd');
      }
    } catch (e) {
      stdout.writeln('CMD_ERROR:$cmd:$e');
    }
  });
}

