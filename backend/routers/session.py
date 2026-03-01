import uuid
from fastapi import APIRouter, HTTPException
from models import SessionStartRequest, SessionStartResponse
from database import get_db

router = APIRouter(prefix="/api/v1/session", tags=["session"])


@router.post("/start", response_model=SessionStartResponse)
def session_start(req: SessionStartRequest):
    with get_db() as db:
        story = db.execute("SELECT story_id FROM stories WHERE story_id = ?", (req.story_id,)).fetchone()
        if not story:
            raise HTTPException(404, detail={"error": {"code": "NOT_FOUND", "message": "story not found"}})

        existing = db.execute(
            "SELECT session_id, session_index FROM sessions WHERE story_id = ? AND client_session_token = ?",
            (req.story_id, req.client_session_token),
        ).fetchone()

        if existing:
            return SessionStartResponse(
                session_id=existing["session_id"],
                status="existed",
                session_index=existing["session_index"],
            )

        # 计算该孩子第几次使用（session_index = 历史 session 数量）
        session_index = 0
        if req.child_id:
            row = db.execute(
                "SELECT COUNT(*) as cnt FROM sessions WHERE child_id = ?",
                (req.child_id,),
            ).fetchone()
            session_index = row["cnt"] if row else 0

        session_id = "ss_" + uuid.uuid4().hex[:16]
        db.execute(
            "INSERT INTO sessions (session_id, story_id, child_id, session_index, client_session_token) VALUES (?, ?, ?, ?, ?)",
            (session_id, req.story_id, req.child_id, session_index, req.client_session_token),
        )

    return SessionStartResponse(session_id=session_id, status="created", session_index=session_index)
