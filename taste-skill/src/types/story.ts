export type BehaviorLevel = 'Lv1' | 'Lv2' | 'Lv3';

export type StoryType =
  | 'adventure'
  | 'daily_life'
  | 'fantasy'
  | 'animal_friend'
  | 'superhero';

export type InteractionType =
  | 'none'
  | 'tap'
  | 'choice'
  | 'drag'
  | 'mimic'
  | 'record_voice';

export type DissatisfactionReason =
  | 'too_long'
  | 'too_short'
  | 'too_scary'
  | 'too_preachy'
  | 'not_cute'
  | 'style_inconsistent'
  | 'interaction_unclear'
  | 'repetitive'
  | 'wrong_age_level'
  | 'other';

export type AbortReason =
  | 'bored'
  | 'scared'
  | 'distracted'
  | 'parent_stopped'
  | 'technical'
  | 'other';

export type TryLevel =
  | 'look'
  | 'smell'
  | 'touch'
  | 'lick'
  | 'bite'
  | 'chew'
  | 'swallow';

export type FeedbackStatus = 'COMPLETED' | 'ABORTED';

export interface Interaction {
  type: InteractionType;
  instruction: string;
  event_key: string;
  ext?: Record<string, unknown>;
}

export interface BranchChoice {
  choice_id: string;
  label: string;
  next_page_id: string;
}

export interface Page {
  page_no: number;
  page_id: string;
  behavior_anchor: BehaviorLevel;
  text: string;
  image_prompt: string;
  interaction: Interaction;
  branch_choices: BranchChoice[];
}

export interface BookMeta {
  title: string;
  subtitle: string;
  theme_food: string;
  story_type: StoryType;
  target_behavior_level: BehaviorLevel;
  summary: string;
  design_logic: string;
  global_visual_style: string;
}

export interface Ending {
  positive_feedback: string;
  next_micro_goal: string;
}

export interface TelemetrySuggestions {
  recommended_events: string[];
}

export interface Draft {
  schema_version: string;
  story_id: string;
  generated_at: string;
  book_meta: BookMeta;
  pages: Page[];
  ending: Ending;
  telemetry_suggestions: TelemetrySuggestions;
}

export interface ChildProfile {
  nickname: string;
  age: number;
  gender: string;
  avatar_traits?: {
    hair?: string;
    glasses?: boolean;
    cloth_color?: string;
  };
}

export interface MealContext {
  target_food: string;
  meal_score: number;
  meal_text: string;
  possible_reason?: string;
  session_mood?: string;
}

export interface StoryConfig {
  story_type: StoryType;
  difficulty: string;
  pages: number;
  interactive_density: string;
  must_include_positive_feedback: boolean;
  language: string;
}

export interface HistoryContext {
  previous_summaries?: string[];
  used_story_types?: string[];
}

export interface GenerateRequest {
  child_profile: ChildProfile;
  meal_context: MealContext;
  story_config: StoryConfig;
  history_context?: HistoryContext;
}

export interface GenerateResponse {
  draft: Draft;
}

export interface RegenerateRequest {
  previous_story_id: string;
  target_food: string;
  story_type: StoryType;
  dissatisfaction_reason: DissatisfactionReason;
  dislike_reason?: string;
}

export interface SessionStartRequest {
  story_id: string;
  client_session_token: string;
}

export interface SessionStartResponse {
  session_id: string;
  status: 'created' | 'existed';
}

export interface FeedbackSubmitRequest {
  session_id: string;
  status: FeedbackStatus;
  try_level?: TryLevel;
  abort_reason?: AbortReason;
  notes?: string;
}

export interface FeedbackSubmitResponse {
  ok: boolean;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
