import assert from 'node:assert';
import { VmServiceClient } from '../vm_service/client';

describe('VmServiceClient (TypeScript)', () => {
  it('normalizes HTTP URI to WebSocket URI ending with /ws', () => {
    assert.strictEqual(VmServiceClient.normalizeWsUri('http://127.0.0.1:8181/abc=/'), 'ws://127.0.0.1:8181/abc=/ws');
    assert.strictEqual(VmServiceClient.normalizeWsUri('http://127.0.0.1:8181/abc='), 'ws://127.0.0.1:8181/abc=/ws');
    assert.strictEqual(VmServiceClient.normalizeWsUri('ws://127.0.0.1:8181/abc=/ws'), 'ws://127.0.0.1:8181/abc=/ws');
    assert.strictEqual(VmServiceClient.normalizeWsUri('https://remote.dev:443/token=/'), 'wss://remote.dev/token=/ws');
    assert.strictEqual(VmServiceClient.normalizeWsUri('https://remote.dev:8443/token=/'), 'wss://remote.dev:8443/token=/ws');
  });

  it('masks authentication tokens in logs', () => {
    const masked = VmServiceClient.maskUri('ws://127.0.0.1:8181/T-6POZAeusQ=/ws');
    assert.ok(!masked.includes('T-6POZAeusQ'));
    assert.ok(masked.includes('[REDACTED]'));
  });
});
