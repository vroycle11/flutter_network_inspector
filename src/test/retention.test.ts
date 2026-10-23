import assert from 'node:assert';
import { RetentionManager } from '../capture/retention';
import { NetworkRecord, RetentionSettings } from '../types';

describe('RetentionManager (TypeScript)', () => {
  const settings: RetentionSettings = {
    maxRequests: 3,
    maxBodySizeBytes: 1024,
    maxTotalBodyBudgetMB: 1, // 1 MB
    pollingIntervalMs: 400,
    autoConnect: true,
    sensitiveHeaders: [],
    sensitiveQueryParams: [],
    debugLogging: false,
  };

  it('enforces maxRequests bounded retention', () => {
    const manager = new RetentionManager(settings);

    for (let i = 1; i <= 5; i++) {
      const rec: NetworkRecord = {
        id: `rec_${i}`,
        method: 'GET',
        uri: `https://api.example.com/${i}`,
        path: `/${i}`,
        host: 'api.example.com',
        queryParams: {},
        startTime: i * 1000,
        requestHeaders: {},
        responseHeaders: {},
        events: [],
        state: 'completed',
        source: 'vm_service',
        hasDetails: false,
        isRequestBodyTruncated: false,
        isResponseBodyTruncated: false,
      };
      manager.addOrUpdate(rec);
    }

    assert.strictEqual(manager.count, 3);
    const ids = manager.getAll().map((r) => r.id);
    assert.deepStrictEqual(ids, ['rec_3', 'rec_4', 'rec_5']);
  });

  it('evicts bodies when total body budget is exceeded', () => {
    const tightSettings: RetentionSettings = {
      ...settings,
      maxRequests: 10,
      maxTotalBodyBudgetMB: 0.0004, // ~419 bytes
    };
    const manager = new RetentionManager(tightSettings);

    const makeRecWithBody = (id: string, bodyLen: number): NetworkRecord => ({
      id,
      method: 'GET',
      uri: `https://api.example.com/${id}`,
      path: `/${id}`,
      host: 'api.example.com',
      queryParams: {},
      startTime: 1000,
      requestHeaders: {},
      responseHeaders: {},
      responseBody: 'A'.repeat(bodyLen),
      events: [],
      state: 'completed',
      source: 'vm_service',
      hasDetails: true,
      isRequestBodyTruncated: false,
      isResponseBodyTruncated: false,
    });

    manager.addOrUpdate(makeRecWithBody('rec_1', 300));
    manager.addOrUpdate(makeRecWithBody('rec_2', 300));

    assert.strictEqual(manager.count, 2);
    assert.ok(manager.evictedBodiesCount > 0);
    assert.ok(manager.get('rec_1')?.responseBody?.includes('evicted'));
    assert.strictEqual(manager.get('rec_2')?.responseBody, 'A'.repeat(300));
  });

  it('preserves loaded details and bodies when updating with summary record', () => {
    const manager = new RetentionManager(settings);
    const detailedRec: NetworkRecord = {
      id: 'rec_detail',
      method: 'GET',
      uri: 'https://api.example.com/test',
      path: '/test',
      host: 'api.example.com',
      queryParams: { q: ['1'] },
      startTime: 1000,
      endTime: 1200,
      durationMs: 200,
      statusCode: 200,
      requestHeaders: { accept: ['application/json'] },
      responseHeaders: { 'content-type': ['application/json'] },
      requestBody: '{"input":1}',
      responseBody: '{"output":"success"}',
      events: [],
      state: 'completed',
      source: 'vm_service',
      hasDetails: true,
      isRequestBodyTruncated: false,
      isResponseBodyTruncated: false,
    };

    manager.addOrUpdate(detailedRec);
    assert.strictEqual(manager.get('rec_detail')?.hasDetails, true);
    assert.strictEqual(manager.get('rec_detail')?.responseBody, '{"output":"success"}');

    // Subsequent poll produces summary record with hasDetails: false and undefined bodies
    const summaryRec: NetworkRecord = {
      id: 'rec_detail',
      method: 'GET',
      uri: 'https://api.example.com/test',
      path: '/test',
      host: 'api.example.com',
      queryParams: { q: ['1'] },
      startTime: 1000,
      endTime: 1250,
      durationMs: 250,
      statusCode: 200,
      requestHeaders: {},
      responseHeaders: {},
      events: [],
      state: 'completed',
      source: 'vm_service',
      hasDetails: false,
      isRequestBodyTruncated: false,
      isResponseBodyTruncated: false,
    };

    manager.addOrUpdate(summaryRec);
    const updated = manager.get('rec_detail');
    assert.strictEqual(updated?.hasDetails, true);
    assert.strictEqual(updated?.responseBody, '{"output":"success"}');
    assert.strictEqual(updated?.requestBody, '{"input":1}');
    assert.strictEqual(updated?.durationMs, 250);
  });
});

