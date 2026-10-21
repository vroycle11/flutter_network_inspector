import 'dart:convert';
import 'dart:io';
import 'package:flutter_net_inspector_engine/models/network_record.dart';
import 'package:flutter_net_inspector_engine/services/export_service.dart';
import 'package:flutter_net_inspector_engine/services/filter_engine.dart';
import 'package:flutter_net_inspector_engine/services/normalizer.dart';
import 'package:flutter_net_inspector_engine/services/redactor.dart';
import 'package:flutter_net_inspector_engine/services/retention_manager.dart';

void main(List<String> args) {
  final retentionManager = NetworkRetentionManager();
  final normalizer = const HttpProfileNormalizer();
  final redactor = NetworkDataRedactor();
  final exportService = NetworkExportService(redactor: redactor);

  stdin.transform(utf8.decoder).transform(const LineSplitter()).listen((line) {
    if (line.trim().isEmpty) return;

    Map<String, dynamic> response;
    dynamic reqId;

    try {
      final req = jsonDecode(line) as Map<String, dynamic>;
      reqId = req['id'];
      final method = req['method'] as String?;
      final params = req['params'] as Map<String, dynamic>? ?? {};

      switch (method) {
        case 'ping':
          response = {
            'jsonrpc': '2.0',
            'id': reqId,
            'result': {'status': 'ok', 'version': '1.0.0', 'pid': pid},
          };
          break;

        case 'normalizeSummary':
          final raw = params['raw'] as Map<String, dynamic>? ?? {};
          final record = normalizer.normalizeSummary(raw);
          response = {
            'jsonrpc': '2.0',
            'id': reqId,
            'result': record.toJson(),
          };
          break;

        case 'normalizeDetail':
          final summaryJson = params['summary'] as Map<String, dynamic>? ?? {};
          final detailRaw = params['detail'] as Map<String, dynamic>? ?? {};
          final summary = NetworkRecord.fromJson(summaryJson);
          final detailed = normalizer.normalizeDetail(summary, detailRaw);
          response = {
            'jsonrpc': '2.0',
            'id': reqId,
            'result': detailed.toJson(),
          };
          break;

        case 'addRecord':
          final recordJson = params['record'] as Map<String, dynamic>? ?? {};
          final record = NetworkRecord.fromJson(recordJson);
          final stored = retentionManager.addOrUpdate(record);
          response = {
            'jsonrpc': '2.0',
            'id': reqId,
            'result': {
              'record': stored.toJson(),
              'totalCount': retentionManager.count,
              'totalBodyBytes': retentionManager.currentTotalBodyBytes,
              'evictedBodiesCount': retentionManager.evictedBodiesCount,
            },
          };
          break;

        case 'filter':
          final criteriaJson = params['criteria'] as Map<String, dynamic>? ?? {};
          final criteria = FilterCriteria.fromJson(criteriaJson);
          final filtered = NetworkFilterEngine.filter(retentionManager.records, criteria);
          response = {
            'jsonrpc': '2.0',
            'id': reqId,
            'result': {
              'total': filtered.length,
              'records': filtered.map((r) => r.toJson(includeBodies: false)).toList(),
            },
          };
          break;

        case 'clear':
          retentionManager.clear();
          response = {
            'jsonrpc': '2.0',
            'id': reqId,
            'result': {'cleared': true},
          };
          break;

        case 'redact':
          final recordJson = params['record'] as Map<String, dynamic>? ?? {};
          final record = NetworkRecord.fromJson(recordJson);
          final redacted = redactor.redactRecord(record);
          response = {
            'jsonrpc': '2.0',
            'id': reqId,
            'result': redacted.toJson(),
          };
          break;

        case 'export':
          final format = (params['format'] as String? ?? 'json').toLowerCase();
          final sanitize = params['sanitize'] as bool? ?? true;
          final content = (format == 'har')
              ? exportService.exportHar(retentionManager.records, sanitize: sanitize)
              : exportService.exportSessionJson(retentionManager.records, sanitize: sanitize);
          response = {
            'jsonrpc': '2.0',
            'id': reqId,
            'result': {'format': format, 'content': content},
          };
          break;

        case 'toCurl':
          final recordJson = params['record'] as Map<String, dynamic>? ?? {};
          final record = NetworkRecord.fromJson(recordJson);
          final sanitize = params['sanitize'] as bool? ?? true;
          final curl = NetworkExportService.toCurl(record, sanitize: sanitize);
          response = {
            'jsonrpc': '2.0',
            'id': reqId,
            'result': {'curl': curl},
          };
          break;

        default:
          response = {
            'jsonrpc': '2.0',
            'id': reqId,
            'error': {'code': -32601, 'message': 'Method not found: $method'},
          };
      }
    } catch (e, st) {
      response = {
        'jsonrpc': '2.0',
        'id': reqId,
        'error': {'code': -32603, 'message': e.toString(), 'stack': st.toString()},
      };
    }

    stdout.writeln(jsonEncode(response));
  });
}

