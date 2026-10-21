import assert from 'node:assert';
import { DataSanitizer } from '../capture/sanitizer';
import { NetworkRecord } from '../types';

describe('DataSanitizer (TypeScript)', () => {
  const sanitizer = new DataSanitizer();

  const mockRecord: NetworkRecord = {
    id: 'sec_1',
    method: 'POST',
    uri: 'https://api.example.com/login?token=secret_abc123&client=mobile',
    path: '/login',
    host: 'api.example.com',
    queryParams: {
      token: ['secret_abc123'],
      client: ['mobile'],
    },
    startTime: 1000,
    requestHeaders: {
      authorization: ['Bearer jwt_secret_token_123'],
      cookie: ['session_id=sess_xyz'],
      'content-type': ['application/json'],
    },
    responseHeaders: {
      'content-type': ['application/json'],
    },
    requestBody: JSON.stringify({ user: 'alice', password: 'my_super_secret_password' }),
    responseBody: JSON.stringify({ token: 'returned_token_val', status: 'ok' }),
    events: [],
    state: 'completed',
    source: 'vm_service',
    hasDetails: true,
    isRequestBodyTruncated: false,
    isResponseBodyTruncated: false,
  };

  it('redacts sensitive headers', () => {
    const sanitized = sanitizer.sanitizeRecord(mockRecord);
    assert.deepStrictEqual(sanitized.requestHeaders['authorization'], ['[REDACTED]']);
    assert.deepStrictEqual(sanitized.requestHeaders['cookie'], ['[REDACTED]']);
    assert.deepStrictEqual(sanitized.requestHeaders['content-type'], ['application/json']);
  });

  it('redacts sensitive query parameters and URL', () => {
    const sanitized = sanitizer.sanitizeRecord(mockRecord);
    assert.deepStrictEqual(sanitized.queryParams['token'], ['[REDACTED]']);
    assert.deepStrictEqual(sanitized.queryParams['client'], ['mobile']);
    assert.ok(sanitized.uri.includes('token=%5BREDACTED%5D'));
    assert.ok(!sanitized.uri.includes('secret_abc123'));
  });

  it('redacts sensitive JSON keys in request body', () => {
    const sanitized = sanitizer.sanitizeRecord(mockRecord);
    assert.ok(sanitized.requestBody?.includes('"password": "[REDACTED]"'));
    assert.ok(!sanitized.requestBody?.includes('my_super_secret_password'));
  });

  it('generates sanitized cURL command', () => {
    const curl = sanitizer.toCurl(mockRecord, true);
    assert.ok(curl.includes("curl -X POST 'https://api.example.com/login?token=%5BREDACTED%5D&client=mobile'"));
    assert.ok(curl.includes("-H 'authorization: [REDACTED]'"));
    assert.ok(!curl.includes('jwt_secret_token_123'));
  });

  it('exports valid HAR 1.2 with sanitized secrets', () => {
    const harStr = sanitizer.exportHar([mockRecord], true);
    const har = JSON.parse(harStr);
    assert.strictEqual(har.log.version, '1.2');
    assert.strictEqual(har.log.entries.length, 1);
    const entry = har.log.entries[0];
    const authHeader = entry.request.headers.find((h: any) => h.name === 'authorization');
    assert.strictEqual(authHeader.value, '[REDACTED]');
  });
});

