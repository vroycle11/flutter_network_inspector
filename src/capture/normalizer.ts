import { NetworkRecord, TimingEvent, RequestState } from '../types';

export class CaptureNormalizer {
  private maxBodyBytes: number;

  constructor(maxBodyBytes = 512 * 1024) {
    this.maxBodyBytes = maxBodyBytes;
  }

  public setMaxBodyBytes(bytes: number): void {
    this.maxBodyBytes = bytes;
  }

  public normalizeSummary(raw: any): NetworkRecord {
    const id = String(raw.id || '');
    const isolateId = raw.isolateId ? String(raw.isolateId) : undefined;
    const method = String(raw.method || 'GET').toUpperCase();
    const uriStr = String(raw.uri || '');

    let path = uriStr;
    let host = '';
    const queryParams: Record<string, string[]> = {};

    try {
      const parsed = new URL(uriStr);
      path = parsed.pathname;
      host = parsed.host;
      parsed.searchParams.forEach((val, key) => {
        if (!queryParams[key]) queryParams[key] = [];
        queryParams[key].push(val);
      });
    } catch {
      // Relative or non-standard URI
    }

    const startTime = typeof raw.startTime === 'number' ? raw.startTime : 0;
    const endTime = typeof raw.endTime === 'number' ? raw.endTime : undefined;
    let durationMs: number | undefined;
    if (endTime && startTime > 0) {
      durationMs = (endTime - startTime) / 1000.0;
    }

    const reqMap = raw.request || {};
    const respMap = raw.response;

    const requestHeaders = this.normalizeHeaders(reqMap.headers);
    const responseHeaders = this.normalizeHeaders(respMap?.headers);

    const statusCode = typeof respMap?.statusCode === 'number' ? respMap.statusCode : undefined;
    const statusText = respMap?.reasonPhrase ? String(respMap.reasonPhrase) : undefined;

    const error = reqMap.error ? String(reqMap.error) : undefined;

    let state: RequestState = 'pending';
    if (error) {
      state = 'failed';
    } else if (statusCode !== undefined) {
      state = statusCode >= 400 ? 'failed' : 'completed';
    } else if (endTime !== undefined) {
      state = 'completed';
    }

    const events: TimingEvent[] = [];
    if (Array.isArray(raw.events)) {
      for (const e of raw.events) {
        if (e && typeof e.timestamp === 'number') {
          events.push({
            timestamp: e.timestamp,
            event: String(e.event || ''),
          });
        }
      }
    }

    return {
      id,
      isolateId,
      method,
      uri: uriStr,
      path: path || '/',
      host,
      queryParams,
      statusCode,
      statusText,
      startTime,
      endTime,
      durationMs,
      requestHeaders,
      responseHeaders,
      requestSize: typeof reqMap.contentLength === 'number' && reqMap.contentLength > 0 ? reqMap.contentLength : undefined,
      responseSize: typeof respMap?.contentLength === 'number' && respMap.contentLength > 0 ? respMap.contentLength : undefined,
      error,
      events,
      state,
      source: 'vm_service',
      hasDetails: false,
      isRequestBodyTruncated: false,
      isResponseBodyTruncated: false,
    };
  }

  public normalizeDetail(summary: NetworkRecord, rawDetail: any): NetworkRecord {
    const base = this.normalizeSummary(rawDetail);

    const [reqBody, reqTruncated, reqLen] = this.decodeBody(rawDetail.requestBody);
    const [respBody, respTruncated, respLen] = this.decodeBody(rawDetail.responseBody);

    const effectiveReqSize = base.requestSize || (reqLen > 0 ? reqLen : undefined);
    const effectiveRespSize = base.responseSize || (respLen > 0 ? respLen : undefined);

    return {
      ...base,
      id: summary.id,
      isolateId: summary.isolateId || base.isolateId,
      requestBody: reqBody,
      responseBody: respBody,
      isRequestBodyTruncated: reqTruncated,
      isResponseBodyTruncated: respTruncated,
      requestSize: effectiveReqSize,
      responseSize: effectiveRespSize,
      hasDetails: true,
    };
  }

  private decodeBody(rawBody: any): [string | undefined, boolean, number] {
    if (rawBody === undefined || rawBody === null) {
      return [undefined, false, 0];
    }

    let bytes: Uint8Array;
    if (Array.isArray(rawBody)) {
      bytes = new Uint8Array(rawBody);
    } else if (rawBody instanceof Uint8Array || Buffer.isBuffer(rawBody)) {
      bytes = rawBody;
    } else if (typeof rawBody === 'string') {
      return [rawBody, false, rawBody.length];
    } else {
      return [undefined, false, 0];
    }

    const totalBytes = bytes.length;
    if (totalBytes === 0) return ['', false, 0];

    let truncated = false;
    let slice = bytes;
    if (totalBytes > this.maxBodyBytes) {
      slice = bytes.subarray(0, this.maxBodyBytes);
      truncated = true;
    }

    try {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const text = decoder.decode(slice);
      return [text, truncated, totalBytes];
    } catch {
      return [`[Binary data: ${totalBytes} bytes]`, false, totalBytes];
    }
  }

  private normalizeHeaders(rawHeaders: any): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    if (!rawHeaders || typeof rawHeaders !== 'object') return result;

    for (const [key, val] of Object.entries(rawHeaders)) {
      const lowerKey = key.toLowerCase();
      if (Array.isArray(val)) {
        result[lowerKey] = val.map(String);
      } else if (val !== null && val !== undefined) {
        result[lowerKey] = [String(val)];
      }
    }

    return result;
  }
}

