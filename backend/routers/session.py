import uuid
from fastapi import APIRouter, HTTPException
from models import SessionStartRequest, SessionStartResponse
from database import get_db

router = APIRouter(prefix="/api/v1/session", tags=["session"])


@router.post("/start", response_model=SessionStartResponse)
def session_start(req: SessionStartRequest):
    with get_db() as db:
        # Check story exists
        story = db.execute("SELECT story_id FROM stories WHERE story_id = ?", (req.story_id,)).fetchone()
        if not story:
            raise HTTPException(404, detail={"error": {"code": "NOT_FOUND", "message": "story not found"}})

        # Idempotency: check existing session for (story_id, client_session_token)
        existing = db.execute(
            "SELECT session_id FROM sessions WHERE story_id = ? AND client_session_token = ?",
            (req.story_id, req.client_session_token),
        ).fetchone()

        if existing:
            return SessionStartResponse(session_id=existing["session_id"], status="existed")

        session_id = "ss_" + uuid.uuid4().hex[:16]
        db.execute(
            "INSERT INTO sessions (session_id, story_id, client_session_token) VALUES (?, ?, ?)",
            (session_id, req.story_id, req.client_session_token),
        )

    return SessionStartResponse(session_id=session_id, status="created")
