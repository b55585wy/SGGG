from typing import Any, Literal, Optional
from pydantic import BaseModel


# ── 通用错误 ──────────────────────────────────────────────────
class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[dict] = None

class ErrorResponse(BaseModel):
    error: ErrorDetail


# ── Story Generate ────────────────────────────────────────────
class ChildProfile(BaseModel):
    nickname: str
    age: int
    gender: str
    avatar_traits: Optional[dict] = None

class MealContext(BaseModel):
    target_food: str
    meal_score: int
    meal_text: str = ""
    possible_reason: Optional[str] = None
    session_mood: Optional[str] = "neutral"

class StoryConfig(BaseModel):
    story_type: str
    difficulty: str = "medium"
    pages: int = 8
    interactive_density: str = "medium"
    must_include_positive_feedback: bool = True
    language: str = "zh-CN"

class HistoryContext(BaseModel):
    previous_summaries: Optional[list[str]] = None
    used_story_types: Optional[list[str]] = None

class GenerateRequest(BaseModel):
    child_profile: ChildProfile
    meal_context: MealContext
    story_config: StoryConfig
    history_context: Optional[HistoryContext] = None


# ── Story Regenerate ──────────────────────────────────────────
class RegenerateRequest(BaseModel):
    previous_story_id: str
    target_food: str
    story_type: str
    dissatisfaction_reason: str
    dislike_reason: Optional[str] = None


# ── Session ───────────────────────────────────────────────────
class SessionStartRequest(BaseModel):
    story_id: str
    client_session_token: str

class SessionStartResponse(BaseModel):
    session_id: str
    status: Literal["created", "existed"]


# ── Telemetry ─────────────────────────────────────────────────
class TelemetryEvent(BaseModel):
    event_id: str
    schema_version: str
    ts_client_ms: int
    session_id: str
    story_id: Optional[str] = None
    page_id: Optional[str] = None
    event_type: str
    payload: Optional[dict[str, Any]] = None

class TelemetryReportRequest(BaseModel):
    events: list[TelemetryEvent]

class TelemetryReportResponse(BaseModel):
    accepted: int
    deduped: int
    rejected: int


# ── Feedback ──────────────────────────────────────────────────
class FeedbackSubmitRequest(BaseModel):
    session_id: str
    status: Literal["COMPLETED", "ABORTED"]
    try_level: Optional[str] = None
    abort_reason: Optional[str] = None
    notes: Optional[str] = None

class FeedbackSubmitResponse(BaseModel):
    ok: bool
