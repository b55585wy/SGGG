from fastapi import APIRouter, HTTPException
from models import FeedbackSubmitRequest, FeedbackSubmitResponse
from database import get_db

router = APIRouter(prefix="/api/v1/feedback", tags=["feedback"])


@router.post("/submit", response_model=FeedbackSubmitResponse)
def feedback_submit(req: FeedbackSubmitRequest):
    # Validate conditional required fields
    if req.status == "COMPLETED" and not req.try_level:
        raise HTTPException(422, detail={"error": {"code": "VALIDATION_ERROR", "message": "try_level required for COMPLETED"}})
    if req.status == "ABORTED" and not req.abort_reason:
        raise HTTPException(422, detail={"error": {"code": "VALIDATION_ERROR", "message": "abort_reason required for ABORTED"}})

    with get_db() as db:
        session = db.execute("SELECT session_id FROM sessions WHERE session_id = ?", (req.session_id,)).fetchone()
        if not session:
            raise HTTPException(404, detail={"error": {"code": "NOT_FOUND", "message": "session not found"}})

        try:
            db.execute(
                """INSERT INTO feedback (session_id, status, try_level, abort_reason, notes)
                   VALUES (?, ?, ?, ?, ?)""",
                (req.session_id, req.status, req.try_level, req.abort_reason, req.notes),
            )
            db.execute("UPDATE sessions SET status = ? WHERE session_id = ?", (req.status, req.session_id))
        except Exception:
            # feedback already submitted
            raise HTTPException(409, detail={"error": {"code": "CONFLICT", "message": "feedback already submitted"}})

    return FeedbackSubmitResponse(ok=True)
