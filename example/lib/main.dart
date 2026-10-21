import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:flutter_network_inspector_dio/flutter_network_inspector_dio.dart';

void main() {
  runApp(const NetworkInspectorDemoApp());
}

class NetworkInspectorDemoApp extends StatelessWidget {
  const NetworkInspectorDemoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Flutter Network Inspector Demo',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        useMaterial3: true,
      ),
      home: const NetworkInspectorHome(),
    );
  }
}

class NetworkInspectorHome extends StatefulWidget {
  const NetworkInspectorHome({super.key});

  @override
  State<NetworkInspectorHome> createState() => _NetworkInspectorHomeState();
}

class _NetworkInspectorHomeState extends State<NetworkInspectorHome> {
  late final Dio _dio;
  late final DioNetworkInspector _companionInterceptor;
  HttpServer? _localServer;
  int _localPort = 0;

  bool _useCompanionInterceptor = true;
  String _status = 'Ready. Local mock server starting...';
  int _requestCounter = 0;

  @override
  void initState() {
    super.initState();
    _dio = Dio();
    _companionInterceptor = DioNetworkInspector(logToConsole: true);
    _dio.interceptors.add(_companionInterceptor);

    _startLocalMockServer();
  }

  Future<void> _startLocalMockServer() async {
    try {
      _localServer = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      _localPort = _localServer!.port;
      setState(() {
        _status = 'Mock server listening on port $_localPort';
      });

      _localServer!.listen((req) async {
        final path = req.uri.path;

        if (path == '/api/users') {
          req.response.headers.contentType = ContentType.json;
          req.response.headers.add('X-Powered-By', 'Flutter-Mock-Server');
          req.response.statusCode = HttpStatus.ok;
          final echoBody = await utf8.decoder.bind(req).join();
          req.response.write(jsonEncode({
            'success': true,
            'users': [
              {'id': 1, 'name': 'Alice Smith', 'role': 'Engineer'},
              {'id': 2, 'name': 'Bob Jones', 'role': 'Designer'},
            ],
            if (echoBody.isNotEmpty) 'echo': echoBody,
          }));
          await req.response.close();
        } else if (path == '/api/large') {
          req.response.headers.contentType = ContentType.json;
          final bigList = List.generate(500, (i) => {
            'index': i,
            'uuid': 'item_${i}_${DateTime.now().millisecondsSinceEpoch}',
            'description': 'This is a large payload item generated for testing memory retention.',
          });
          req.response.write(jsonEncode({'items': bigList}));
          await req.response.close();
        } else if (path == '/api/error-500') {
          req.response.statusCode = HttpStatus.internalServerError;
          req.response.headers.contentType = ContentType.json;
          req.response.write(jsonEncode({'error': 'Internal Server Error simulation'}));
          await req.response.close();
        } else if (path == '/api/upload') {
          await req.drain();
          req.response.headers.contentType = ContentType.json;
          req.response.write(jsonEncode({'uploaded': true, 'filename': 'sample.txt'}));
          await req.response.close();
        } else {
          req.response.statusCode = HttpStatus.notFound;
          req.response.headers.contentType = ContentType.json;
          req.response.write(jsonEncode({'error': 'Route not found: $path'}));
          await req.response.close();
        }
      });
    } catch (e) {
      setState(() {
        _status = 'Failed to start local mock server: $e';
      });
    }
  }

  @override
  void dispose() {
    _localServer?.close();
    super.dispose();
  }

  void _toggleCompanion(bool enabled) {
    setState(() {
      _useCompanionInterceptor = enabled;
      _dio.interceptors.remove(_companionInterceptor);
      if (enabled) {
        _dio.interceptors.add(_companionInterceptor);
      }
      _status = enabled
          ? 'Companion Dio Interceptor Enabled'
          : 'Pure VM Service Profiling Mode (No App Changes)';
    });
  }

  Future<void> _sendStandardGet() async {
    _requestCounter++;
    setState(() => _status = 'Sending Standard GET #$_requestCounter...');
    try {
      final client = HttpClient();
      final req = await client.getUrl(Uri.parse('http://127.0.0.1:$_localPort/api/users?client=http_client&req=$_requestCounter'));
      req.headers.add('User-Agent', 'Dart-StdLib-HttpClient');
      final resp = await req.close();
      final body = await utf8.decoder.bind(resp).join();
      setState(() => _status = 'GET Completed: HTTP ${resp.statusCode} (${body.length} bytes)');
      client.close();
    } catch (e) {
      setState(() => _status = 'GET Failed: $e');
    }
  }

  Future<void> _sendStandardPost() async {
    _requestCounter++;
    setState(() => _status = 'Sending Standard POST #$_requestCounter...');
    try {
      final client = HttpClient();
      final req = await client.postUrl(Uri.parse('http://127.0.0.1:$_localPort/api/users'));
      req.headers.contentType = ContentType.json;
      req.headers.add('Authorization', 'Bearer test_token_xyz123');
      req.write(jsonEncode({'title': 'New Task', 'assignee': 'Alice', 'id': _requestCounter}));
      final resp = await req.close();
      final body = await utf8.decoder.bind(resp).join();
      setState(() => _status = 'POST Completed: HTTP ${resp.statusCode} (${body.length} bytes)');
      client.close();
    } catch (e) {
      setState(() => _status = 'POST Failed: $e');
    }
  }

