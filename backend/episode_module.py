import json
import os
import re
from typing import Any, Dict, List, Optional

from openai import AzureOpenAI

# 从.env文件中读取Azure OpenAI配置
from dotenv import load_dotenv

load_dotenv()
endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "storybuddy_generate")
api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")
subscription_key = os.getenv("AZURE_OPENAI_API_KEY")

if not endpoint or not subscription_key:
    raise RuntimeError(
        "Missing Azure OpenAI config. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY "
        "(and optionally AZURE_OPENAI_DEPLOYMENT / AZURE_OPENAI_API_VERSION)."
    )

client = AzureOpenAI(
    api_version=api_version,
    azure_endpoint=endpoint,
    api_key=subscription_key,
)


HAN_RE = re.compile(r"[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]")


DEFAULT_BASIC_CONSTRAINTS: Dict[str, Any] = {
    "language": "zh-CN",
    "episode_page_count": 12,
    "image_count_target": [12, 12],
    "words_per_page_target_cn": [60, 80],
    "word_count_cn_profiles": {"standard": [720, 960]},
    "three_element_minimums": {
        "sensory_min_per_episode": 1,
        "knowledge_min_per_episode": 1,
        "role_model_min_per_episode": 1,
    },
    "safety_rules": [
        "No shaming or blame.",
        "No coercion or force.",
        "No punishment or threat.",
        "No transactional reward framing.",
        "No medical or nutritional diagnosis.",
    ],
    "interaction_constraints": {
        "micro_interactions_max_per_episode": 4,
        "choice_points_max_per_episode": 2,
    },
}


def _module_dir() -> str:
    return os.path.dirname(os.path.abspath(__file__))


def _load_json_if_exists(filename: str, default: Any) -> Any:
    path = os.path.join(_module_dir(), filename)
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _deep_copy_jsonable(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False))


