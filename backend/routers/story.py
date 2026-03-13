import json
import uuid
import copy
import threading
import traceback
import os
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from openai import RateLimitError
from models import GenerateRequest, RegenerateRequest
from database import get_db
from llm import generate_story_content
from image_gen import generate_images_for_pages, generate_cover_image
from audio_gen import generate_audio_for_pages

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


def _generate_assets_bg(story_id: str, draft_copy: dict, child_id: str | None = None):
    """后台线程：预生成整本语音 + 页面插图 + 封面图后更新数据库。"""
    if os.getenv("TTS_PREGENERATE_ON_STORY", "true").lower() not in ("0", "false", "no", "off"):
        try:
            voice = os.getenv("TTS_PREGENERATE_VOICE", "zhimiao")
            generate_audio_for_pages(
                draft_copy.get("pages", []),
                voice_key=voice,
                include_interaction=True,
            )
        except Exception as e:
            print(f"[TTS-PREGEN] 预生成失败 story_id={story_id}: {e}")

    book_meta = draft_copy.get("book_meta", {})
    global_style = book_meta.get("global_visual_style", "")
    print(f"[INFO] IMG generation start story_id={story_id}")
    generate_images_for_pages(draft_copy.get("pages", []), global_style, child_id)

    cover_url = generate_cover_image(
        title=book_meta.get("title", ""),
        theme_food=book_meta.get("theme_food", ""),
        global_style=global_style,
        child_id=child_id,
    )
    if cover_url:
        draft_copy.setdefault("book_meta", {})["cover_image_url"] = cover_url
        print(f"[COVER] 封面生成成功 story_id={story_id}")
    else:
        print(f"[COVER] 封面生成失败 story_id={story_id}")

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
    try:
        print("[INFO] story_generate LLM start")
        content = generate_story_content(child_profile, meal_context, story_config, custom_prompt=req.custom_prompt)
        print("[INFO] story_generate LLM done")
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
    if req.child_id:
        draft["child_id"] = req.child_id

    with get_db() as db:
        db.execute(
            "INSERT INTO stories (story_id, child_id, regen_count, story_json) VALUES (?, ?, 0, ?)",
            (story_id, req.child_id, json.dumps(draft)),
        )

    # 后台异步生成图片，不阻塞接口返回
    threading.Thread(
        target=_generate_assets_bg,
        args=(story_id, copy.deepcopy(draft), req.child_id),
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

    try:
        print("[INFO] story_regenerate LLM start")
        content = generate_story_content(
            prev_draft.get("child_profile") or {},
            meal_context,
            story_config,
            dissatisfaction_reason=req.dissatisfaction_reason,
        )
        print("[INFO] story_regenerate LLM done")
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
    child_id = prev_draft.get("child_id")
    if child_id:
        draft["child_id"] = child_id

    with get_db() as db:
        db.execute(
            "INSERT INTO stories (story_id, parent_story_id, child_id, regen_count, story_json) VALUES (?, ?, ?, ?, ?)",
            (story_id, req.previous_story_id, child_id, 0, json.dumps(draft)),
        )
        db.execute(
            "UPDATE stories SET regen_count = regen_count + 1 WHERE story_id = ?",
            (req.previous_story_id,),
        )

    # 后台异步生成图片，不阻塞接口返回
    threading.Thread(
        target=_generate_assets_bg,
        args=(story_id, copy.deepcopy(draft), child_id),
        daemon=True,
    ).start()

    return {"draft": draft}
