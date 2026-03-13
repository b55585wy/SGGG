import json
import uuid
import copy
import threading
import traceback
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from openai import RateLimitError
from models import GenerateRequest, RegenerateRequest
from database import get_db
from episode_text import generate_story_from_episode
from image_gen import generate_images_for_pages

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


def _generate_images_bg(story_id: str, draft_copy: dict):
    """后台线程：并行生成图片后更新数据库。"""
    global_style = ""
    visual_canon = draft_copy.get("visual_canon") if isinstance(draft_copy.get("visual_canon"), dict) else None
    page_image_prompt_packages = (
        draft_copy.get("page_image_prompt_packages")
        if isinstance(draft_copy.get("page_image_prompt_packages"), list)
        else None
    )
    temporal_characteristics = (
        draft_copy.get("temporal_characteristics")
        if isinstance(draft_copy.get("temporal_characteristics"), dict)
        else {}
    )
    child_avatar = (
        temporal_characteristics.get("child_avatar")
        if isinstance(temporal_characteristics.get("child_avatar"), dict)
        else None
    )
    if not visual_canon:
        global_style = draft_copy.get("book_meta", {}).get("global_visual_style", "")
    print(f"[INFO] IMG generation start story_id={story_id}")
    generate_images_for_pages(
        draft_copy["pages"],
        global_style,
        visual_canon=visual_canon,
        page_image_prompt_packages=page_image_prompt_packages,
        child_avatar=child_avatar,
    )
    with get_db() as db:
        db.execute(
            "UPDATE stories SET story_json = ? WHERE story_id = ?",
            (json.dumps(draft_copy), story_id),
        )
    print(f"[INFO] IMG generation done story_id={story_id}")


@router.get("/{story_id}")
def story_get(story_id: str):
    with get_db() as db:
        row = db.execute(
            "SELECT story_json FROM stories WHERE story_id = ?",
            (story_id,),
        ).fetchone()
    if not row:
        raise HTTPException(404, detail={"error": {"code": "NOT_FOUND", "message": "story not found"}})
    return {"draft": json.loads(row["story_json"])}


@router.post("/generate")
def story_generate(req: GenerateRequest):
    child_profile = req.child_profile.model_dump()
    meal_context = req.meal_context.model_dump()
    story_config = req.story_config.model_dump()
    story_arc = req.story_arc or {}
    recap_and_goal = req.recap_and_goal or {}
    temporal_characteristics = req.temporal_characteristics or {}
    recent_story = req.recent_story
    try:
        print("[INFO] story_generate episode_module start")
        content = generate_story_from_episode(
            child_profile=child_profile,
            meal_context=meal_context,
            story_config=story_config,
            story_arc=story_arc,
            recap_and_goal=recap_and_goal,
            temporal_characteristics=temporal_characteristics,
            recent_story=recent_story,
        )
        print("[INFO] story_generate episode_module done")
    except RateLimitError:
        raise HTTPException(429, detail={"error": {"code": "RATE_LIMIT", "message": "AI 生成频率超限，请等待 1 分钟后重试。"}})
    except json.JSONDecodeError as e:
        traceback.print_exc()
        raise HTTPException(500, detail={"error": {"code": "LLM_PARSE_ERROR", "message": str(e)}})
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, detail={"error": {"code": "INTERNAL_ERROR", "message": str(e)}})

    story_id = "st_" + uuid.uuid4().hex[:16]
    draft = _build_draft(content, story_id)
    # 保存原始请求参数，供 regenerate 时复用
    draft["child_profile"] = child_profile
    draft["meal_context"] = meal_context
    draft["story_config"] = story_config
    if story_arc:
        draft["story_arc"] = story_arc
    if recap_and_goal:
        draft["recap_and_goal"] = recap_and_goal
    if temporal_characteristics:
        draft["temporal_characteristics"] = temporal_characteristics
    if recent_story is not None:
        draft["recent_story"] = recent_story

    with get_db() as db:
        db.execute(
            "INSERT INTO stories (story_id, regen_count, story_json) VALUES (?, 0, ?)",
            (story_id, json.dumps(draft)),
        )

    # 后台异步生成图片，不阻塞接口返回
    threading.Thread(
        target=_generate_images_bg,
        args=(story_id, copy.deepcopy(draft)),
        daemon=True,
    ).start()

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
    # 用户重新生成时选择的新参数覆盖旧配置
    story_config["story_type"] = req.story_type
    if req.pages is not None:
        story_config["pages"] = req.pages
    if req.difficulty is not None:
        story_config["difficulty"] = req.difficulty
    if req.interaction_density is not None:
        story_config["interactive_density"] = req.interaction_density

    meal_context = prev_draft.get("meal_context") or {"target_food": req.target_food, "meal_score": 3, "meal_text": ""}
    meal_context["target_food"] = req.target_food
    story_arc = prev_draft.get("story_arc") or {}
    recap_and_goal = prev_draft.get("recap_and_goal") or {}
    temporal_characteristics = prev_draft.get("temporal_characteristics") or {}
    temporal_characteristics = {
        **temporal_characteristics,
        **(req.temporal_characteristics or {}),
        "selected_food_instance": req.target_food,
    }

    try:
        print("[INFO] story_regenerate episode_module start")
        content = generate_story_from_episode(
            child_profile=prev_draft.get("child_profile") or {},
            meal_context=meal_context,
            story_config=story_config,
            story_arc=story_arc,
            recap_and_goal=recap_and_goal,
            temporal_characteristics=temporal_characteristics,
            recent_story=prev_draft.get("recent_story"),
        )
        print("[INFO] story_regenerate episode_module done")
    except RateLimitError:
        raise HTTPException(429, detail={"error": {"code": "RATE_LIMIT", "message": "AI 生成频率超限，请等待 1 分钟后重试。"}})
    except json.JSONDecodeError as e:
        traceback.print_exc()
        raise HTTPException(500, detail={"error": {"code": "LLM_PARSE_ERROR", "message": str(e)}})
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, detail={"error": {"code": "INTERNAL_ERROR", "message": str(e)}})

    story_id = "st_" + uuid.uuid4().hex[:16]
    draft = _build_draft(content, story_id)
    # 保存请求参数，供下一次 regenerate 复用
    draft["child_profile"] = prev_draft.get("child_profile") or {}
    draft["meal_context"] = meal_context
    draft["story_config"] = story_config
    if story_arc:
        draft["story_arc"] = story_arc
    if recap_and_goal:
        draft["recap_and_goal"] = recap_and_goal
    if temporal_characteristics:
        draft["temporal_characteristics"] = temporal_characteristics

    with get_db() as db:
        db.execute(
            "INSERT INTO stories (story_id, parent_story_id, regen_count, story_json) VALUES (?, ?, ?, ?)",
            (story_id, req.previous_story_id, 0, json.dumps(draft)),
        )
        db.execute(
            "UPDATE stories SET regen_count = regen_count + 1 WHERE story_id = ?",
            (req.previous_story_id,),
        )

    # 后台异步生成图片，不阻塞接口返回
    threading.Thread(
        target=_generate_images_bg,
        args=(story_id, copy.deepcopy(draft)),
        daemon=True,
    ).start()

    return {"draft": draft}