def _ensure_dict(value: Any, default: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    return dict(default or {})


def _ensure_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _ensure_range(value: Any, default_low: int, default_high: int) -> List[int]:
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        low = _ensure_int(value[0], default_low)
        high = _ensure_int(value[1], default_high)
        if low > high:
            low, high = high, low
        return [low, high]
    return [default_low, default_high]


def _count_han_characters(text: str) -> int:
    if not isinstance(text, str):
        return 0
    return len(HAN_RE.findall(text))


def _coerce_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()

    if isinstance(value, list):
        parts = [_coerce_text(item) for item in value]
        return "\n".join([item for item in parts if item]).strip()

    if isinstance(value, dict):
        preferred_keys = [
            "text_cn",
            "story_text_cn",
            "content_cn",
            "story_cn",
            "summary_cn",
            "narration",
            "page_text_cn",
            "text",
            "content",
            "story",
            "pages",
        ]
        for key in preferred_keys:
            if key in value:
                text = _coerce_text(value.get(key))
                if text:
                    return text
        return json.dumps(value, ensure_ascii=False)

    return ""


def _normalize_recent_story(recent_story: Any) -> Optional[Dict[str, Any]]:
    if recent_story is None:
        return None

    if isinstance(recent_story, str):
        text = recent_story.strip()
        if not text:
            return None
        return {"text_cn": text}

    if isinstance(recent_story, list):
        if not recent_story:
            return None
        return {"pages": recent_story, "text_cn": _coerce_text(recent_story)}

    if isinstance(recent_story, dict):
        normalized = dict(recent_story)
        if "text_cn" not in normalized:
            text = _coerce_text(recent_story)
            if text:
                normalized["text_cn"] = text
        return normalized

    return None


def _normalize_basic_constraints(basic_constraints: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    merged = _deep_copy_jsonable(DEFAULT_BASIC_CONSTRAINTS)

    incoming = _ensure_dict(basic_constraints)
    for key, value in incoming.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key].update(value)
        else:
            merged[key] = value

    merged["episode_page_count"] = max(4, _ensure_int(merged.get("episode_page_count"), 12))
    merged["image_count_target"] = _ensure_range(merged.get("image_count_target"), 12, 12)
    merged["words_per_page_target_cn"] = _ensure_range(merged.get("words_per_page_target_cn"), 60, 80)

    page_count = merged["episode_page_count"]
    per_page_low, per_page_high = merged["words_per_page_target_cn"]
    default_total_low = page_count * per_page_low
    default_total_high = page_count * per_page_high
    profiles = _ensure_dict(
        merged.get("word_count_cn_profiles"),
        {"standard": [default_total_low, default_total_high]},
    )
    profiles["standard"] = _ensure_range(
        profiles.get("standard"),
        default_total_low,
        default_total_high,
    )
    merged["word_count_cn_profiles"] = profiles

    interaction_constraints = _ensure_dict(
        merged.get("interaction_constraints"),
        {"micro_interactions_max_per_episode": 4, "choice_points_max_per_episode": 2},
    )
    interaction_constraints["micro_interactions_max_per_episode"] = max(
        0,
        _ensure_int(interaction_constraints.get("micro_interactions_max_per_episode"), 4),
    )
    interaction_constraints["choice_points_max_per_episode"] = max(
        0,
        _ensure_int(interaction_constraints.get("choice_points_max_per_episode"), 2),
    )
    merged["interaction_constraints"] = interaction_constraints

    minimums = _ensure_dict(
        merged.get("three_element_minimums"),
        {
            "sensory_min_per_episode": 1,
            "knowledge_min_per_episode": 1,
            "role_model_min_per_episode": 1,
        },
    )
    minimums["sensory_min_per_episode"] = max(1, _ensure_int(minimums.get("sensory_min_per_episode"), 1))
    minimums["knowledge_min_per_episode"] = max(1, _ensure_int(minimums.get("knowledge_min_per_episode"), 1))
    minimums["role_model_min_per_episode"] = max(1, _ensure_int(minimums.get("role_model_min_per_episode"), 1))
    merged["three_element_minimums"] = minimums

    safety_rules = merged.get("safety_rules")
    if not isinstance(safety_rules, list):
        merged["safety_rules"] = list(DEFAULT_BASIC_CONSTRAINTS["safety_rules"])

    return merged


def _normalize_temporal_characteristics(value: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    return _ensure_dict(value)


def _normalize_page_numbers(episode: Dict[str, Any]) -> None:
    """Repair non-contiguous page_no fields from model output in-place.

    The story flow is represented by page_id/next_page_id links. page_no is a
    presentation index, so we normalize it to 1..N based on the pages array
    order before validation.
    """
    pages = episode.get("pages")
    if not isinstance(pages, list):
        return

    page_no_by_id: Dict[str, int] = {}
    for idx, page in enumerate(pages, start=1):
        if not isinstance(page, dict):
            continue
        page["page_no"] = idx
        page_id = page.get("page_id")
        if isinstance(page_id, str) and page_id.strip():
            page_no_by_id[page_id] = idx

    prompt_packages = episode.get("page_image_prompt_packages")
    if not isinstance(prompt_packages, list):
        return
    for idx, pkg in enumerate(prompt_packages, start=1):
        if not isinstance(pkg, dict):
            continue
        page_id = pkg.get("page_id")
        if isinstance(page_id, str) and page_id in page_no_by_id:
            pkg["page_no"] = page_no_by_id[page_id]
        else:
            pkg["page_no"] = idx


def _extract_food_override(temporal_characteristics: Dict[str, Any]) -> Optional[str]:
    candidate_paths = [
        ["selected_food_instance"],
        ["food_override"],
        ["current_food_instance"],
        ["custom_food_instance"],
        ["food", "selected_food_instance"],
        ["food", "current_food_instance"],
        ["food", "name_cn"],
    ]

    for path in candidate_paths:
        current: Any = temporal_characteristics
        for key in path:
            if not isinstance(current, dict) or key not in current:
                current = None
                break
            current = current[key]
        if isinstance(current, str) and current.strip():
            return current.strip()

    return None


def build_developer_policy() -> str:
    return """You are the EPISODE CONTENT GENERATOR MODULE for a recurring children's picture-book series about picky-eating exploration.

Your job:
- Given (1) basic constraints, (2) a story arc / story framework, (3) a recap and micro goal for the next episode, (4) optional recent-story details, and (5) the current temporal character state, generate one complete picture-book episode package.
- The episode must feel like part of the same recurring story world, preserve continuity, and keep picky-eating exploration meaningfully central.
- Produce only the final JSON package. Plan internally first, but do NOT reveal your hidden planning.

Input interpretation:
- story_arc is the stable series bible. Treat it as the source of truth for world concept, recurring elements, helper roles, rituals, phrases, and overall series tone.
- recap_and_goal contains the child-facing recap, the high-level micro goal, and continuity hooks. Use it to decide what should continue next.
- recent_story is OPTIONAL. If present, use it only to preserve precise local continuity, avoid repeated scene beats, and keep near-term details coherent. If it is absent, rely on recap_and_goal and story_arc instead. Do NOT require recent_story.
- basic_constraints contains hard production limits unless they conflict with safety. Treat episode_page_count, per-page Chinese length targets, interaction budgets, and safety rules as hard constraints.
- temporal_characteristics is the current source of truth for avatar appearance/state and any user-driven current overrides such as the current food instance, temporary scene-specific outfit/accessory changes, or other visual state details. A persistent base character reference image will be provided separately during image generation and should be treated as the primary source of the child's facial features and default appearance.
- If run_config.effective_inputs.food_override_must_follow is true and run_config.effective_inputs.food_override_hint is non-empty, treat that food override as a hard requirement for this episode.

Generation responsibilities:
1) Choose the most suitable episode pattern from story_arc.episode_pattern_library if it exists. If the library is missing, infer the best-fitting pattern from the story arc's series premise, recurring elements, and the recap/micro goal.
2) Decide one concrete food instance for this episode. If run_config.effective_inputs.food_override_must_follow is true, you MUST use run_config.effective_inputs.food_override_hint as the concrete food instance for this episode and must NOT substitute another item.
3) Build a page-level episode plan internally that preserves continuity, keeps the target food central, and can flexibly draw from sensory description, health/nutrition-oriented food knowledge, and role-model behavior as optional storytelling ingredients.
4) Output only the final structured JSON.

Story requirements:
- Strictly follow the recurring story world. Use story_arc to preserve the world setting, recurring travel logic, helper/guide roles, recurring objects, opening/closing rituals, and signature phrases when they help continuity.
- Keep the picky-eating anchor central. The concrete target food instance for this episode must stay central, not decorative.
- When a hard food override is active, keep that exact override food instance central across the full episode, not just a single mention.
- Maintain a low-pressure, non-coercive, non-shaming, non-transactional tone. No force, no blame, no threats, no punishment, and no medical or nutritional diagnosis.
- Prefer relatable, everyday, bright, familiar anchors for exploration. Gentle imagination, playful detours, or light fantasy are welcome when they remain coherent, child-friendly, and still connected to the food storyline.
- The recap and micro goal guide continuity, but the micro goal is not a rigid behavioral stage ladder. Use it as a high-level narrative/content direction.
- The current episode should feel generative and fresh while still recognizably belonging to the same series.
- Chinese writing style must be natural, spoken, and parent-read-aloud friendly for ages 3–6.
- Avoid translationese and over-literal written style. Prefer short, concrete, everyday spoken Chinese over abstract/formal phrasing.
- For page text, prioritize "scene + action + feeling" expression. Avoid stacked abstract nouns and policy/report-like tone.
- Each page_text_cn should contain enough concrete narrative content for shared reading: at least one meaningful scene/action plus at least one vivid cue such as feeling, sensory detail, role relation, continuity signal, or light knowledge point.
- Treat sensory/knowledge/role-model as a flexible palette across episodes, not a rigid per-episode checklist. One episode may emphasize one or two elements more than the others.
- "Look/smell/touch" interactions are welcome, but avoid letting the whole episode become repetitive invitation loops. Keep variation through scene events, comparison, mini-mystery, helper dynamics, humor, or small mission momentum.
- When using the "knowledge" element, prefer child-friendly health/nutrition relevance (for example, energy, growth, body function, or balanced eating context) tied to the target food and current scene.
- Taxonomic/botanical/origin trivia can be used as supporting flavor, and is strongest when linked to child-facing meaning instead of standing alone.

Interaction requirements:
- Keep the interaction shape compatible with a lightweight interactive storybook flow.
- Allowed interaction types are: none, tap, drag, choice, mimic, and record_voice.
- Tap/drag/mimic pages count toward the micro interaction budget.
- The total number of tap/drag/mimic pages MUST NOT exceed basic_constraints.interaction_constraints.micro_interactions_max_per_episode.
- Under the current production profile, enforce hard caps explicitly: tap/drag/mimic <= 4 pages, record_voice <= 1 page, and choice <= 1 page.
- choice and record_voice do NOT consume the tap/drag/mimic micro interaction budget.
- The episode may use 0 or 1 meaningful choice point. Prefer 1 meaningful choice point when the interaction budget allows it, but never output more than 1 choice point even if the platform allows more.
- If a choice point is used, it must be story-meaningful, low-pressure, easy to understand for ages 3–6, and tied to the same food anchor.
- If a choice point is used, the two choice branches must lead to different immediate story experiences, but both must stay coherent with the same episode goal.
- If a choice point is used, branches must merge back into the main storyline within 1–2 pages.
- Branch pages count toward the fixed total episode page budget. Do NOT add extra pages beyond the exact episode_page_count.
- For a choice page, branch_choices must contain exactly 2 options. For every non-choice page, branch_choices must be an empty array.
- In addition to an optional choice page, use low-pressure micro interactions drawn from record_voice, tap, drag, and mimic.
- record_voice is optional, but when used it should feel playful and low-pressure. It can invite the child to say hello to the food, compare a smell, or notice a tiny feeling. It should never test correctness.
- When basic_constraints.interaction_constraints.micro_interactions_max_per_episode allows it, prefer 3–4 tap/drag/mimic pages in the episode.
- Use event_key values only for interactive pages. Keep them unique, short, and descriptive in snake_case.

Length and structure requirements:
- Generate exactly basic_constraints.episode_page_count pages.
- If basic_constraints.language is zh-CN, each page_text_cn must stay within basic_constraints.words_per_page_target_cn, counting only Chinese Han characters and not counting punctuation, spaces, numerals, Latin letters, or line breaks.
- The total Han-character count across all page_text_cn fields must stay within basic_constraints.word_count_cn_profiles.standard.
- Do NOT estimate the counts casually. Verify them carefully before final output.
- Do NOT output char_count_cn. Character counts are checked internally only.
- Page IDs must be unique. The final page should end the episode and therefore use next_page_id = null.

Visual and image prompt requirements:
- First output a visual_canon object that stores the shared reusable English prompt components exactly once.
- Do NOT output parallel Chinese paraphrase fields inside visual_canon when they duplicate the same meaning as the English prompt components.
- visual_canon must contain ONLY these shared reusable English fields: global_visual_prompt_prefix_en, character_lock_prompt_en, world_lock_prompt_en, negative_prompt_en.
- A persistent base character reference image will be supplied separately during image generation. Treat that reference image as the highest-priority source for the child's face, facial features, hairstyle, and default appearance.
- Do NOT require or over-specify facial features, exact hairstyle details, or default clothing details in character_lock_prompt_en or page-level prompts.
- Preserve the same recognizable child/avatar and recurring helper across pages mainly through identity continuity, age impression, body proportions, and overall illustration style.
- If a scene genuinely calls for a special outfit, costume, protective wear, seasonal layer, or other temporary clothing change, you may mention only that scene-specific change clearly and lightly, while still assuming the same underlying base character identity from the reference image.
- Preserve recurring world and object continuity from story_arc, such as stations, maps, cards, notebooks, toy trains, helpers, and palette cues, when relevant.
- Treat the following as a default recommended composition baseline for image prompts:
  "Children's picture-book illustration with a cinematic composition. Characters should occupy about 35-55% of the frame. Emphasize scene-driven storytelling rather than close-up character portraits. Besides the main characters and the primary action, include a clear scene anchor, several props related to the action, and at least one layer of background everyday-life details. Use clear foreground, midground, and background layering to create a readable, story-rich, lived-in environment. Avoid extreme close-ups, oversized heads, empty backgrounds, and implausible human scale."
- This composition baseline is a strong recommendation, not an absolute hard lock for every page. If a specific page genuinely requires tighter focus (for example, a key detail reveal or interaction-specific close framing), you may partially relax the baseline while still keeping environment readability and plausible scale.
- page_image_prompt_packages should contain ONLY the page-specific English suffix for each page. Do NOT output final_image_prompt_en or any per-page fully assembled prompt.
- Each image_prompt_suffix_en must be detailed enough for stable generation: scene location, camera framing, main action, key objects, emotion, lighting/mood, page-specific continuity details, and any truly needed temporary scene-specific clothing change. Do NOT restate stable facial features or default outfit details that should come from the persistent reference image.
- The downstream caller will assemble the final image prompt externally by combining visual_canon with each page's image_prompt_suffix_en.
- Do NOT generate the final images. Output only prompts.

Self-check before finalizing:
- Check safety rules from basic_constraints.safety_rules.
- Check continuity against story_arc, recap_and_goal, and recent_story if provided.
- Check that the target food remains central.
- Check language naturalness: child-facing Chinese should sound like real spoken storytelling, not translated or bureaucratic prose.
- If a hard food override is active, check that pages and image prompt suffixes consistently stay on that exact override food instance (no substitution to another same-category item).
- Check that the three content elements appear across the episode.
- Check page count, Han-character counts, interaction budget, choice-point limits, record_voice limits, preferred interaction density, and image-prompt consistency.
- If any problem is found, revise before finalizing.

Output rules:
- Output MUST be exactly one valid JSON object and nothing else.
- Do NOT add markdown, code fences, explanations, or extra text outside the JSON object.
- The final output must contain ONLY these top-level keys: pages, visual_canon, page_image_prompt_packages.
- Each page object must contain ONLY: page_no, page_id, page_text_cn, next_page_id, interaction, branch_choices.
- Each interaction object must contain ONLY: type, instruction, event_key, ext.
- interaction.ext must contain ONLY: encouragement.
- Each branch choice object must contain ONLY: choice_id, label, next_page_id.
- visual_canon must contain ONLY: global_visual_prompt_prefix_en, character_lock_prompt_en, world_lock_prompt_en, negative_prompt_en.
- Each page_image_prompt_package must contain ONLY: page_no, page_id, image_prompt_suffix_en.""".strip()

def build_run_config(
    story_arc: Dict[str, Any],
    recap_and_goal: Dict[str, Any],
    basic_constraints: Dict[str, Any],
    temporal_characteristics: Dict[str, Any],
    recent_story: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    page_range = basic_constraints["words_per_page_target_cn"]
    total_range = basic_constraints["word_count_cn_profiles"]["standard"]
    three_element_minimums = basic_constraints["three_element_minimums"]
    food_override_hint = _extract_food_override(temporal_characteristics)
    food_override_must_follow = bool(
        isinstance(food_override_hint, str)
        and food_override_hint.strip()
    )

    return {
        "effective_inputs": {
            "language": basic_constraints.get("language", "zh-CN"),
            "episode_page_count": basic_constraints["episode_page_count"],
            "words_per_page_target_cn": page_range,
            "word_count_cn_profile_standard": total_range,
            "image_count_target": basic_constraints["image_count_target"],
            "three_element_minimums": three_element_minimums,
            "food_override_hint": food_override_hint,
            "food_override_must_follow": food_override_must_follow,
        },
        "prompt_emphasis": {
            "continuity_priority": "Honor recurring world logic, helper roles, rituals, recurring objects, and recent continuity without turning framework-only details into fake past events.",
            "episode_freshness": "Keep the episode fresh by varying the focal food trait, place detail, helper moment, or comparison thread while staying coherent with the same series.",
            "language_naturalness_priority": (
                "Use natural, child-facing spoken Chinese with short concrete sentences suitable for read-aloud. "
                "Avoid translationese (e.g., overly literal wording, stacked abstract nouns, formal report tone). "
                "Prefer warm colloquial wording used in everyday parent-child conversation."
            ),
            "interaction_priority": (
                "Allowed interaction types are choice, record_voice, tap, drag, and mimic. "
                f"Hard caps: tap/drag/mimic <= {basic_constraints['interaction_constraints']['micro_interactions_max_per_episode']}, "
                "record_voice <= 1, choice <= 1. "
                "Prefer 1 meaningful choice point when budget allows, but allow 0 if needed. "
                "Use low-pressure tap/drag/mimic interactions so that the episode usually has 3-4 tap/drag/mimic pages while staying within micro_interactions_max_per_episode. "
                "choice and record_voice are optional and do not consume that tap/drag/mimic budget."
            ),
            "knowledge_scope_priority": "When the episode uses knowledge content, prioritize age-appropriate health/nutrition relevance of the target food in everyday child language. Botany/origin details may appear as supporting flavor, and work best when linked to child-facing meaning.",
            "element_balance_priority": (
                "Treat sensory/knowledge/role-model as optional narrative ingredients rather than a rigid checklist. "
                "Smell/touch/look beats are welcome but should not dominate the whole episode repeatedly; rotate narrative momentum with comparison, helper moments, mini-mystery, or scene-event progress."
            ),
            "recent_story_policy": "recent_story is optional. Use it only to sharpen local carry-over details, not to replace recap_and_goal.",
            "temporal_override_policy": "Treat temporal_characteristics as the current truth for food and temporary scene-specific visual overrides. A persistent base avatar reference image is assumed to define the child's face, facial features, hairstyle, and default appearance, so text should not invent or lock those details unless the user explicitly requests a temporary change.",
            "food_override_policy": (
                "If effective_inputs.food_override_must_follow is true, the episode must use effective_inputs.food_override_hint as the exact concrete food instance throughout pages and image prompt suffixes. "
                "Do not switch to another same-category food."
            ),
            "image_composition_recommendation": (
                "Default recommendation for image prompt writing: cinematic children's picture-book composition; characters roughly 35-55% of frame; "
                "scene-driven storytelling over portrait close-up; clear scene anchor + several action-related props + at least one background everyday-life layer; "
                "readable foreground/midground/background layering; avoid extreme close-up, oversized heads, empty backgrounds, and implausible scale. "
                "If a page truly needs tight focus for key narrative clarity, partially relax this recommendation while preserving environment readability."
            ),
            "image_prompt_packaging": "Store shared reusable English prompt components only once inside visual_canon. Do not output final_image_prompt_en. Each page_image_prompt_package should contain only image_prompt_suffix_en for downstream prompt assembly.",
        },
    }

def build_response_format(basic_constraints: Dict[str, Any]) -> Dict[str, Any]:
    page_count = basic_constraints["episode_page_count"]
    per_page_low, per_page_high = basic_constraints["words_per_page_target_cn"]

    return {
        "type": "json_schema",
        "json_schema": {
            "name": "episode_content_package",
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "required": ["pages", "visual_canon", "page_image_prompt_packages"],
                "properties": {
                    "pages": {
                        "type": "array",
                        "minItems": page_count,
                        "maxItems": page_count,
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": [
                                "page_no",
                                "page_id",
                                "page_text_cn",
                                "next_page_id",
                                "interaction",
                                "branch_choices",
                            ],
                            "properties": {
                                "page_no": {"type": "integer"},
                                "page_id": {
                                    "type": "string",
                                    "description": "Unique page identifier such as p01, p05a, or p05b. Use branch suffixes only when needed for the single shallow choice path."
                                },
                                "page_text_cn": {
                                    "type": "string",
                                    "description": f"Child-facing Chinese reading text. Target {per_page_low}-{per_page_high} Han characters, counting only Chinese Han characters. The count is validated internally and does not need to be output as a separate field."
                                },
                                "next_page_id": {
                                    "type": ["string", "null"],
                                    "description": "Default next page in the story flow. Use null for the final page and for the choice page whose routing is handled by branch_choices."
                                },
                                "interaction": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "required": ["type", "instruction", "event_key", "ext"],
                                    "properties": {
                                        "type": {
                                            "type": "string",
                                            "enum": ["none", "tap", "drag", "choice", "mimic", "record_voice"],
                                        },
                                        "instruction": {
                                            "type": ["string", "null"],
                                            "description": "Child-facing interaction instruction in Chinese. Null only when interaction.type is none."
                                        },
                                        "event_key": {
                                            "type": ["string", "null"],
                                            "description": "Unique snake_case event key for interactive pages. Null when interaction.type is none."
                                        },
                                        "ext": {
                                            "type": "object",
                                            "additionalProperties": False,
                                            "required": ["encouragement"],
                                            "properties": {
                                                "encouragement": {
                                                    "type": ["string", "null"],
                                                    "description": "Short warm encouragement shown after the interaction. Null only when interaction.type is none."
                                                }
                                            },
                                        },
                                    },
                                },
                                "branch_choices": {
                                    "type": "array",
                                    "maxItems": 2,
                                    "description": "Exactly 2 items for the single choice page. Empty array for all other pages.",
                                    "items": {
                                        "type": "object",
                                        "additionalProperties": False,
                                        "required": ["choice_id", "label", "next_page_id"],
                                        "properties": {
                                            "choice_id": {"type": "string"},
                                            "label": {"type": "string"},
                                            "next_page_id": {"type": "string"},
                                        },
                                    },
                                },
                            },
                        },
                    },
                    "visual_canon": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": [
                            "global_visual_prompt_prefix_en",
                            "character_lock_prompt_en",
                            "world_lock_prompt_en",
                            "negative_prompt_en",
                        ],
                        "properties": {
                            "global_visual_prompt_prefix_en": {
                                "type": "string",
                                "description": "Shared reusable English prompt front-half for global art style, rendering canon, and overall visual tone across the whole episode."
                            },
                            "character_lock_prompt_en": {
                                "type": "string",
                                "description": "Lightweight shared English character lock. Assume a persistent base character reference image defines the child's face, facial features, hairstyle, and default look. Only mention temporary scene-specific clothing/accessory changes when required by the episode."
                            },
                            "world_lock_prompt_en": {
                                "type": "string",
                                "description": "Shared reusable English world lock for recurring locations, objects, props, and environment continuity."
                            },
                            "negative_prompt_en": {
                                "type": "string",
                                "description": "Shared reusable English negative prompt constraints for all pages."
                            },
                        },
                    },
                    "page_image_prompt_packages": {
                        "type": "array",
                        "minItems": page_count,
                        "maxItems": page_count,
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": [
                                "page_no",
                                "page_id",
                                "image_prompt_suffix_en",
                            ],
                            "properties": {
                                "page_no": {"type": "integer"},
                                "page_id": {"type": "string"},
                                "image_prompt_suffix_en": {
                                    "type": "string",
                                    "description": "Page-specific English scene suffix. The shared reusable front-half is stored once in visual_canon and should be combined downstream with this suffix during image generation."
                                },
                            },
                        },
                    },
                },
            },
        },
    }

