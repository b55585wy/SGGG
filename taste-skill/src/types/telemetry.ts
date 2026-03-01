export type EventType =
  | 'page_view'
  | 'page_dwell'
  | 'interaction'
  | 'interaction_start'
  | 'branch_select'
  | 'story_complete'
  | 'read_aloud_play'
  | 'page_back'
  | 'session_visibility'
  | 'pre_session_survey';

export interface PageViewPayload { behavior_anchor: string }
export interface PageDwellPayload { duration_ms: number }
export interface InteractionPayload { event_key: string; latency_ms: number }
export interface InteractionStartPayload { interaction_type: string; event_key: string }
export interface BranchSelectPayload { choice_id: string }
export interface StoryCompletePayload { completion_rate: number }
export interface ReadAloudPlayPayload { enabled: boolean; page_id: string }
export interface PageBackPayload { from_page: number; to_page: number }
export interface SessionVisibilityPayload { state: 'hidden' | 'visible' }
export interface PreSessionSurveyPayload {
  child_state: 'energetic' | 'tired' | 'fussy';
  food_familiarity: number;
  is_mealtime: 'at_table' | 'before_meal' | 'other';
  target_food: string;
}

export type TelemetryPayload =
  | PageViewPayload
  | PageDwellPayload
  | InteractionPayload
  | InteractionStartPayload
  | BranchSelectPayload
  | StoryCompletePayload
  | ReadAloudPlayPayload
  | PageBackPayload
  | SessionVisibilityPayload
  | PreSessionSurveyPayload;

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
