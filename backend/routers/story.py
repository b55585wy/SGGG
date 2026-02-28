import json
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from models import GenerateRequest, RegenerateRequest
from database import get_db
from llm import generate_story_content

router = APIRouter(prefix="/api/v1/story", tags=["story"])


def _build_draft(story_content: dict, story_id: str) -> dict:
    return {
        "schema_version": "story-1.0.0",
        "story_id": story_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        **story_content,
        "telemetry_suggestions": {
            "recommended_events": ["page_view", "page_dwell", "interaction", "branch_select", "story_complete"]
        },
    }


@router.post("/generate")
def story_generate(req: GenerateRequest):
    try:
        content = generate_story_content(
            req.child_profile.model_dump(),
            req.meal_context.model_dump(),
            req.story_config.model_dump(),
        )
    except json.JSONDecodeError as e:
        raise HTTPException(500, detail={"error": {"code": "LLM_PARSE_ERROR", "message": str(e)}})
    except Exception as e:
        raise HTTPException(500, detail={"error": {"code": "INTERNAL_ERROR", "message": str(e)}})

    story_id = "st_" + uuid.uuid4().hex[:16]
    draft = _build_draft(content, story_id)

    with get_db() as db:
        db.execute(
            "INSERT INTO stories (story_id, regen_count, story_json) VALUES (?, 0, ?)",
            (story_id, json.dumps(draft)),
        )

    return {"draft": draft}


@router.post("/regenerate")
def story_regenerate(req: RegenerateRequest):
    with get_db() as db:
        row = db.execute(
            "SELECT regen_count, story_json FROM stories WHERE story_id = ?",
            (req.previous_story_id,),
        ).fetchone()

    if not row:
        raise HTTPException(404, detail={"error": {"code": "NOT_FOUND", "message": "story not found"}})
    if row["regen_count"] >= 2:
        raise HTTPException(429, detail={"error": {"code": "REGEN_LIMIT_REACHED", "message": "max 2 regenerations"}})

    prev_draft = json.loads(row["story_json"])
    story_config = prev_draft.get("story_config") or {"story_type": req.story_type, "pages": 8, "interactive_density": "medium", "language": "zh-CN"}
    meal_context = prev_draft.get("meal_context") or {"target_food": req.target_food, "meal_score": 3, "meal_text": ""}

    try:
        content = generate_story_content(
            prev_draft.get("child_profile") or {},
            meal_context,
            story_config,
            dissatisfaction_reason=req.dissatisfaction_reason,
        )
    except json.JSONDecodeError as e:
        raise HTTPException(500, detail={"error": {"code": "LLM_PARSE_ERROR", "message": str(e)}})
    except Exception as e:
        raise HTTPException(500, detail={"error": {"code": "INTERNAL_ERROR", "message": str(e)}})

    story_id = "st_" + uuid.uuid4().hex[:16]
    draft = _build_draft(content, story_id)

    with get_db() as db:
        db.execute(
            "INSERT INTO stories (story_id, parent_story_id, regen_count, story_json) VALUES (?, ?, ?, ?)",
            (story_id, req.previous_story_id, 0, json.dumps(draft)),
        )
        db.execute(
            "UPDATE stories SET regen_count = regen_count + 1 WHERE story_id = ?",
            (req.previous_story_id,),
        )

    return {"draft": draft}
