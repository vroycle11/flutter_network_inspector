export interface TimingEvent {
  timestamp: number; // microseconds
  event: string;
}

export type RequestState = 'pending' | 'completed' | 'failed';
export type CaptureSource = 'vm_service' | 'dio_interceptor';

export interface NetworkRecord {
  id: string;
  isolateId?: string;
  method: string;
  uri: string;
  path: string;
  host: string;
  queryParams: Record<string, string[]>;
  statusCode?: number;
  statusText?: string;
  startTime: number; // microseconds
  endTime?: number; // microseconds
  durationMs?: number;
  requestHeaders: Record<string, string[]>;
  responseHeaders: Record<string, string[]>;
  requestSize?: number;
  responseSize?: number;
  requestBody?: string;
  responseBody?: string;
  isRequestBodyTruncated: boolean;
  isResponseBodyTruncated: boolean;
  error?: string;
  events: TimingEvent[];
  state: RequestState;
  source: CaptureSource;
  hasDetails: boolean;
}

export interface FilterCriteria {
  searchText?: string;
  methods: string[];
  statusGroup?: string; // 'all' | '2xx' | '3xx' | '4xx' | '5xx' | 'other'
  failedOnly?: boolean;
  searchBody?: boolean;
}

export interface RetentionSettings {
  maxRequests: number;
  maxBodySizeBytes: number;
  maxTotalBodyBudgetMB: number;
  pollingIntervalMs: number;
  autoConnect: boolean;
  sensitiveHeaders: string[];
  sensitiveQueryParams: string[];
  debugLogging: boolean;
}

export interface InspectorState {
  isConnected: boolean;
  isPaused: boolean;
  activeUri?: string;
  targetIsolate?: string;
  totalRecords: number;
  evictedBodies: number;
  bodyMemoryBytes: number;
}

