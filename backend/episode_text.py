import json
import os
import re
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
        timeout=int(os.getenv("EPISODE_MODULE_TIMEOUT_SEC", "300")),
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "episode module execution failed")
    return _parse_last_json_line(proc.stdout)


def _safe_str(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _humanize_spoken_cn(text: str, *, for_title: bool = False) -> str:
    normalized = _safe_str(text)
    if not normalized:
        return ""

    replacements = [
        ("本次", "这次"),
        ("此次", "这次"),
        ("进行", "做"),
        ("通过", "用"),
        ("并且", "还"),
        ("以及", "和"),
        ("从而", "这样就"),
        ("儿童", "小朋友"),
        ("小朋友们", "小朋友"),
    ]
    for src, dst in replacements:
        normalized = normalized.replace(src, dst)

    normalized = re.sub(r"\s+", "", normalized)
    normalized = re.sub(r"[。]{2,}", "。", normalized)

    if for_title:
        normalized = normalized.strip("。！？!?；;，,:：")
        if normalized.startswith("关于"):
            normalized = normalized[2:].strip()

    return normalized


def _contains_ascii(text: str) -> bool:
    return any(("a" <= ch.lower() <= "z") or ("0" <= ch <= "9") for ch in text)


def _count_cjk(text: str) -> int:
    return sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")


def _sanitize_title_candidate(title: str) -> str:
    cleaned = _humanize_spoken_cn(title, for_title=True)
    if not cleaned:
        return ""

    # Remove common numbering prefixes like "第1集：".
    cleaned = re.sub(r"^第?[0-9一二三四五六七八九十]+[集篇章]?[：:、\\-]?", "", cleaned)
    # Remove obvious id-like fragments that leak from user ids.
    cleaned = re.sub(r"[A-Za-z0-9_]{2,}", "", cleaned)
    cleaned = cleaned.strip("，,。！？!?；;：:- ")

    if "：" in cleaned:
        left, right = cleaned.split("：", 1)
        if right and (len(left) >= 8 or _contains_ascii(left)):
            cleaned = right.strip("，,。！？!?；;：:- ")

    return cleaned


def _is_natural_title(title: str) -> bool:
    if not title:
        return False
    if _contains_ascii(title):
        return False
    cjk = _count_cjk(title)
    if cjk < 4:
        return False
    if len(title) > 16:
        return False
    return True


def _fallback_natural_title(theme_food: str, recap_and_goal: Optional[dict]) -> str:
    mg = recap_and_goal.get("micro_goal") if isinstance(recap_and_goal, dict) else {}
    text = _humanize_spoken_cn(mg.get("text_cn") if isinstance(mg, dict) else "")

    if any(k in text for k in ["声音", "沙沙", "咔", "脆"]):
        return f"{theme_food}会发出什么声音"
    if any(k in text for k in ["闻", "气味", "香"]):
        return f"{theme_food}闻起来像什么"
    if any(k in text for k in ["摸", "触", "手感", "软", "硬", "滑"]):
        return f"{theme_food}摸起来怎么样"
    if any(k in text for k in ["比较", "不一样", "区别"]):
        return f"{theme_food}有什么不一样"
    return f"今天认识{theme_food}"


def _extract_theme_food(
    explicit_theme_food: Optional[str],
    story_arc: Optional[dict],
    meal_context: Optional[dict],
    temporal_characteristics: Optional[dict],
) -> str:
    candidates = [
        explicit_theme_food,
        (temporal_characteristics or {}).get("selected_food_instance"),
        (temporal_characteristics or {}).get("food_override"),
        ((temporal_characteristics or {}).get("food") or {}).get("selected_food_instance") if isinstance((temporal_characteristics or {}).get("food"), dict) else None,
        (meal_context or {}).get("target_food"),
    ]
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return "食物朋友"


def _extract_title(recap_and_goal: Optional[dict], story_arc: Optional[dict], theme_food: str) -> str:
    mg = (recap_and_goal or {}).get("micro_goal")
    if isinstance(mg, dict):
        title = _sanitize_title_candidate(str(mg.get("title") or ""))
        if _is_natural_title(title):
            return title
    title = _sanitize_title_candidate(str((story_arc or {}).get("title") or ""))
    if _is_natural_title(title):
        return title
    return _fallback_natural_title(theme_food, recap_and_goal)


def _extract_summary(recap_and_goal: Optional[dict], pages: list[dict[str, Any]]) -> str:
    recap = (recap_and_goal or {}).get("recap")
    if isinstance(recap, dict):
        text = _humanize_spoken_cn(recap.get("text_cn"))
        if text:
            return text[:120]
    page_texts = [_safe_str(page.get("page_text_cn")) for page in pages[:2]]
    page_texts = [text for text in page_texts if text]
    return _humanize_spoken_cn(" ".join(page_texts))[:120]


def _extract_post_read_task(recap_and_goal: Optional[dict], pages: list[dict[str, Any]], theme_food: str) -> str:
    food = _safe_str(theme_food) or "今天故事里的食物"
    mg = (recap_and_goal or {}).get("micro_goal")
    goal_text = _humanize_spoken_cn(mg.get("text_cn") if isinstance(mg, dict) else "")

    interaction_texts: list[str] = []
    page_texts: list[str] = []
    for page in pages:
        if not isinstance(page, dict):
            continue
        text_cn = _safe_str(page.get("page_text_cn"))
        if text_cn:
            page_texts.append(text_cn)
        interaction = page.get("interaction")
        if not isinstance(interaction, dict):
            continue
        instruction = _safe_str(interaction.get("instruction"))
        if instruction:
            interaction_texts.append(instruction)
        if len(interaction_texts) >= 3:
            break

    signals = f"{goal_text} {' '.join(interaction_texts)} {' '.join(page_texts[:2])}"
    if any(k in signals for k in ["地图", "车站", "站点", "出发", "路线", "邻里", "市场"]):
        return f"本周找一天和家长一起去买菜，帮家长在摊位上找到一次{food}，并说出它和故事里最像的地方。"
    if any(k in signals for k in ["比较", "区别", "一样", "不一样", "像", "不同"]):
        return f"晚饭前和家长选两样食材（其中一个是{food}），做一个“哪里一样/哪里不一样”小对比并各说一句发现。"
    if any(k in signals for k in ["记录", "笔记", "画", "小册", "卡片", "标记"]):
        return f"和家长做一张“{food}观察卡”：画一画它、写一个你起的新名字，下次继续补充一条新发现。"
    if any(k in signals for k in ["帮忙", "一起", "准备", "厨房", "摆", "洗"]):
        return f"下次做饭时，请孩子和家长一起完成一个准备小步骤（如挑选、清洗或摆盘{food}），结束后说一句“我今天帮到的地方”。"
    if any(k in signals for k in ["分享", "讲", "朋友", "家人", "角色", "列车长"]):
        return f"饭后请孩子当“小小讲解员”，用一句话给家人介绍今天的{food}，家长再补一句鼓励反馈。"
    return f"这周选一个日常时刻，和家长围绕{food}做一次“发现任务”：找到它、说一个特点、记录一句感受。"


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


def _safe_int(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_lower_str(value: Any) -> str:
    return value.strip().lower() if isinstance(value, str) else ""


def _load_base_basic_constraints(module_dir: Path) -> dict[str, Any]:
    path = module_dir / "basic_constraints.json"
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _build_basic_constraints_override(
    *,
    module_dir: Path,
    regenerate_overrides: Optional[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    if not isinstance(regenerate_overrides, dict):
        return None

    has_override = any(v is not None for v in regenerate_overrides.values())
    if not has_override:
        return None

    merged = _load_base_basic_constraints(module_dir)

    pages_raw = regenerate_overrides.get("pages")
    pages = _safe_int(pages_raw)
    if pages is not None:
        page_count = max(4, min(12, pages))
        merged["episode_page_count"] = page_count
        merged["image_count_target"] = [page_count, page_count]

    difficulty = _safe_lower_str(regenerate_overrides.get("difficulty"))
    difficulty_word_ranges = {
        "easy": [50, 70],
        "medium": [60, 80],
        "hard": [70, 90],
    }
    if difficulty in difficulty_word_ranges:
        merged["words_per_page_target_cn"] = difficulty_word_ranges[difficulty]

    interaction_density = _safe_lower_str(regenerate_overrides.get("interaction_density"))
    density_to_micro_limit = {
        "low": 2,
        "medium": 3,
        "high": 4,
    }
    if interaction_density in density_to_micro_limit:
        interaction_constraints = (
            merged.get("interaction_constraints")
            if isinstance(merged.get("interaction_constraints"), dict)
            else {}
        )
        interaction_constraints["micro_interactions_max_per_episode"] = density_to_micro_limit[interaction_density]
        merged["interaction_constraints"] = interaction_constraints

    page_count = _safe_int(merged.get("episode_page_count")) or 12
    words_range = merged.get("words_per_page_target_cn")
    if isinstance(words_range, list) and len(words_range) >= 2:
        low = _safe_int(words_range[0]) or 60
        high = _safe_int(words_range[1]) or 80
        if low > high:
            low, high = high, low
        merged["word_count_cn_profiles"] = {"standard": [page_count * low, page_count * high]}

    return merged


def generate_story_from_episode(
    *,
    theme_food: Optional[str] = None,
    child_profile: dict[str, Any],
    meal_context: dict[str, Any],
    story_config: dict[str, Any],
    story_arc: dict[str, Any],
    recap_and_goal: dict[str, Any],
    temporal_characteristics: Optional[dict[str, Any]] = None,
    recent_story: Any = None,
    regenerate_overrides: Optional[dict[str, Any]] = None,
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

        runtime_basic_constraints = _build_basic_constraints_override(
            module_dir=module_dir,
            regenerate_overrides=regenerate_overrides,
        )

        payload = {
            "story_arc": story_arc,
            "recap_and_goal": recap_and_goal,
            "basic_constraints": runtime_basic_constraints,
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

    theme_food = _extract_theme_food(theme_food, story_arc, meal_context, temporal_characteristics)
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
            "story_type": story_config.get("story_type", "light_fantasy"),
            "target_behavior_level": "Lv3",
            "summary": _extract_summary(recap_and_goal, pages_raw),
            "design_logic": "延续既有故事世界与 recap/micro goal，以低压力方式围绕目标食物展开新的探索情节。",
            "global_visual_style": _safe_str(visual_canon.get("global_visual_prompt_prefix_en")),
        },
        "pages": pages,
        "ending": {
            "positive_feedback": "你又陪着故事里的食物朋友往前走了一小步。",
            "next_micro_goal": _safe_str((((recap_and_goal or {}).get("micro_goal") or {}).get("text_cn"))),
            "post_read_task": _extract_post_read_task(recap_and_goal, pages_raw, theme_food),
        },
        "avatar_feedback": _build_avatar_feedback(meal_context, theme_food),
        "visual_canon": visual_canon,
        "page_image_prompt_packages": prompt_packages,
    }
    print("INFO: episode_text:done")
    return story_content
