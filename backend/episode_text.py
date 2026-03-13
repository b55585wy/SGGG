import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse


def _build_azure_compat_env() -> dict[str, str]:
    env = os.environ.copy()
    if not env.get("AZURE_OPENAI_API_KEY") and env.get("STORYTEXT_OPENAI_API_KEY"):
        env["AZURE_OPENAI_API_KEY"] = env["STORYTEXT_OPENAI_API_KEY"]

    storytext_uri = env.get("STORYTEXT_OPENAI_URI", "")
    if not env.get("AZURE_OPENAI_ENDPOINT") and storytext_uri:
        try:
            parsed = urlparse(storytext_uri)
            if parsed.scheme and parsed.netloc:
                env["AZURE_OPENAI_ENDPOINT"] = f"{parsed.scheme}://{parsed.netloc}"
            parts = [p for p in parsed.path.split("/") if p]
            if not env.get("AZURE_OPENAI_DEPLOYMENT") and "deployments" in parts:
                idx = parts.index("deployments")
                if idx + 1 < len(parts):
                    env["AZURE_OPENAI_DEPLOYMENT"] = parts[idx + 1]
            if not env.get("AZURE_OPENAI_API_VERSION"):
                q = parse_qs(parsed.query)
                api_ver = q.get("api-version", [None])[0]
                if api_ver:
                    env["AZURE_OPENAI_API_VERSION"] = api_ver
        except Exception:
            pass
    return env


def _parse_last_json_line(stdout: str) -> Any:
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    for line in reversed(lines):
        try:
            return json.loads(line)
        except Exception:
            continue
    raise ValueError("No valid JSON found in episode module stdout")


def _run_episode_module(cwd: str, code: str) -> Any:
    proc = subprocess.run(
        [os.getenv("PYTHON_EXECUTABLE") or sys.executable, "-c", code],
        cwd=cwd,
        capture_output=True,
        text=True,
        env=_build_azure_compat_env(),
        timeout=int(os.getenv("EPISODE_MODULE_TIMEOUT_SEC", "240")),
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "episode module execution failed")
    return _parse_last_json_line(proc.stdout)


