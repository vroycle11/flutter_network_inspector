import assert from 'node:assert';
import { CaptureNormalizer } from '../capture/normalizer';

describe('CaptureNormalizer (TypeScript)', () => {
  const normalizer = new CaptureNormalizer(100);

  it('normalizes basic summary request', () => {
    const raw = {
      id: 'vm_1',
      isolateId: 'isolates/123',
      method: 'POST',
      uri: 'https://api.example.com/items?limit=10&token=secret123',
      startTime: 1000000,
      endTime: 1045000,
      request: {
        headers: {
          'content-type': ['application/json'],
          authorization: ['Bearer secret_token'],
        },
        contentLength: 42,
      },
      response: {
        statusCode: 201,
        reasonPhrase: 'Created',
        headers: {
          'content-type': ['application/json'],
        },
        contentLength: 128,
      },
      events: [
        { timestamp: 1010000, event: 'Request sent' },
        { timestamp: 1040000, event: 'Waiting (TTFB)' },
      ],
    };

    const record = normalizer.normalizeSummary(raw);
    assert.strictEqual(record.id, 'vm_1');
    assert.strictEqual(record.method, 'POST');
    assert.strictEqual(record.host, 'api.example.com');
    assert.strictEqual(record.path, '/items');
    assert.deepStrictEqual(record.queryParams['limit'], ['10']);
    assert.deepStrictEqual(record.queryParams['token'], ['secret123']);
    assert.strictEqual(record.statusCode, 201);
    assert.strictEqual(record.durationMs, 45);
    assert.strictEqual(record.state, 'completed');
    assert.strictEqual(record.events.length, 2);
    assert.strictEqual(record.hasDetails, false);
  });

  it('normalizes failed request', () => {
    const raw = {
      id: 'vm_2',
      method: 'GET',
      uri: 'https://api.example.com/fail',
      startTime: 2000000,
      request: {
        error: 'SocketException: OS Error: Connection refused, errno = 61',
      },
    };

    const record = normalizer.normalizeSummary(raw);
    assert.strictEqual(record.id, 'vm_2');
    assert.strictEqual(record.state, 'failed');
    assert.ok(record.error?.includes('Connection refused'));
    assert.strictEqual(record.statusCode, undefined);
  });

  it('normalizes detail request with UTF-8 byte bodies', () => {
    const summary = normalizer.normalizeSummary({
      id: 'vm_3',
      method: 'POST',
      uri: 'https://api.example.com/login',
      startTime: 3000000,
    });

    const encoder = new TextEncoder();
    const reqBytes = Array.from(encoder.encode(JSON.stringify({ user: 'bob' })));
    const respBytes = Array.from(encoder.encode(JSON.stringify({ token: 'jwt.xyz' })));

    const rawDetail = {
      id: 'vm_3',
      method: 'POST',
      uri: 'https://api.example.com/login',
      startTime: 3000000,
      requestBody: reqBytes,
      responseBody: respBytes,
    };

    const detailed = normalizer.normalizeDetail(summary, rawDetail);
    assert.strictEqual(detailed.hasDetails, true);
    assert.ok(detailed.requestBody?.includes('"user":"bob"'));
    assert.ok(detailed.responseBody?.includes('"token":"jwt.xyz"'));
    assert.strictEqual(detailed.isRequestBodyTruncated, false);
  });

  it('truncates bodies exceeding maxBodyBytes', () => {
    const summary = normalizer.normalizeSummary({
      id: 'vm_4',
      method: 'GET',
      uri: 'https://api.example.com/large',
      startTime: 4000000,
    });

    const bigArray = new Array(300).fill(65); // 300 'A' bytes, max is 100
    const rawDetail = {
      id: 'vm_4',
      method: 'GET',
      uri: 'https://api.example.com/large',
      startTime: 4000000,
      responseBody: bigArray,
    };

    const detailed = normalizer.normalizeDetail(summary, rawDetail);
    assert.strictEqual(detailed.isResponseBodyTruncated, true);
    assert.strictEqual(detailed.responseBody?.length, 100);
    assert.strictEqual(detailed.responseSize, 300);
  });
});

