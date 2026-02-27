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

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

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

export const storyGenerate = (body: GenerateRequest) =>
  request<GenerateResponse>('/api/v1/story/generate', body);

export const storyRegenerate = (body: RegenerateRequest) =>
  request<GenerateResponse>('/api/v1/story/regenerate', body);

export const sessionStart = (body: SessionStartRequest) =>
  request<SessionStartResponse>('/api/v1/session/start', body);

export const telemetryReport = (body: TelemetryReportRequest) =>
  request<TelemetryReportResponse>('/api/v1/telemetry/report', body);

export const feedbackSubmit = (body: FeedbackSubmitRequest) =>
  request<FeedbackSubmitResponse>('/api/v1/feedback/submit', body);
