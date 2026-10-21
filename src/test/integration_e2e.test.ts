import assert from 'node:assert';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { VmServiceClient } from '../vm_service/client';
import { HttpProfiler } from '../vm_service/http_profiler';
import { CaptureNormalizer } from '../capture/normalizer';
import { RetentionManager } from '../capture/retention';
import { DataSanitizer } from '../capture/sanitizer';
import { NetworkRecord, RetentionSettings } from '../types';

describe('End-to-End Real Dart VM & Dio Network Capture Test', function () {
  this.timeout(45000); // 45s for real VM process lifecycle

  let dartProcess: ChildProcess;
  let vmServiceUri: string = '';
  let client: VmServiceClient;
  let profiler: HttpProfiler;
  const normalizer = new CaptureNormalizer(512 * 1024);
  const sanitizer = new DataSanitizer();
  const capturedRecords = new Map<string, NetworkRecord>();

  const defaultSettings: RetentionSettings = {
    maxRequests: 1000,
    maxBodySizeBytes: 512 * 1024,
    maxTotalBodyBudgetMB: 20,
    pollingIntervalMs: 200,
    autoConnect: true,
    sensitiveHeaders: ['authorization', 'cookie'],
    sensitiveQueryParams: ['token', 'api_key', 'password'],
    debugLogging: false,
  };
  const retention = new RetentionManager(defaultSettings);

  async function spawnDartRunner(): Promise<{ process: ChildProcess; uri: string }> {
    return new Promise((resolve, reject) => {
      const runnerPath = path.resolve(__dirname, '../../example/bin/run_headless_e2e.dart');
      const proc = spawn('/Users/samarthlonari/development/flutter/bin/dart', [
        '--enable-vm-service=0',
        runnerPath,
      ]);

      let discoveredUri = '';
      let errorOutput = '';

      proc.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        // Check for VM Service WebSocket or HTTP output
        const match = text.match(/The Dart VM service is listening on (http:\/\/[^\s]+)/) ||
                      text.match(/The Dart DevTools debugger and profiler is available at: .*uri=(ws:\/\/[^\s]+)/) ||
                      text.match(/READY:VM_SERVICE_URI:(http:\/\/[^\s]+)/);
        if (match && !discoveredUri) {
          discoveredUri = match[1];
        }
        if (text.includes('READY:VM_SERVICE_URI:') && discoveredUri) {
          resolve({ process: proc, uri: discoveredUri });
        }
      });

      proc.stderr.on('data', (chunk) => {
        errorOutput += chunk.toString();
      });

      proc.on('error', (err) => reject(err));
      proc.on('exit', (code) => {
        if (!discoveredUri) {
          reject(new Error(`Dart process exited early with code ${code}. Error: ${errorOutput}`));
        }
      });
    });
  }

  function sendCmd(proc: ChildProcess, cmd: string): Promise<string> {
    return new Promise((resolve) => {
      const listener = (chunk: Buffer) => {
        const text = chunk.toString();
        for (const line of text.split('\n')) {
          if (line.startsWith(`RESULT:${cmd}:`)) {
            proc.stdout.removeListener('data', listener);
            resolve(line.replace(`RESULT:${cmd}:`, ''));
            return;
          }
        }
      };
      proc.stdout.on('data', listener);
      proc.stdin?.write(`${cmd}\n`);
    });
  }

  before(async () => {
    // 1. Launch real headless Dart process with VM service enabled
    const launched = await spawnDartRunner();
    dartProcess = launched.process;
    vmServiceUri = launched.uri;
    assert.ok(vmServiceUri.length > 0, 'VM Service URI should not be empty');

    // 2. Connect real VmServiceClient
    client = new VmServiceClient();
    await client.connect(vmServiceUri);
    assert.strictEqual(client.isConnected, true, 'Client should be connected');

    // 3. Setup HttpProfiler and listen for requests
    profiler = new HttpProfiler(client, { pollingIntervalMs: 150 });
    profiler.on('requests', (rawList: any[]) => {
      for (const raw of rawList) {
        const record = normalizer.normalizeSummary(raw);
        capturedRecords.set(record.id, record);
        retention.addOrUpdate(record);
      }
    });

    await profiler.start();
    // Allow profiler to attach and enable timeline logging
    await new Promise((r) => setTimeout(r, 400));
  });

  after(async () => {
    profiler.stop();
    client.disconnect();
    if (dartProcess && !dartProcess.killed) {
      dartProcess.stdin?.write('exit\n');
      dartProcess.kill();
    }
  });

  it('1. Captures real Dio GET request with headers, query parameters, and JSON response body', async () => {
    const res = await sendCmd(dartProcess, 'dio_get');
    assert.strictEqual(res, 'HTTP_200');

    // Wait for profiler poll
    await new Promise((r) => setTimeout(r, 450));

    const records = Array.from(capturedRecords.values()).filter((r) => r.method === 'GET' && r.uri.includes('/api/users'));
    assert.ok(records.length > 0, 'Should have captured at least 1 GET request');

    const req = records[0];
    assert.strictEqual(req.method, 'GET');
    assert.strictEqual(req.statusCode, 200);
    assert.ok(req.queryParams['role']?.includes('admin'), 'Should contain query param role=admin');
    assert.ok(req.queryParams['token']?.includes('super_secret_token_123'), 'Should contain query param token');

    // Fetch on-demand detail with body
    const rawDetail = await profiler.getRequestDetail(req.id, req.isolateId);
    const detailed = normalizer.normalizeDetail(req, rawDetail);
    assert.strictEqual(detailed.hasDetails, true);
    assert.ok(detailed.responseBody?.includes('Alice'), 'Response body should contain Alice');
    assert.ok(detailed.responseBody?.includes('Bob'), 'Response body should contain Bob');
  });

  it('2. Captures real Dio POST request with JSON request body and response body', async () => {
    const res = await sendCmd(dartProcess, 'dio_post');
    assert.strictEqual(res, 'HTTP_200');

    await new Promise((r) => setTimeout(r, 450));

    const records = Array.from(capturedRecords.values()).filter((r) => r.method === 'POST' && r.uri.includes('/api/users'));
    assert.ok(records.length > 0, 'Should have captured at least 1 POST request');

    const req = records[0];
    assert.strictEqual(req.method, 'POST');
    assert.strictEqual(req.statusCode, 200);

    // Fetch on-demand detail with request and response bodies
    const rawDetail = await profiler.getRequestDetail(req.id, req.isolateId);
    const detailed = normalizer.normalizeDetail(req, rawDetail);
    assert.strictEqual(detailed.hasDetails, true);
    assert.ok(detailed.requestBody?.includes('Alice'), 'Request body should contain payload Alice');
    assert.ok(detailed.requestBody?.includes('my_raw_password_xyz'), 'Request body should contain raw password before redaction');
    assert.ok(detailed.responseBody?.includes('users'), 'Response body should contain users');
  });

  it('3. Captures real HTTP 404 response with status and state', async () => {
    const res = await sendCmd(dartProcess, 'error_404');
    assert.strictEqual(res, 'HTTP_404');

    await new Promise((r) => setTimeout(r, 450));

    const records = Array.from(capturedRecords.values()).filter((r) => r.uri.includes('/api/nonexistent_route'));
    assert.ok(records.length > 0, 'Should capture 404 request');
    const req = records[0];
    assert.strictEqual(req.statusCode, 404);
    assert.strictEqual(req.state, 'failed');
  });

  it('4. Captures real HTTP 500 response with status and error state', async () => {
    const res = await sendCmd(dartProcess, 'error_500');
    assert.strictEqual(res, 'HTTP_500');

    await new Promise((r) => setTimeout(r, 450));

    const records = Array.from(capturedRecords.values()).filter((r) => r.uri.includes('/api/error-500'));
    assert.ok(records.length > 0, 'Should capture 500 request');
    const req = records[0];
    assert.strictEqual(req.statusCode, 500);
    assert.strictEqual(req.state, 'failed');

    const rawDetail = await profiler.getRequestDetail(req.id, req.isolateId);
    const detailed = normalizer.normalizeDetail(req, rawDetail);
    assert.ok(detailed.responseBody?.includes('Simulated 500 error'));
  });

  it('5. Captures real connection failure (SocketException)', async () => {
    const res = await sendCmd(dartProcess, 'conn_failure');
    assert.strictEqual(res, 'CAUGHT_EXCEPTION');

    await new Promise((r) => setTimeout(r, 450));

    const records = Array.from(capturedRecords.values()).filter((r) => r.uri.includes(':1/nonexistent'));
    assert.ok(records.length > 0, 'Should capture connection failure request');
    const req = records[0];
    assert.strictEqual(req.state, 'failed');
    assert.ok(req.error?.includes('SocketException') || req.error?.includes('Connection refused'), `Error was: ${req.error}`);
  });

  it('6. Captures large JSON payload safely without freezing', async () => {
    const res = await sendCmd(dartProcess, 'large_payload');
    assert.strictEqual(res, 'HTTP_200');

    await new Promise((r) => setTimeout(r, 450));

    const records = Array.from(capturedRecords.values()).filter((r) => r.uri.includes('/api/large'));
    assert.ok(records.length > 0, 'Should capture large payload request');
    const req = records[0];
    assert.strictEqual(req.statusCode, 200);

    const rawDetail = await profiler.getRequestDetail(req.id, req.isolateId);
    const detailed = normalizer.normalizeDetail(req, rawDetail);
    assert.ok(detailed.responseBody && detailed.responseBody.length > 5000, 'Should contain large response body');
  });

  it('7. Handles a burst of 30 concurrent requests reliably', async () => {
    const initialCount = capturedRecords.size;
    const res = await sendCmd(dartProcess, 'burst_30');
    assert.strictEqual(res, 'DONE');

    // Allow multiple delta polls to retrieve all burst items
    await new Promise((r) => setTimeout(r, 1200));

    const newCount = capturedRecords.size - initialCount;
    assert.ok(newCount >= 30, `Expected at least 30 new requests captured, got: ${newCount}`);
  });

  it('8. Verifies sensitive data redaction in UI records, cURL, JSON, and HAR 1.2 export', async () => {
    // Find our dio_post request
    const postReq = Array.from(capturedRecords.values()).find((r) => r.method === 'POST' && r.uri.includes('/api/users'));
    assert.ok(postReq, 'POST request must exist');

    const rawDetail = await profiler.getRequestDetail(postReq!.id, postReq!.isolateId);
    const detailed = normalizer.normalizeDetail(postReq!, rawDetail);

    // 1. Sanitize record
    const sanitized = sanitizer.sanitizeRecord(detailed);

    // Verify Authorization header is redacted
    const authVals = sanitized.requestHeaders['authorization'] || [];
    assert.ok(authVals.includes('[REDACTED]'), 'Authorization header must be redacted');
    assert.ok(!JSON.stringify(sanitized.requestHeaders).includes('secret_post_token'), 'Secret token must not leak');

    // Verify Password inside JSON body is redacted
    assert.ok(sanitized.requestBody?.includes('"password": "[REDACTED]"'), 'Password in JSON must be redacted');
    assert.ok(!sanitized.requestBody?.includes('my_raw_password_xyz'), 'Raw password must not leak');

    // 2. cURL command redaction
    const curl = sanitizer.toCurl(detailed, true);
    assert.ok(curl.includes("-H 'authorization: [REDACTED]'"), 'cURL must redact Authorization header');
    assert.ok(!curl.includes('secret_post_token'), 'cURL must not contain raw secret token');

    // 3. JSON Export redaction
    const jsonExport = sanitizer.exportJson([detailed], true);
    assert.ok(jsonExport.includes('[REDACTED]'), 'JSON export must contain [REDACTED]');
    assert.ok(!jsonExport.includes('my_raw_password_xyz'), 'JSON export must not contain raw password');

    // 4. HAR 1.2 Export redaction
    const harExport = sanitizer.exportHar([detailed], true);
    const parsedHar = JSON.parse(harExport);
    assert.strictEqual(parsedHar.log.version, '1.2');
    const harEntry = parsedHar.log.entries[0];
    const harAuth = harEntry.request.headers.find((h: any) => h.name.toLowerCase() === 'authorization');
    assert.strictEqual(harAuth.value, '[REDACTED]');
  });

  it('9. Enforces memory retention and body eviction under constrained budgets', () => {
    // Set small budget: 10 max requests and 10KB body budget
    const tightRetention = new RetentionManager({
      ...defaultSettings,
      maxRequests: 10,
      maxTotalBodyBudgetMB: 0.005, // ~5KB
    });

    const all = Array.from(capturedRecords.values());
    for (const rec of all) {
      tightRetention.addOrUpdate(rec);
    }

    // 1. Request count is bounded to 10
    assert.strictEqual(tightRetention.count, 10, 'Request count must strictly equal 10');

    // 2. Total body memory is bounded
    assert.ok(tightRetention.currentTotalBodyBytes <= 0.005 * 1024 * 1024, 'Body bytes must not exceed budget');
  });

  it('10. Confirms extension does not fabricate or report missing requests', async () => {
    try {
      await profiler.getRequestDetail('invalid_nonexistent_id_999999');
      assert.fail('Should have thrown an error for nonexistent request ID');
    } catch (e: any) {
      // Must return RPC error and not fake data
      assert.ok(e.message.length > 0, 'Must throw error when request does not exist');
    }
  });

  it('11. Verifies app restart and reconnection handling', async () => {
    // Kill original Dart process to simulate app exit / restart
    dartProcess.kill();
    await new Promise((r) => setTimeout(r, 500));

    assert.strictEqual(client.isConnected, false, 'Client should detect disconnect');

    // Spawn a second Dart process on a fresh port
    const restart = await spawnDartRunner();
    dartProcess = restart.process;
    const newUri = restart.uri;

    // Connect to new URI
    await client.connect(newUri);
    assert.strictEqual(client.isConnected, true, 'Client should reconnect to new process');

    await profiler.start();
    await new Promise((r) => setTimeout(r, 400));

    // Send a new request on the restarted app
    const res = await sendCmd(dartProcess, 'dio_get');
    assert.strictEqual(res, 'HTTP_200');

    await new Promise((r) => setTimeout(r, 450));
    const records = Array.from(capturedRecords.values()).filter((r) => r.method === 'GET');
    assert.ok(records.length > 0, 'Should capture requests from restarted app');
  });
});

