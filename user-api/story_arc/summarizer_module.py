import json
import os
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


def _module_dir() -> str:
    return os.path.dirname(os.path.abspath(__file__))


def _load_json_if_exists(filename: str, default: Any) -> Any:
    path = os.path.join(_module_dir(), filename)
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _normalize_string_list(value: Any) -> List[str]:
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []

    out: List[str] = []
    for item in value:
        if isinstance(item, str):
            text = item.strip()
            if text:
                out.append(text)
    return out


def _coerce_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()

    if isinstance(value, list):
        chunks: List[str] = []
        for item in value:
            text = _coerce_text(item)
            if text:
                chunks.append(text)
        return "\n".join(chunks).strip()

    if isinstance(value, dict):
        preferred_keys = [
            "text_cn",
            "story_text_cn",
            "content_cn",
            "story_cn",
            "story",
            "content",
            "summary_cn",
            "narration",
            "page_text",
            "pages",
        ]
        for key in preferred_keys:
            if key in value:
                text = _coerce_text(value.get(key))
                if text:
                    return text
        return json.dumps(value, ensure_ascii=False)

    return ""


def normalize_previous_blocks(previous_blocks: Any) -> List[Dict[str, str]]:
    if not isinstance(previous_blocks, list):
        raise ValueError("previous_blocks must be a list.")

    trimmed = previous_blocks[-3:]
    normalized: List[Dict[str, str]] = []

    for idx, block in enumerate(trimmed, start=1):
        if isinstance(block, str):
            text_cn = block.strip()
            if not text_cn:
                continue
            normalized.append(
                {
                    "episode_id": f"episode_{idx}",
                    "title": "unspecified",
                    "text_cn": text_cn,
                }
            )
            continue

        if isinstance(block, dict):
            episode_id = block.get("episode_id") or block.get("id") or f"episode_{idx}"
            title = (
                block.get("title")
                or block.get("episode_title")
                or block.get("name")
                or "unspecified"
            )
            text_cn = _coerce_text(block)
            if not text_cn:
                continue
            normalized.append(
                {
                    "episode_id": str(episode_id),
                    "title": str(title),
                    "text_cn": text_cn,
                }
            )
            continue

    if not normalized:
        raise ValueError("No usable previous story blocks were found.")

    return normalized


