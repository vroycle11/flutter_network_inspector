import { NetworkRecord } from '../types';

export class DataSanitizer {
  private sensitiveHeaders: Set<string>;
  private sensitiveQueryParams: Set<string>;

  constructor(sensitiveHeaders: string[] = [], sensitiveQueryParams: string[] = []) {
    this.sensitiveHeaders = new Set(
      (sensitiveHeaders.length > 0
        ? sensitiveHeaders
        : ['authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token']
      ).map((s) => s.toLowerCase())
    );

    this.sensitiveQueryParams = new Set(
      (sensitiveQueryParams.length > 0
        ? sensitiveQueryParams
        : ['token', 'access_token', 'api_key', 'apikey', 'secret', 'password', 'key', 'auth', 'signature', 'bearer']
      ).map((s) => s.toLowerCase())
    );
  }

  public updateRules(headers: string[], queryParams: string[]): void {
    this.sensitiveHeaders = new Set(headers.map((s) => s.toLowerCase()));
    this.sensitiveQueryParams = new Set(queryParams.map((s) => s.toLowerCase()));
  }

  public sanitizeRecord(record: NetworkRecord): NetworkRecord {
    const requestHeaders = this.sanitizeHeaders(record.requestHeaders);
    const responseHeaders = this.sanitizeHeaders(record.responseHeaders);
    const [uri, queryParams] = this.sanitizeUri(record.uri, record.queryParams);
    const requestBody = this.sanitizeJsonBody(record.requestBody);
    const responseBody = this.sanitizeJsonBody(record.responseBody);

    return {
      ...record,
      uri,
      queryParams,
      requestHeaders,
      responseHeaders,
      requestBody,
      responseBody,
    };
  }

  public sanitizeHeaders(headers: Record<string, string[]>): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [key, val] of Object.entries(headers)) {
      if (this.sensitiveHeaders.has(key.toLowerCase())) {
        result[key] = ['[REDACTED]'];
      } else {
        result[key] = [...val];
      }
    }
    return result;
  }

  public sanitizeUri(uriStr: string, currentParams: Record<string, string[]>): [string, Record<string, string[]>] {
    try {
      const parsed = new URL(uriStr);
      let changed = false;
      const newParams: Record<string, string[]> = {};

      parsed.searchParams.forEach((val, key) => {
        if (this.sensitiveQueryParams.has(key.toLowerCase())) {
          newParams[key] = ['[REDACTED]'];
          parsed.searchParams.set(key, '[REDACTED]');
          changed = true;
        } else {
          if (!newParams[key]) newParams[key] = [];
          newParams[key].push(val);
        }
      });

      return [changed ? parsed.toString() : uriStr, newParams];
    } catch {
      return [uriStr, currentParams];
    }
  }

  public sanitizeJsonBody(body?: string): string | undefined {
    if (!body || body.trim().length === 0) return body;
    const trimmed = body.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return body;

    try {
      const parsed = JSON.parse(trimmed);
      const sanitized = this.sanitizeJsonValue(parsed);
      return JSON.stringify(sanitized, null, 2);
    } catch {
      return body;
    }
  }

  private sanitizeJsonValue(val: any): any {
    if (val && typeof val === 'object') {
      if (Array.isArray(val)) {
        return val.map((item) => this.sanitizeJsonValue(item));
      }
      const res: Record<string, any> = {};
      for (const [k, v] of Object.entries(val)) {
        if (this.sensitiveQueryParams.has(k.toLowerCase())) {
          res[k] = '[REDACTED]';
        } else {
          res[k] = this.sanitizeJsonValue(v);
        }
      }
      return res;
    } else if (typeof val === 'string') {
      const trimmed = val.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          const parsed = JSON.parse(trimmed);
          const sanitized = this.sanitizeJsonValue(parsed);
          return JSON.stringify(sanitized);
        } catch {
          return val;
        }
      }
    }
    return val;
  }

  public toCurl(record: NetworkRecord, sanitize = true): string {
    const target = sanitize ? this.sanitizeRecord(record) : record;
    let curl = `curl -X ${target.method} '${target.uri}'`;

    for (const [k, vals] of Object.entries(target.requestHeaders)) {
      for (const v of vals) {
        curl += ` \\\n  -H '${k}: ${v}'`;
      }
    }

    if (target.requestBody && target.requestBody.length > 0) {
      const escaped = target.requestBody.replace(/'/g, "'\\''");
      curl += ` \\\n  --data '${escaped}'`;
    }

    return curl;
  }

  public exportHar(records: NetworkRecord[], sanitize = true): string {
    const targetRecords = sanitize ? records.map((r) => this.sanitizeRecord(r)) : records;

    const entries = targetRecords.map((r) => {
      const startedDateTime = new Date(Math.floor(r.startTime / 1000)).toISOString();
      const time = r.durationMs || 0;

      const reqHeaders = Object.entries(r.requestHeaders).flatMap(([name, vals]) =>
        vals.map((value) => ({ name, value }))
      );

      const queryString = Object.entries(r.queryParams).flatMap(([name, vals]) =>
        vals.map((value) => ({ name, value }))
      );

      const respHeaders = Object.entries(r.responseHeaders).flatMap(([name, vals]) =>
        vals.map((value) => ({ name, value }))
      );

      const postData = r.requestBody
        ? {
            mimeType: r.requestHeaders['content-type']?.[0] || 'application/json',
            text: r.requestBody,
          }
        : undefined;

      const responseContent = {
        size: r.responseSize || (r.responseBody ? r.responseBody.length : 0),
        mimeType: r.responseHeaders['content-type']?.[0] || 'application/json',
        text: r.responseBody,
      };

      return {
        startedDateTime,
        time,
        request: {
          method: r.method,
          url: r.uri,
          httpVersion: 'HTTP/1.1',
          headers: reqHeaders,
          queryString,
          cookies: [],
          headersSize: -1,
          bodySize: r.requestSize || (r.requestBody ? r.requestBody.length : 0),
          postData,
        },
        response: {
          status: r.statusCode || (r.error ? 0 : 200),
          statusText: r.statusText || (r.error ? 'Error' : 'OK'),
          httpVersion: 'HTTP/1.1',
          headers: respHeaders,
          cookies: [],
          content: responseContent,
          redirectURL: '',
          headersSize: -1,
          bodySize: r.responseSize || (r.responseBody ? r.responseBody.length : 0),
        },
        cache: {},
        timings: {
          send: 0,
          wait: time,
          receive: 0,
        },
      };
    });

    const har = {
      log: {
        version: '1.2',
        creator: {
          name: 'Flutter Network Inspector',
          version: '1.0.0',
        },
        entries,
      },
    };

    return JSON.stringify(har, null, 2);
  }

  public exportJson(records: NetworkRecord[], sanitize = true): string {
    const targetRecords = sanitize ? records.map((r) => this.sanitizeRecord(r)) : records;
    const session = {
      generator: 'Flutter Network Inspector',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      totalRecords: targetRecords.length,
      records: targetRecords,
    };
    return JSON.stringify(session, null, 2);
  }
}

