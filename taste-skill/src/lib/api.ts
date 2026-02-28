import type {
  GenerateRequest,
  GenerateResponse,
  RegenerateRequest,
  SessionStartRequest,
  SessionStartResponse,
  FeedbackSubmitRequest,
  FeedbackSubmitResponse,
  ApiError,
} from '@/types/story';
import type {
  TelemetryReportRequest,
  TelemetryReportResponse,
} from '@/types/telemetry';
import { MOCK_DRAFT } from './mockData';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const IS_MOCK = import.meta.env.VITE_MOCK === 'true';

// Mock 延迟，模拟网络请求
function mockDelay<T>(data: T, ms = 1200): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
}

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(`API Error [${status}] ${code}`);
    this.name = 'ApiClientError';
  }
}

async function request<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err: ApiError = await res.json().catch(() => ({
      error: { code: 'UNKNOWN', message: res.statusText },
    }));
    throw new ApiClientError(res.status, err.error.code, err.error.details);
  }

  return res.json() as Promise<T>;
}

export const storyGenerate = (_body: GenerateRequest): Promise<GenerateResponse> => {
  if (IS_MOCK) {
    const draft = { ...MOCK_DRAFT, story_id: crypto.randomUUID(), generated_at: new Date().toISOString() };
    return mockDelay({ draft });
  }
  return request<GenerateResponse>('/api/v1/story/generate', _body);
};

export const storyRegenerate = (_body: RegenerateRequest): Promise<GenerateResponse> => {
  if (IS_MOCK) {
    const draft = { ...MOCK_DRAFT, story_id: crypto.randomUUID(), generated_at: new Date().toISOString() };
    return mockDelay({ draft }, 1500);
  }
  return request<GenerateResponse>('/api/v1/story/regenerate', _body);
};

export const sessionStart = (_body: SessionStartRequest): Promise<SessionStartResponse> => {
  if (IS_MOCK) {
    return mockDelay({ session_id: crypto.randomUUID(), status: 'created' as const }, 600);
  }
  return request<SessionStartResponse>('/api/v1/session/start', _body);
};

export const telemetryReport = (_body: TelemetryReportRequest): Promise<TelemetryReportResponse> => {
  if (IS_MOCK) {
    return mockDelay({ ok: true }, 0);
  }
  return request<TelemetryReportResponse>('/api/v1/telemetry/report', _body);
};

export const feedbackSubmit = (_body: FeedbackSubmitRequest): Promise<FeedbackSubmitResponse> => {
  if (IS_MOCK) {
    return mockDelay({ ok: true }, 800);
  }
  return request<FeedbackSubmitResponse>('/api/v1/feedback/submit', _body);
};

export const storyGet = (storyId: string): Promise<GenerateResponse> => {
  if (IS_MOCK) {
    const raw = localStorage.getItem('storybook_draft');
    const draft = raw ? JSON.parse(raw) : {};
    return mockDelay({ draft }, 0);
  }
  return fetch(`${BASE_URL}/api/v1/story/${storyId}`)
    .then(res => res.json() as Promise<GenerateResponse>);
};
