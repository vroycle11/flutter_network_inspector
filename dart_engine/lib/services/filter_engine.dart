import '../models/network_record.dart';

class FilterCriteria {
  final String? searchText;
  final Set<String> methods;
  final String? statusGroup; // '2xx', '3xx', '4xx', '5xx', 'all'
  final bool? failedOnly;
  final bool searchBody;

  const FilterCriteria({
    this.searchText,
    this.methods = const {},
    this.statusGroup,
    this.failedOnly,
    this.searchBody = false,
  });

  bool get isEmpty =>
      (searchText == null || searchText!.trim().isEmpty) &&
      methods.isEmpty &&
      (statusGroup == null || statusGroup == 'all') &&
      (failedOnly == null || !failedOnly!);

  Map<String, dynamic> toJson() => {
        'searchText': searchText,
        'methods': methods.toList(),
        'statusGroup': statusGroup,
        'failedOnly': failedOnly,
        'searchBody': searchBody,
      };

  factory FilterCriteria.fromJson(Map<String, dynamic> json) {
    return FilterCriteria(
      searchText: json['searchText'] as String?,
      methods: (json['methods'] as List?)?.map((e) => e.toString().toUpperCase()).toSet() ?? {},
      statusGroup: json['statusGroup'] as String?,
      failedOnly: json['failedOnly'] as bool?,
      searchBody: json['searchBody'] as bool? ?? false,
    );
  }
}

class NetworkFilterEngine {
  static List<NetworkRecord> filter(List<NetworkRecord> records, FilterCriteria criteria) {
    if (criteria.isEmpty) return records;

    final query = criteria.searchText?.trim().toLowerCase();
    final methods = criteria.methods.map((m) => m.toUpperCase()).toSet();
    final statusGroup = criteria.statusGroup?.toLowerCase();
    final failedOnly = criteria.failedOnly ?? false;
    final searchBody = criteria.searchBody;

    return records.where((record) {
      // 1. Method filter
      if (methods.isNotEmpty && !methods.contains(record.method.toUpperCase())) {
        return false;
      }

      // 2. Failed only filter
      if (failedOnly) {
        final isFailed = record.state == 'failed' ||
            (record.statusCode != null && record.statusCode! >= 400) ||
            (record.error != null && record.error!.isNotEmpty);
        if (!isFailed) return false;
      }

      // 3. Status group filter
      if (statusGroup != null && statusGroup != 'all') {
        final code = record.statusCode;
        if (code == null) {
          if (statusGroup != 'other') return false;
        } else {
          final prefix = code ~/ 100;
          if (statusGroup == '2xx' && prefix != 2) return false;
          if (statusGroup == '3xx' && prefix != 3) return false;
          if (statusGroup == '4xx' && prefix != 4) return false;
          if (statusGroup == '5xx' && prefix != 5) return false;
        }
      }

      // 4. Search text (URL, path, host, status, or body)
      if (query != null && query.isNotEmpty) {
        final matchesUrl = record.uri.toLowerCase().contains(query);
        if (matchesUrl) return true;

        final matchesStatus = record.statusCode?.toString().contains(query) ?? false;
        if (matchesStatus) return true;

        final matchesError = record.error?.toLowerCase().contains(query) ?? false;
        if (matchesError) return true;

        if (searchBody) {
          final matchesReq = record.requestBody?.toLowerCase().contains(query) ?? false;
          if (matchesReq) return true;
          final matchesResp = record.responseBody?.toLowerCase().contains(query) ?? false;
          if (matchesResp) return true;
        }

        return false;
      }

      return true;
    }).toList();
  }
}