  Future<void> _sendDioGet() async {
    _requestCounter++;
    setState(() => _status = 'Sending Dio GET #$_requestCounter...');
    try {
      final resp = await _dio.get(
        'http://127.0.0.1:$_localPort/api/users',
        queryParameters: {'role': 'developer', 'token': 'secret_auth_token_456'},
        options: Options(headers: {'Authorization': 'Bearer dio_secret_jwt_token'}),
      );
      setState(() => _status = 'Dio GET Completed: HTTP ${resp.statusCode}');
    } catch (e) {
      setState(() => _status = 'Dio GET Failed: $e');
    }
  }

  Future<void> _sendDioPost() async {
    _requestCounter++;
    setState(() => _status = 'Sending Dio POST #$_requestCounter...');
    try {
      final resp = await _dio.post(
        'http://127.0.0.1:$_localPort/api/users',
        data: {
          'user': 'Charlie',
          'email': 'charlie@example.com',
          'secretKey': 'my_api_key_789',
        },
      );
      setState(() => _status = 'Dio POST Completed: HTTP ${resp.statusCode}');
    } catch (e) {
      setState(() => _status = 'Dio POST Failed: $e');
    }
  }

  Future<void> _sendDioFormData() async {
    _requestCounter++;
    setState(() => _status = 'Sending Dio FormData #$_requestCounter...');
    try {
      final formData = FormData.fromMap({
        'name': 'Test Document',
        'file': MultipartFile.fromString('Hello file contents!', filename: 'doc.txt'),
      });
      final resp = await _dio.post('http://127.0.0.1:$_localPort/api/upload', data: formData);
      setState(() => _status = 'Dio FormData Completed: HTTP ${resp.statusCode}');
    } catch (e) {
      setState(() => _status = 'Dio FormData Failed: $e');
    }
  }

  Future<void> _sendLargePayload() async {
    setState(() => _status = 'Requesting Large JSON Payload (>100KB)...');
    try {
      final resp = await _dio.get('http://127.0.0.1:$_localPort/api/large');
      setState(() => _status = 'Large Payload Completed: HTTP ${resp.statusCode}');
    } catch (e) {
      setState(() => _status = 'Large Payload Failed: $e');
    }
  }

  Future<void> _sendError404() async {
    setState(() => _status = 'Sending 404 Request...');
    try {
      await _dio.get('http://127.0.0.1:$_localPort/api/missing-endpoint');
    } on DioException catch (e) {
      setState(() => _status = 'Received Expected HTTP ${e.response?.statusCode}');
    }
  }

  Future<void> _sendError500() async {
    setState(() => _status = 'Sending 500 Server Error Request...');
    try {
      await _dio.get('http://127.0.0.1:$_localPort/api/error-500');
    } on DioException catch (e) {
      setState(() => _status = 'Received Expected HTTP ${e.response?.statusCode}');
    }
  }

  Future<void> _sendConnectionFailure() async {
    setState(() => _status = 'Sending Request to closed port (Connection refused)...');
    try {
      final client = HttpClient();
      final req = await client.getUrl(Uri.parse('http://127.0.0.1:1/nonexistent'));
      await req.close();
    } catch (e) {
      setState(() => _status = 'Expected Connection Failure: SocketException caught');
    }
  }

  Future<void> _sendBurst() async {
    setState(() => _status = 'Sending burst of 30 concurrent requests...');
    final futures = <Future>[];
    for (int i = 0; i < 30; i++) {
      _requestCounter++;
      final id = _requestCounter;
      futures.add(_dio.get('http://127.0.0.1:$_localPort/api/users', queryParameters: {'burst_id': id}));
    }
    await Future.wait(futures);
    setState(() => _status = 'Burst completed! 30 requests sent.');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Flutter Network Inspector Demo'),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Status: $_status', style: const TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 6),
                    Text(
                      'Port: $_localPort | Total Triggered: $_requestCounter',
                      style: const TextStyle(fontSize: 12, color: Colors.grey),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            SwitchListTile(
              title: const Text('Use Companion Dio Interceptor'),
              subtitle: const Text('Emits rich Dio metadata & FormData events over VM Extension stream'),
              value: _useCompanionInterceptor,
              onChanged: _toggleCompanion,
            ),
            const Divider(),
            const Text('Standard HttpClient (dart:io)', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: ElevatedButton(onPressed: _sendStandardGet, child: const Text('Standard GET'))),
                const SizedBox(width: 8),
                Expanded(child: ElevatedButton(onPressed: _sendStandardPost, child: const Text('Standard POST'))),
              ],
            ),
            const SizedBox(height: 16),
            const Text('Dio HTTP Client', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: ElevatedButton(onPressed: _sendDioGet, child: const Text('Dio GET (Auth/Params)'))),
                const SizedBox(width: 8),
                Expanded(child: ElevatedButton(onPressed: _sendDioPost, child: const Text('Dio POST (JSON)'))),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: ElevatedButton(onPressed: _sendDioFormData, child: const Text('Dio FormData'))),
                const SizedBox(width: 8),
                Expanded(child: ElevatedButton(onPressed: _sendLargePayload, child: const Text('Large JSON (>100KB)'))),
              ],
            ),
            const SizedBox(height: 16),
            const Text('Errors & Stress Testing', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: OutlinedButton(onPressed: _sendError404, child: const Text('404 Not Found'))),
                const SizedBox(width: 8),
                Expanded(child: OutlinedButton(onPressed: _sendError500, child: const Text('500 Server Error'))),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: OutlinedButton(onPressed: _sendConnectionFailure, child: const Text('Conn Refused'))),
                const SizedBox(width: 8),
                Expanded(child: ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.indigo, foregroundColor: Colors.white),
                  onPressed: _sendBurst,
                  child: const Text('Burst (30 Reqs)'),
                )),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