def _safe_str(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _extract_theme_food(story_arc: Optional[dict], meal_context: Optional[dict], temporal_characteristics: Optional[dict]) -> str:
    candidates = [
        (temporal_characteristics or {}).get("selected_food_instance"),
        (temporal_characteristics or {}).get("food_override"),
        ((temporal_characteristics or {}).get("food") or {}).get("selected_food_instance") if isinstance((temporal_characteristics or {}).get("food"), dict) else None,
        (meal_context or {}).get("target_food"),
        (story_arc or {}).get("target_food_category"),
    ]
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return "食物朋友"


def _extract_title(recap_and_goal: Optional[dict], story_arc: Optional[dict], theme_food: str) -> str:
    mg = (recap_and_goal or {}).get("micro_goal")
    if isinstance(mg, dict):
        title = _safe_str(mg.get("title"))
        if title:
            return title
    title = _safe_str((story_arc or {}).get("title"))
    if title:
        return title
    return f"{theme_food}的新发现"


def _extract_summary(recap_and_goal: Optional[dict], pages: list[dict[str, Any]]) -> str:
    recap = (recap_and_goal or {}).get("recap")
    if isinstance(recap, dict):
        text = _safe_str(recap.get("text_cn"))
        if text:
            return text
    page_texts = [_safe_str(page.get("page_text_cn")) for page in pages[:2]]
    page_texts = [text for text in page_texts if text]
    return " ".join(page_texts)[:120]


def _behavior_anchor_for_page(index: int, total: int) -> str:
    if total <= 0:
        return "Lv1"
    first_cut = max(1, total // 3)
    second_cut = max(first_cut + 1, (total * 2) // 3)
    if index <= first_cut:
        return "Lv1"
    if index <= second_cut:
        return "Lv2"
    return "Lv3"


def _assemble_image_prompt(visual_canon: dict[str, Any], suffix: str) -> str:
    parts = [
        _safe_str(visual_canon.get("global_visual_prompt_prefix_en")),
        _safe_str(visual_canon.get("character_lock_prompt_en")),
        _safe_str(visual_canon.get("world_lock_prompt_en")),
        _safe_str(suffix),
    ]
    negative = _safe_str(visual_canon.get("negative_prompt_en"))
    if negative:
        parts.append(f"Negative prompt: {negative}")
    return " ".join(part for part in parts if part)


def _normalize_interaction(interaction: Any) -> dict[str, Any]:
    interaction = interaction if isinstance(interaction, dict) else {}
    ext = interaction.get("ext") if isinstance(interaction.get("ext"), dict) else {}
    return {
        "type": interaction.get("type") or "none",
        "instruction": _safe_str(interaction.get("instruction")),
        "event_key": _safe_str(interaction.get("event_key")),
        "ext": {
            "encouragement": _safe_str(ext.get("encouragement")),
        },
    }


def _build_avatar_feedback(meal_context: Optional[dict], theme_food: str) -> dict[str, str]:
    meal_score = meal_context.get("meal_score") if isinstance(meal_context, dict) else None
    score = meal_score if isinstance(meal_score, int) else 3
    if score >= 4:
        expression = "happy"
    elif score == 3:
        expression = "encouraging"
    elif score == 2:
        expression = "gentle"
    else:
        expression = "neutral"
    return {
        "feedbackText": f"今天和{theme_food}继续认识啦",
        "expression": expression,
    }


def generate_story_from_episode(
    *,
    child_profile: dict[str, Any],
    meal_context: dict[str, Any],
    story_config: dict[str, Any],
    story_arc: dict[str, Any],
    recap_and_goal: dict[str, Any],
    temporal_characteristics: Optional[dict[str, Any]] = None,
    recent_story: Any = None,
) -> dict[str, Any]:
    module_dir = Path(__file__).resolve().parent
    required_files = [
        "episode_module.py",
        "basic_constraints.json",
    ]
    print("INFO: episode_text:start")
    with tempfile.TemporaryDirectory(prefix="sggg_episode_") as tmpdir:
        for name in required_files:
            src = module_dir / name
            if not src.exists():
                raise RuntimeError(f"missing required file: {name}")
            shutil.copy(src, Path(tmpdir) / name)

        payload = {
            "story_arc": story_arc,
            "recap_and_goal": recap_and_goal,
            "basic_constraints": None,
            "temporal_characteristics": temporal_characteristics or {},
            "recent_story": recent_story,
        }
        with open(Path(tmpdir) / "input.json", "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

        code = (
            "import json,runpy; "
            "ns=runpy.run_path('episode_module.py'); "
            "payload=json.load(open('input.json','r',encoding='utf-8')); "
            "out=ns['generate_episode']("
            "story_arc=payload.get('story_arc'), "
            "recap_and_goal=payload.get('recap_and_goal'), "
            "basic_constraints=payload.get('basic_constraints'), "
            "temporal_characteristics=payload.get('temporal_characteristics'), "
            "recent_story=payload.get('recent_story')); "
            "print(json.dumps(out, ensure_ascii=False))"
        )
        episode = _run_episode_module(tmpdir, code)

    if not isinstance(episode, dict):
        raise ValueError("episode output is not a JSON object")

    pages_raw = episode.get("pages")
    visual_canon = episode.get("visual_canon") if isinstance(episode.get("visual_canon"), dict) else {}
    prompt_packages = episode.get("page_image_prompt_packages") if isinstance(episode.get("page_image_prompt_packages"), list) else []
    prompt_map = {
        pkg.get("page_id"): pkg
        for pkg in prompt_packages
        if isinstance(pkg, dict) and isinstance(pkg.get("page_id"), str)
    }

    if not isinstance(pages_raw, list) or not pages_raw:
        raise ValueError("episode output pages missing or empty")

    theme_food = _extract_theme_food(story_arc, meal_context, temporal_characteristics)
    total_pages = len(pages_raw)
    pages: list[dict[str, Any]] = []
    for idx, page in enumerate(pages_raw, start=1):
        if not isinstance(page, dict):
            continue
        page_id = _safe_str(page.get("page_id")) or f"p{idx:02d}"
        prompt_pkg = prompt_map.get(page_id) if isinstance(prompt_map.get(page_id), dict) else {}
        image_prompt = _assemble_image_prompt(visual_canon, _safe_str(prompt_pkg.get("image_prompt_suffix_en")))
        pages.append({
            "page_no": page.get("page_no") if isinstance(page.get("page_no"), int) else idx,
            "page_id": page_id,
            "behavior_anchor": _behavior_anchor_for_page(idx, total_pages),
            "text": _safe_str(page.get("page_text_cn")),
            "image_prompt": image_prompt,
            "interaction": _normalize_interaction(page.get("interaction")),
            "branch_choices": page.get("branch_choices") if isinstance(page.get("branch_choices"), list) else [],
            "next_page_id": page.get("next_page_id"),
        })

    story_content = {
        "book_meta": {
            "title": _extract_title(recap_and_goal, story_arc, theme_food),
            "subtitle": _safe_str((((story_arc or {}).get("series_premise") or {}).get("one_sentence_logline"))),
            "theme_food": theme_food,
            "story_type": story_config.get("story_type", "interactive"),
            "target_behavior_level": "Lv3",
            "summary": _extract_summary(recap_and_goal, pages_raw),
            "design_logic": "延续既有故事世界与 recap/micro goal，以低压力方式围绕目标食物展开新的探索情节。",
            "global_visual_style": _safe_str(visual_canon.get("global_visual_prompt_prefix_en")),
        },
        "pages": pages,
        "ending": {
            "positive_feedback": "你又陪着故事里的食物朋友往前走了一小步。",
            "next_micro_goal": _safe_str((((recap_and_goal or {}).get("micro_goal") or {}).get("text_cn"))),
        },
        "avatar_feedback": _build_avatar_feedback(meal_context, theme_food),
        "visual_canon": visual_canon,
        "page_image_prompt_packages": prompt_packages,
    }
    print("INFO: episode_text:done")
    return story_content