def build_developer_policy() -> str:
    return """You are the STORY CONTINUITY SUMMARIZER MODULE for a recurring children's picture-book series about picky-eating exploration.

Your job:
- Given one or multiple previous story blocks, summarize what has happened so far inside one shared recurring story world.
- If a story_framework is provided, use it as stable background guidance for continuity (e.g., world setting, recurring elements, recurring objects, guide/helper roles, recurring phrases, or stable narrative rules).
- Produce: (1) a concise but meaningful child-facing recap for the next episode, (2) a high-level next-episode micro goal / curiosity direction, and (3) continuity hooks for downstream episode generation.
- The micro goal is a narrative/content-level direction for what should feel interesting to continue next, NOT a behavioral stage, willingness ladder, readiness label, intervention stage, or a beat-by-beat scene script.

Input interpretation:
- previous_blocks contains up to the latest 3 story episodes.
- Treat the blocks as parts of one shared recurring story world.
- If story_framework is present, use it to preserve the stable series identity: world concept, recurring travel logic, guide/helper roles, recurring objects/rituals/phrases, and the kind of discovery the series keeps returning to.
- You may surface stable series machinery from story_framework when it helps continuity, as long as you do NOT claim that a specific unseen plot event already happened.
- Prefer recent continuity when choosing what should continue next, but preserve stable recurring elements when they are clearly important across multiple episodes.

Requirements:
- Summarize ONLY what is present in previous_blocks for actual past events. Do NOT invent past events, new characters, new settings, food facts, or emotional reactions that are not supported by the input.
- Use story_framework to strengthen series-specific continuity signals and recognizable story identity, but do NOT turn framework details into new unseen plot events.
- When story_framework contains stable recurring elements (for example: a starting ritual, a guide/helper, a stop-card or ticket cue, a map, a notes booklet, a recurring phrase, or a return-to-base ending), use them when they help the summary feel like this specific series rather than a generic vegetable story.
- The recap should do more than list two actions. Briefly capture both: (a) the most important recent story events and (b) the recurring pattern or series feel that is now established.
- The recap must be child-facing, warm, short, and simple Chinese suitable for ages 3–6. It may be slightly fuller than a one-line recap if needed for continuity.
- key_story_elements should prioritize load-bearing continuity anchors: recurring journey pattern, helper role, recurring object/ritual/phrase, meaningful food-place links, sensory progression, and small unresolved hooks.
- The micro goal must be high-level, interesting, and easy for the downstream episode generator to build on.
- The micro goal should describe the kind of discovery, comparison, playful question, or continuity energy to continue next, rather than a detailed sequence of exact actions, props, or scene beats.
- A strong micro goal often centers a child-sized curiosity, contrast, or return pattern (for example: comparing two different food feelings, extending a gentle role-model moment, revisiting a recurring ritual/object, or following a small open curiosity from recent episodes).
- Unless previous_blocks already point to a specific next item, do NOT force a brand-new specific vegetable, place, visitor, or event into the micro goal.
- Leave room for downstream episode generation to decide the exact stop, scene choreography, specific fact, and wording of invitations.
- The micro goal should keep picky-eating storytelling meaningfully in scope by staying connected to the target food, food-related experiences, or one or more of the three recurring content elements: sensory description, contextualized food knowledge, and role-model narrative.
- Do NOT analyze child stage, willingness stage, user readiness, or intervention progress. Those are handled by other modules.
- continuity_hooks should preserve concrete continuity cues for downstream use: recurring objects, repeated phrases, helpers, food/place details, unresolved tiny mysteries, or return patterns.
- continuity_hooks.next_episode_seed should be a one-sentence teaser or high-level seed, NOT a mini plot outline or step-by-step instruction set.
- Be concise. Prefer concrete continuity cues (food, place, recurring object, helper, repeated phrase, unresolved small event, comparison thread) over abstract summary.
- To reduce exact repetition, prefer a next-step that preserves continuity while slightly shifting at least one of the following when supported by the input: the food trait in focus, the place detail, the recurring object use, the helper moment, the small visitor/event, or the emphasized element (sensory / knowledge / role_model).
- Recap-and-goal must explicitly implement "continuity + variation": keep 1-2 core carry-over anchors, and clearly change at least one story-structure axis for the next episode (for example: opening trigger, who leads the action, exploration path, comparison target, or how discovery is revealed).
- Avoid near-duplicate episode skeletons across consecutive episodes. Do not output a next direction that is effectively the same sequence with only wording swaps.
- If the latest episode already used one dominant structure, prefer a different but coherent structure next (for example: from "observe then explain" to "question then test", from "guide-led demo" to "child-led try", or from "single-item close look" to "contrast/comparison framing").
- If multiple continuation points exist, choose the one that is most coherent, specific enough to be useful, and most generative for downstream episode writing.

System alignment:
- Keep the recap and micro goal aligned with a picky-eating storytelling style that is low-pressure, non-mealtime, warm, playful, and non-coercive.
- Avoid shaming, threats, coercion, punishment, transactional reward framing, stigmatizing language, and medical advice.

Output rules:
- Output MUST be exactly one valid JSON object and nothing else.
- Do NOT add markdown, code fences, explanations, or extra text outside the JSON object.""".strip()


