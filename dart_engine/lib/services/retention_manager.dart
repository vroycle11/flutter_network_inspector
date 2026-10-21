import '../models/network_record.dart';

class RetentionPolicy {
  final int maxRequests;
  final int maxBodyBytes;
  final int maxTotalBodyBytes;

  const RetentionPolicy({
    this.maxRequests = 1000,
    this.maxBodyBytes = 512 * 1024, // 512 KB
    this.maxTotalBodyBytes = 20 * 1024 * 1024, // 20 MB
  });
}

class NetworkRetentionManager {
  final RetentionPolicy policy;

  // Ordered map of records by id (oldest to newest)
  final Map<String, NetworkRecord> _records = {};

  // Track body sizes
  final Map<String, int> _bodySizes = {};
  int _currentTotalBodyBytes = 0;
  int _evictedBodiesCount = 0;

  NetworkRetentionManager({RetentionPolicy? policy})
      : policy = policy ?? const RetentionPolicy();

  List<NetworkRecord> get records => _records.values.toList();
  int get count => _records.length;
  int get currentTotalBodyBytes => _currentTotalBodyBytes;
  int get evictedBodiesCount => _evictedBodiesCount;

  NetworkRecord? getRecord(String id) => _records[id];

  /// Adds or updates a record. Enforces retention limits.
  NetworkRecord addOrUpdate(NetworkRecord record) {
    final existing = _records[record.id];
    if (existing != null) {
      _subtractBodySize(record.id);
    }

    _records[record.id] = record;
    _trackBodySize(record);

    _enforceMaxRequests();
    _enforceTotalBodyBudget();

    return _records[record.id]!;
  }

  void _trackBodySize(NetworkRecord record) {
    int size = 0;
    if (record.requestBody != null) {
      size += record.requestBody!.length;
    }
    if (record.responseBody != null) {
      size += record.responseBody!.length;
    }
    _bodySizes[record.id] = size;
    _currentTotalBodyBytes += size;
  }

  void _subtractBodySize(String id) {
    final size = _bodySizes.remove(id) ?? 0;
    _currentTotalBodyBytes = (_currentTotalBodyBytes - size).clamp(0, 1 << 60);
  }

  void _enforceMaxRequests() {
    while (_records.length > policy.maxRequests) {
      final oldestId = _records.keys.first;
      _subtractBodySize(oldestId);
      _records.remove(oldestId);
    }
  }

  void _enforceTotalBodyBudget() {
    if (_currentTotalBodyBytes <= policy.maxTotalBodyBytes) return;

    // Evict bodies from oldest records first, keeping metadata intact
    for (final id in _records.keys) {
      if (_currentTotalBodyBytes <= policy.maxTotalBodyBytes) break;

      final current = _records[id]!;
      if (current.requestBody != null || current.responseBody != null) {
        _subtractBodySize(id);
        _records[id] = current.copyWith(
          requestBody: current.requestBody != null ? '[Body evicted by memory retention policy]' : null,
          responseBody: current.responseBody != null ? '[Body evicted by memory retention policy]' : null,
          isRequestBodyTruncated: true,
          isResponseBodyTruncated: true,
        );
        _evictedBodiesCount++;
      }
    }
  }

  bool remove(String id) {
    if (_records.containsKey(id)) {
      _subtractBodySize(id);
      _records.remove(id);
      return true;
    }
    return false;
  }

  void clear() {
    _records.clear();
    _bodySizes.clear();
    _currentTotalBodyBytes = 0;
    _evictedBodiesCount = 0;
  }
}

