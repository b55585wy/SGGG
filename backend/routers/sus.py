import json
from fastapi import APIRouter, HTTPException
from models import SUSSubmitRequest, SUSSubmitResponse
from database import get_db

router = APIRouter(prefix="/api/v1/sus", tags=["sus"])


def _calc_sus_score(answers: list[int]) -> float:
    """标准 SUS 评分（0-100）：奇数题 score-1，偶数题 5-score，总和 × 2.5。"""
    total = 0
    for i, a in enumerate(answers):
        total += (a - 1) if (i + 1) % 2 == 1 else (5 - a)
    return round(total * 2.5, 1)


@router.post("/submit", response_model=SUSSubmitResponse)
def sus_submit(req: SUSSubmitRequest):
    if len(req.answers) != 10 or any(a < 1 or a > 5 for a in req.answers):
        raise HTTPException(400, detail={"error": {"code": "INVALID_ANSWERS", "message": "需要 10 个 1-5 的评分"}})

    score = _calc_sus_score(req.answers)

    with get_db() as db:
        try:
            db.execute(
                "INSERT INTO sus_responses (session_id, answers, sus_score) VALUES (?, ?, ?)",
                (req.session_id, json.dumps(req.answers), score),
            )
        except Exception:
            pass  # 重复提交忽略

    return SUSSubmitResponse(ok=True, sus_score=score)