def _validate_episode_output(episode: Dict[str, Any], basic_constraints: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    interaction_overflow_tolerance = 1

    if not isinstance(episode, dict):
        return ["Output is not a JSON object."]

    page_count = basic_constraints["episode_page_count"]
    min_page_cn, max_page_cn = basic_constraints["words_per_page_target_cn"]
    total_low, total_high = basic_constraints["word_count_cn_profiles"]["standard"]
    interaction_limit = basic_constraints["interaction_constraints"]["micro_interactions_max_per_episode"]

    pages = episode.get("pages")
    if not isinstance(pages, list):
        return ["pages must be a list."]
    if len(pages) != page_count:
        errors.append(f"pages must contain exactly {page_count} items, found {len(pages)}.")

    page_ids: List[str] = []
    page_no_seen: List[int] = []
    choice_count = 0
    record_voice_count = 0
    tap_drag_mimic_count = 0
    total_cn = 0
    event_keys: List[str] = []

    for idx, page in enumerate(pages, start=1):
        if not isinstance(page, dict):
            errors.append(f"Page {idx} is not an object.")
            continue

        if "char_count_cn" in page:
            errors.append(f"Page {idx} should not output char_count_cn.")

        page_no = page.get("page_no")
        if not isinstance(page_no, int):
            errors.append(f"Page {idx} page_no must be an integer.")
        else:
            page_no_seen.append(page_no)

        page_id = page.get("page_id")
        if not isinstance(page_id, str) or not page_id.strip():
            errors.append(f"Page {idx} page_id must be a non-empty string.")
        else:
            page_ids.append(page_id)

        text = page.get("page_text_cn")
        if not isinstance(text, str) or not text.strip():
            errors.append(f"Page {idx} page_text_cn must be a non-empty string.")
            actual_count = 0
        else:
            actual_count = _count_han_characters(text)
            total_cn += actual_count
            if actual_count < min_page_cn or actual_count > max_page_cn:
                errors.append(
                    f"Page {idx} Han-character count {actual_count} is outside {min_page_cn}-{max_page_cn}."
                )

        interaction = page.get("interaction")
        if not isinstance(interaction, dict):
            errors.append(f"Page {idx} interaction must be an object.")
            interaction_type = "none"
        else:
            interaction_type = interaction.get("type")
            if interaction_type not in {"none", "tap", "drag", "choice", "mimic", "record_voice"}:
                errors.append(f"Page {idx} has invalid interaction.type={interaction_type!r}.")
                interaction_type = "none"

            instruction = interaction.get("instruction")
            event_key = interaction.get("event_key")
            ext = interaction.get("ext")
            encouragement = ext.get("encouragement") if isinstance(ext, dict) else None

            if interaction_type == "none":
                if instruction not in (None, ""):
                    errors.append(f"Page {idx} interaction.instruction must be null/empty when type is none.")
                if event_key not in (None, ""):
                    errors.append(f"Page {idx} interaction.event_key must be null/empty when type is none.")
                if encouragement not in (None, ""):
                    errors.append(f"Page {idx} encouragement must be null/empty when interaction type is none.")
            else:
                if not isinstance(instruction, str) or not instruction.strip():
                    errors.append(f"Page {idx} interactive pages must have a non-empty interaction.instruction.")
                if not isinstance(event_key, str) or not event_key.strip():
                    errors.append(f"Page {idx} interactive pages must have a non-empty interaction.event_key.")
                else:
                    event_keys.append(event_key)
                if not isinstance(encouragement, str) or not encouragement.strip():
                    errors.append(f"Page {idx} interactive pages must have a non-empty encouragement.")

            if interaction_type in {"tap", "drag", "mimic"}:
                tap_drag_mimic_count += 1
            if interaction_type == "choice":
                choice_count += 1
            if interaction_type == "record_voice":
                record_voice_count += 1

        branch_choices = page.get("branch_choices")
        if not isinstance(branch_choices, list):
            errors.append(f"Page {idx} branch_choices must be a list.")
            branch_choices = []

        if interaction_type == "choice":
            if len(branch_choices) != 2:
                errors.append(f"Choice page {idx} must contain exactly 2 branch_choices.")
            for branch_idx, branch in enumerate(branch_choices, start=1):
                if not isinstance(branch, dict):
                    errors.append(f"Choice page {idx} branch choice {branch_idx} is not an object.")
                    continue
                for key in ("choice_id", "label", "next_page_id"):
                    value = branch.get(key)
                    if not isinstance(value, str) or not value.strip():
                        errors.append(f"Choice page {idx} branch choice {branch_idx} missing valid {key}.")
            if page.get("next_page_id") is not None:
                errors.append(f"Choice page {idx} next_page_id must be null because routing is handled by branch_choices.")
        else:
            if len(branch_choices) != 0:
                errors.append(f"Non-choice page {idx} must have an empty branch_choices array.")

    if page_no_seen and sorted(page_no_seen) != list(range(1, len(page_no_seen) + 1)):
        errors.append("page_no values must form a continuous sequence starting from 1.")

    if len(page_ids) != len(set(page_ids)):
        errors.append("page_id values must be unique.")

    if total_cn < total_low or total_cn > total_high:
        errors.append(
            f"Total Han-character count {total_cn} is outside the allowed range {total_low}-{total_high}."
        )

    if tap_drag_mimic_count > interaction_limit:
        overflow = tap_drag_mimic_count - interaction_limit
        if overflow > interaction_overflow_tolerance:
            errors.append(
                f"tap/drag/mimic page count {tap_drag_mimic_count} exceeds limit {interaction_limit} by {overflow}, beyond tolerance {interaction_overflow_tolerance}."
            )

    choice_limit = basic_constraints["interaction_constraints"]["choice_points_max_per_episode"]
    effective_choice_limit = min(1, choice_limit)
    if choice_count > effective_choice_limit:
        overflow = choice_count - effective_choice_limit
        if overflow > interaction_overflow_tolerance:
            errors.append(
                f"Episode may contain at most {effective_choice_limit} choice page(s), found {choice_count} (overflow {overflow}, tolerance {interaction_overflow_tolerance})."
            )

    if record_voice_count > 1:
        overflow = record_voice_count - 1
        if overflow > interaction_overflow_tolerance:
            errors.append(
                f"Episode may contain at most 1 record_voice page, found {record_voice_count} (overflow {overflow}, tolerance {interaction_overflow_tolerance})."
            )

    preferred_min_interactions = min(3, interaction_limit)
    preferred_max_interactions = min(4, interaction_limit)
    if interaction_limit >= 3 and tap_drag_mimic_count < preferred_min_interactions:
        errors.append(
            f"Episode should preferably contain at least {preferred_min_interactions} tap/drag/mimic pages when the budget is {interaction_limit}, found {tap_drag_mimic_count}."
        )
    if tap_drag_mimic_count > preferred_max_interactions + interaction_overflow_tolerance:
        errors.append(
            f"Episode should contain at most {preferred_max_interactions} tap/drag/mimic pages under the preferred interaction design, found {tap_drag_mimic_count}."
        )

    if len(event_keys) != len(set(event_keys)):
        errors.append("interaction.event_key values must be unique across interactive pages.")

    page_id_set = set(page_ids)
    for idx, page in enumerate(pages, start=1):
        if not isinstance(page, dict):
            continue
        next_page_id = page.get("next_page_id")
        interaction_type = None
        interaction = page.get("interaction")
        if isinstance(interaction, dict):
            interaction_type = interaction.get("type")

        if interaction_type != "choice":
            if idx == len(pages):
                if next_page_id is not None:
                    errors.append("Final page must use next_page_id = null.")
            else:
                if next_page_id is None:
                    errors.append(f"Non-final non-choice page {idx} must have a next_page_id.")
                elif next_page_id not in page_id_set:
                    errors.append(f"Page {idx} next_page_id={next_page_id!r} does not match any page_id.")

        branch_choices = page.get("branch_choices")
        if isinstance(branch_choices, list):
            for branch in branch_choices:
                if isinstance(branch, dict):
                    branch_next = branch.get("next_page_id")
                    if isinstance(branch_next, str) and branch_next not in page_id_set:
                        errors.append(
                            f"Choice branch next_page_id={branch_next!r} does not match any page_id."
                        )

    prompt_packages = episode.get("page_image_prompt_packages")
    if not isinstance(prompt_packages, list):
        errors.append("page_image_prompt_packages must be a list.")
    else:
        if len(prompt_packages) != page_count:
            errors.append(
                f"page_image_prompt_packages must contain exactly {page_count} items, found {len(prompt_packages)}."
            )
        prompt_page_ids: List[str] = []
        for idx, pkg in enumerate(prompt_packages, start=1):
            if not isinstance(pkg, dict):
                errors.append(f"Prompt package {idx} is not an object.")
                continue
            if "final_image_prompt_en" in pkg:
                errors.append(f"Prompt package {idx} should not output final_image_prompt_en.")
            for key in ("page_no", "page_id", "image_prompt_suffix_en"):
                value = pkg.get(key)
                if key == "page_no":
                    if not isinstance(value, int):
                        errors.append(f"Prompt package {idx} page_no must be an integer.")
                else:
                    if not isinstance(value, str) or not value.strip():
                        errors.append(f"Prompt package {idx} {key} must be a non-empty string.")
            page_id = pkg.get("page_id")
            if isinstance(page_id, str):
                prompt_page_ids.append(page_id)
        if set(prompt_page_ids) != page_id_set:
            errors.append("page_image_prompt_packages.page_id values must match pages.page_id exactly.")

    visual_canon = episode.get("visual_canon")
    if not isinstance(visual_canon, dict):
        errors.append("visual_canon must be an object.")
    else:
        required_visual_keys = [
            "global_visual_prompt_prefix_en",
            "character_lock_prompt_en",
            "world_lock_prompt_en",
            "negative_prompt_en",
        ]
        for key in required_visual_keys:
            value = visual_canon.get(key)
            if not isinstance(value, str) or not value.strip():
                errors.append(f"visual_canon.{key} must be a non-empty string.")
        deprecated_visual_keys = [
            "style_summary_cn",
            "character_consistency_note_cn",
            "background_consistency_note_cn",
            "color_palette_note_cn",
        ]
        for key in deprecated_visual_keys:
            if key in visual_canon:
                errors.append(
                    f"visual_canon should not include deprecated key {key}. Use shared English prompt fields only."
                )

    return errors

def _call_model(
    messages: List[Dict[str, str]],
    response_format: Dict[str, Any],
    max_completion_tokens: int,
):
    try:
        return client.chat.completions.create(
            model=deployment,
            messages=messages,
            response_format=response_format,
            max_completion_tokens=max_completion_tokens,
        )
    except TypeError:
        return client.chat.completions.create(
            model=deployment,
            messages=messages,
            max_completion_tokens=max_completion_tokens,
        )


def generate_episode(
    story_arc: Optional[Dict[str, Any]] = None,
    recap_and_goal: Optional[Dict[str, Any]] = None,
    basic_constraints: Optional[Dict[str, Any]] = None,
    temporal_characteristics: Optional[Dict[str, Any]] = None,
    recent_story: Optional[Any] = None,
    max_retries: int = 2,
) -> Dict[str, Any]:
    """生成单集绘本 episode。

    recent_story 是可选输入：
    - 有时可帮助保持上一集局部细节连续性；
    - 没有时也可以正常生成，主要依赖 story_arc + recap_and_goal。

    角色形象说明：
    - 后续绘图阶段会始终提供一张基础角色参考图，作为孩子五官、脸型、发型和默认外观的最高优先级来源。
    - 本模块的文本提示不应再锁定这些稳定外观细节。
    - 只有当某一页场景确实需要特殊穿着（如雨衣、围裙、冬季外套、节日装扮等）时，才应轻量描述该临时服装变化。

    输出说明：
    - 输出页对象中不再包含 char_count_cn；汉字数由模块内部校验。
    - visual_canon 只保留共享可复用的英文图像提示前半部分，不再输出中文/英文重复说明。
    - page_image_prompt_packages 中只保留每页 image_prompt_suffix_en；最终图像 prompt 由下游将 visual_canon 与 suffix 进行拼接。

    交互说明：
    - 允许的交互类型为 none、tap、drag、choice、mimic、record_voice。
    - choice 最多 1 个，可以为 0 个；若预算允许，优先生成 1 个 meaningful choice point。
    - record_voice、tap、drag、mimic 可组合使用。
    - tap/drag/mimic 共享 micro_interactions_max_per_episode 预算（当前上限 4），choice 与 record_voice 不占用该预算。
    - 当预算允许时，整集最好有 3–4 个 tap/drag/mimic 页面。
    """
    if story_arc is None:
        story_arc = _load_json_if_exists("story_arc_framework.json", {})
    else:
        story_arc = _ensure_dict(story_arc)

    if recap_and_goal is None:
        recap_and_goal = _load_json_if_exists("recap_goal.json", {})
    else:
        recap_and_goal = _ensure_dict(recap_and_goal)

    if basic_constraints is None:
        basic_constraints = _load_json_if_exists("basic_constraints.json", {})
    basic_constraints = _normalize_basic_constraints(basic_constraints)

    if temporal_characteristics is None:
        temporal_characteristics = _load_json_if_exists("temporal_characteristics.json", {})
    temporal_characteristics = _normalize_temporal_characteristics(temporal_characteristics)

    if recent_story is None:
        recent_story = _load_json_if_exists("recent_story.json", None)
        if recent_story is None:
            recent_story = _load_json_if_exists("last_story.json", None)
    recent_story = _normalize_recent_story(recent_story)

    interaction_constraints = basic_constraints["interaction_constraints"]
    if interaction_constraints["choice_points_max_per_episode"] < 0:
        raise ValueError("basic_constraints.choice_points_max_per_episode must be at least 0.")
    if interaction_constraints["micro_interactions_max_per_episode"] < 0:
        raise ValueError("basic_constraints.micro_interactions_max_per_episode must be at least 0.")

    developer_policy = build_developer_policy()
    run_config = build_run_config(
        story_arc=story_arc,
        recap_and_goal=recap_and_goal,
        basic_constraints=basic_constraints,
        temporal_characteristics=temporal_characteristics,
        recent_story=recent_story,
    )
    response_format = build_response_format(basic_constraints)

    user_payload: Dict[str, Any] = {
        "story_arc": story_arc,
        "recap_and_goal": recap_and_goal,
        "basic_constraints": basic_constraints,
        "temporal_characteristics": temporal_characteristics,
    }
    if recent_story is not None:
        user_payload["recent_story"] = recent_story

    messages: List[Dict[str, str]] = [
        {"role": "developer", "content": developer_policy},
        {"role": "developer", "content": json.dumps(run_config, ensure_ascii=False)},
        {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
    ]

    last_errors: List[str] = []

    for attempt in range(1, max(1, max_retries) + 1):
        response = _call_model(
            messages=messages,
            response_format=response_format,
            max_completion_tokens=32768,
        )
        raw_content = response.choices[0].message.content
        result = json.loads(raw_content)
        _normalize_page_numbers(result)
        errors = _validate_episode_output(result, basic_constraints)
        if not errors:
            return result

        last_errors = errors
        if attempt == max_retries:
            break

        messages.extend(
            [
                {"role": "assistant", "content": json.dumps(result, ensure_ascii=False)},
                {
                    "role": "developer",
                    "content": (
                        "Your previous output failed validation. Regenerate the FULL JSON from scratch and fix all issues below. "
                        "Do not explain. Output only the corrected JSON object.\n- "
                        + "\n- ".join(errors)
                    ),
                },
            ]
        )

    raise ValueError(
        "Episode generation failed validation after retries:\n- " + "\n- ".join(last_errors)
    )


if __name__ == "__main__":
    demo_story_arc = _load_json_if_exists("story_arc_framework.json", {})
    demo_recap_goal = _load_json_if_exists("recap_goal.json", {})
    demo_basic_constraints = _load_json_if_exists("basic_constraints.json", {})
    demo_temporal_characteristics = _load_json_if_exists("temporal_characteristics.json", {})
    demo_recent_story = _load_json_if_exists("recent_story.json", None)
    if demo_recent_story is None:
        demo_recent_story = _load_json_if_exists("last_story.json", None)

    episode = generate_episode(
        story_arc=demo_story_arc,
        recap_and_goal=demo_recap_goal,
        basic_constraints=demo_basic_constraints,
        temporal_characteristics=demo_temporal_characteristics,
        recent_story=demo_recent_story,
    )
    print(json.dumps(episode, ensure_ascii=False, indent=2))
