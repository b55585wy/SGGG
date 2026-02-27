export type EventType =
  | 'page_view'
  | 'page_dwell'
  | 'interaction'
  | 'branch_select'
  | 'story_complete'
  | 'read_aloud_play';

export interface PageViewPayload { behavior_anchor: string }
export interface PageDwellPayload { duration_ms: number }
export interface InteractionPayload { event_key: string; latency_ms: number }
export interface BranchSelectPayload { choice_id: string }
export interface StoryCompletePayload { completion_rate: number }
export interface ReadAloudPlayPayload { enabled: boolean; page_id: string }

export type TelemetryPayload =
  | PageViewPayload
  | PageDwellPayload
  | InteractionPayload
  | BranchSelectPayload
  | StoryCompletePayload
  | ReadAloudPlayPayload;

export interface TelemetryEvent {
  event_id: string;
  schema_version: 'telemetry-1.0.0';
  ts_client_ms: number;
  session_id: string;
  story_id: string;
  page_id?: string;
  event_type: EventType;
  payload: TelemetryPayload;
}

export interface TelemetryReportRequest {
  events: TelemetryEvent[];
}

export interface TelemetryReportResponse {
  accepted: number;
  deduped: number;
  rejected: number;
}
