import { NetworkRecord, RetentionSettings } from '../types';

export class RetentionManager {
  private records = new Map<string, NetworkRecord>();
  private bodySizes = new Map<string, number>();
  private _currentTotalBodyBytes = 0;
  private _evictedBodiesCount = 0;

  private settings: RetentionSettings;

  constructor(settings: RetentionSettings) {
    this.settings = settings;
  }

  public updateSettings(newSettings: RetentionSettings): void {
    this.settings = newSettings;
    this.enforceLimits();
  }

  public get count(): number {
    return this.records.size;
  }

  public get currentTotalBodyBytes(): number {
    return this._currentTotalBodyBytes;
  }

  public get evictedBodiesCount(): number {
    return this._evictedBodiesCount;
  }

  public getAll(): NetworkRecord[] {
    return Array.from(this.records.values());
  }

  public get(id: string): NetworkRecord | undefined {
    return this.records.get(id);
  }

  public addOrUpdate(record: NetworkRecord): NetworkRecord {
    if (this.records.has(record.id)) {
      this.subtractBodySize(record.id);
    }

    this.records.set(record.id, record);
    this.trackBodySize(record);

    this.enforceLimits();
    return this.records.get(record.id)!;
  }

  public remove(id: string): boolean {
    if (this.records.has(id)) {
      this.subtractBodySize(id);
      return this.records.delete(id);
    }
    return false;
  }

  public clear(): void {
    this.records.clear();
    this.bodySizes.clear();
    this._currentTotalBodyBytes = 0;
    this._evictedBodiesCount = 0;
  }

  private trackBodySize(record: NetworkRecord): void {
    let size = 0;
    if (record.requestBody) size += record.requestBody.length;
    if (record.responseBody) size += record.responseBody.length;

    this.bodySizes.set(record.id, size);
    this._currentTotalBodyBytes += size;
  }

  private subtractBodySize(id: string): void {
    const size = this.bodySizes.get(id) || 0;
    this.bodySizes.delete(id);
    this._currentTotalBodyBytes = Math.max(0, this._currentTotalBodyBytes - size);
  }

  private enforceLimits(): void {
    // 1. Enforce maxRequests
    while (this.records.size > this.settings.maxRequests) {
      const oldestId = this.records.keys().next().value;
      if (!oldestId) break;
      this.subtractBodySize(oldestId);
      this.records.delete(oldestId);
    }

    // 2. Enforce total body budget in MB
    const maxBudgetBytes = this.settings.maxTotalBodyBudgetMB * 1024 * 1024;
    if (this._currentTotalBodyBytes <= maxBudgetBytes) return;

    for (const [id, rec] of this.records.entries()) {
      if (this._currentTotalBodyBytes <= maxBudgetBytes) break;

      if (rec.requestBody || rec.responseBody) {
        this.subtractBodySize(id);
        const updated: NetworkRecord = {
          ...rec,
          requestBody: rec.requestBody ? '[Body evicted by memory retention policy]' : undefined,
          responseBody: rec.responseBody ? '[Body evicted by memory retention policy]' : undefined,
          isRequestBodyTruncated: true,
          isResponseBodyTruncated: true,
        };
        this.records.set(id, updated);
        this._evictedBodiesCount++;
      }
    }
  }
}