def build_run_config(story_framework: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    story_framework = story_framework or {}

    return {
        "effective_inputs": {
            "story_framework": story_framework,
            "window_rule": "Summarize at most the latest 3 previous story episodes.",
        },
        "prompt_emphasis": {
            "framework_usage": "Use story_framework to strengthen stable series identity and recurring continuity machinery when grounded, without claiming unseen events.",
            "micro_goal_granularity": "Keep the micro goal high-level, interesting, and generative for downstream episode writing; do not pre-script the next episode beat by beat.",
            "anti_repetition_priority": (
                "For recap and micro_goal, enforce continuity + variation: preserve 1-2 core carry-over anchors while changing at least one story-structure axis "
                "(opening trigger, action leader, exploration path, comparison frame, or discovery reveal style). "
                "Avoid near-duplicate episode skeletons in consecutive episodes."
            ),
        },
    }


def build_response_format() -> Dict[str, Any]:
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "story_continuity_summary",
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "required": ["recap", "micro_goal", "continuity_hooks"],
                "properties": {
                    "recap": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["text_cn", "key_story_elements"],
                        "properties": {
                            "text_cn": {
                                "type": "string",
                                "description": "A warm child-facing recap in simple Chinese. Slightly fuller than a one-line summary if needed: briefly recall the main recent events plus the recurring series pattern now established."
                            },
                            "key_story_elements": {
                                "type": "array",
                                "maxItems": 3,
                                "description": "Up to 3 load-bearing continuity anchors. Prefer recurring series machinery, helper roles, important food/place links, sensory progression, or unresolved tiny hooks.",
                                "items": {"type": "string"},
                            },
                        },
                    },
                    "micro_goal": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["title", "text_cn", "focus_type", "rationale"],
                        "properties": {
                            "title": {
                                "type": "string",
                                "description": "A short evocative label for the next high-level continuity direction."
                            },
                            "text_cn": {
                                "type": "string",
                                "description": "A high-level, interesting narrative direction or curiosity hook for the next episode in simple Chinese. Do not script exact scene beats or step-by-step actions. Must preserve continuity while signaling at least one meaningful structure-level variation from the latest episode."
                            },
                            "focus_type": {
                                "type": "string",
                                "enum": [
                                    "sensory",
                                    "knowledge",
                                    "role_model",
                                    "mixed",
                                    "continuity_hook",
                                ],
                            },
                            "rationale": {
                                "type": "string",
                                "description": "Briefly explain why this direction follows from the recent episodes and the stable framework continuity."
                            },
                        },
                    },
                    "continuity_hooks": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": [
                            "carry_over_elements",
                            "open_threads",
                            "next_episode_seed",
                        ],
                        "properties": {
                            "carry_over_elements": {
                                "type": "array",
                                "maxItems": 3,
                                "description": "Up to 3 concrete elements that should carry forward, such as recurring objects, rituals, helpers, food/place details, sensory patterns, or phrases.",
                                "items": {"type": "string"},
                            },
                            "open_threads": {
                                "type": "array",
                                "maxItems": 3,
                                "description": "Up to 3 small unresolved curiosities or continuity openings.",
                                "items": {"type": "string"},
                            },
                            "next_episode_seed": {
                                "type": "string",
                                "description": "One-sentence teaser or high-level seed for downstream episode generation, leaving exact stop, scene beats, and invitation wording open. It should indicate continuity plus freshness rather than repeating the previous episode skeleton."
                            },
                        },
                    },
                },
            },
        },
    }


def summarize_previous_episodes(
    previous_blocks: Any,
    story_framework: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    normalized_blocks = normalize_previous_blocks(previous_blocks)

    if story_framework is None:
        story_framework = _load_json_if_exists("story_arc_framework.json", None)
        if story_framework is None:
            story_framework = _load_json_if_exists("story_framework.json", {})

    developer_policy = build_developer_policy()
    run_config = build_run_config(story_framework)
    response_format = build_response_format()

    user_payload = {
        "previous_blocks": normalized_blocks,
    }

    try:
        response = client.chat.completions.create(
            model=deployment,
            messages=[
                {"role": "developer", "content": developer_policy},
                {"role": "developer", "content": json.dumps(run_config, ensure_ascii=False)},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
            ],
            response_format=response_format,
            max_completion_tokens=16384,
        )
    except TypeError:
        response = client.chat.completions.create(
            model=deployment,
            messages=[
                {"role": "developer", "content": developer_policy},
                {"role": "developer", "content": json.dumps(run_config, ensure_ascii=False)},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
            ],
            max_completion_tokens=16384,
        )

    raw_content = response.choices[0].message.content

    return json.loads(raw_content)


# if __name__ == "__main__":
#     demo_previous_blocks = [
#         {
#             "episode_id": "ep1",
#             "title": "Green Line First Stop",
#             "text_cn": "小朋友和绿线小火车去了阳台小站，看到了一片生菜叶。她先看了看叶子的边边，又轻轻闻了闻。妈妈也先闻了一下，说生菜闻起来有点清清的。回家的时候，他们把一张小叶子贴在地图上。",
#         },
#         {
#             "episode_id": "ep2",
#             "title": "Cucumber Ticket Day",
#             "text_cn": "第二天，绿线小火车开到厨房小站，看见了圆圆的黄瓜片。小朋友把黄瓜片贴在手背上，觉得凉凉的。表哥也先摸了摸，再小小舔了一下，说黄瓜有一点点水水的味道。大家回到车站时，又听见了熟悉的发车口号。",
#         },
#     ]

#     # demo_previous_blocks 中即使提供更多故事，实际也只会取最新 3 个
#     # 从story_arc_framework.json读取已有的story framework
#     demo_story_framework = _load_json_if_exists("story_arc_framework.json", {})

#     summary = summarize_previous_episodes(demo_previous_blocks, demo_story_framework)
#     print(json.dumps(summary, ensure_ascii=False, indent=2))
