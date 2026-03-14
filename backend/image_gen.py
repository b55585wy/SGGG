import base64
import json
import os
import time
import uuid as _uuid
import urllib.request
import urllib.error
from urllib.parse import urlparse, unquote
from pathlib import Path
from typing import Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8000")
_IMAGES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "images")

MAX_RETRIES = 3
PAGE_MAX_RETRIES = 2
RETRY_DELAYS = [2, 5, 10]  # seconds between retries
_REPO_ROOT = Path(__file__).resolve().parents[1]
_FRONTEND_PUBLIC_DIR = (_REPO_ROOT / "frontend" / "public").resolve()


def _safe_str(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _assemble_episode_prompt(visual_canon: dict[str, Any], suffix: str) -> str:
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


def _resolve_page_prompt(
    page: dict[str, Any],
    visual_canon: Optional[dict[str, Any]],
    prompt_package_map: dict[str, dict[str, Any]],
) -> str:
    page_id = _safe_str(page.get("page_id"))
    if visual_canon and page_id:
        prompt_pkg = prompt_package_map.get(page_id) or {}
        suffix = _safe_str(prompt_pkg.get("image_prompt_suffix_en"))
        if suffix:
            return _assemble_episode_prompt(visual_canon, suffix)
    return _safe_str(page.get("image_prompt"))


def _save_locally_bytes(raw: bytes, ext: str = ".png") -> Optional[str]:
    """保存图片字节到本地，返回永久本地 URL。失败返回 None。"""
    try:
        os.makedirs(_IMAGES_DIR, exist_ok=True)
        img_name = _uuid.uuid4().hex + ext
        path = os.path.join(_IMAGES_DIR, img_name)
        with open(path, "wb") as f:
            f.write(raw)
        return f"{BACKEND_BASE_URL}/static/images/{img_name}"
    except Exception as e:
        print(f"[IMG] 本地保存失败: {e}")
        return None


def _build_multipart_body(fields: list[tuple[str, str]], files: list[tuple[str, str, bytes, str]], boundary: str) -> bytes:
    chunks: list[bytes] = []
    for name, value in fields:
        chunks.extend(
            [
                f"--{boundary}\r\n".encode("utf-8"),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"),
                value.encode("utf-8"),
                b"\r\n",
            ]
        )
    for field_name, filename, content, content_type in files:
        chunks.extend(
            [
                f"--{boundary}\r\n".encode("utf-8"),
                (
                    f'Content-Disposition: form-data; name="{field_name}"; '
                    f'filename="{filename}"\r\n'
                ).encode("utf-8"),
                f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"),
                content,
                b"\r\n",
            ]
        )
    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(chunks)


def _post_json(uri: str, payload: dict, api_key: str) -> dict:
    print(f"[INFO] IMG request start uri={uri}")
    headers = {"Content-Type": "application/json"}
    if "openai.azure.com" in uri:
        headers["api-key"] = api_key
    else:
        headers["Authorization"] = f"Bearer {api_key}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(uri, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        raise RuntimeError(f"image request failed ({e.code}): {body}")
    print("[INFO] IMG request done")
    return json.loads(body) if body else {}


def _post_multipart(
    uri: str,
    fields: list[tuple[str, str]],
    files: list[tuple[str, str, bytes, str]],
    api_key: str,
) -> dict:
    boundary = f"----sggg-{_uuid.uuid4().hex}"
    data = _build_multipart_body(fields, files, boundary)
    headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    if "openai.azure.com" in uri:
        headers["api-key"] = api_key
    else:
        headers["Authorization"] = f"Bearer {api_key}"
    print(f"[INFO] IMG request start uri={uri}")
    req = urllib.request.Request(uri, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        raise RuntimeError(f"image request failed ({e.code}): {body}")
    print("[INFO] IMG request done")
    return json.loads(body) if body else {}


def _build_reference_guidance(prompt: str) -> str:
    guidance = (
        "Use the supplied child avatar reference image as the exact same child protagonist. "
        "Preserve face, hairstyle, body proportions, and default overall appearance across pages. "
        "Only change clothing or accessories when the prompt explicitly calls for a temporary scene-specific change."
    )
    return f"{guidance} {prompt}".strip()


def _build_edits_uri(uri: str) -> Optional[str]:
    if "/images/generations" in uri:
        return uri.replace("/images/generations", "/images/edits", 1)
    if "/image/generations" in uri:
        return uri.replace("/image/generations", "/images/edits", 1)
    return None


def _resolve_child_avatar_reference_path(child_avatar: Optional[dict[str, Any]]) -> Optional[str]:
    child_avatar = child_avatar if isinstance(child_avatar, dict) else {}
    asset_path = _safe_str(child_avatar.get("reference_asset_path"))
    if not asset_path:
        gender = _safe_str(child_avatar.get("gender"))
        color = _safe_str(child_avatar.get("color"))
        shirt = _safe_str(child_avatar.get("shirt"))
        underdress = _safe_str(child_avatar.get("underdress"))
        glasses = _safe_str(child_avatar.get("glasses"))
        if gender and color and shirt and underdress and glasses:
            asset_path = f"/basic/{gender}_{color}_{shirt}_{underdress}_{glasses}.png"
    if not asset_path:
        return None
    rel_path = asset_path.lstrip("/")
    candidate = (_FRONTEND_PUBLIC_DIR / rel_path).resolve()
    try:
        candidate.relative_to(_FRONTEND_PUBLIC_DIR)
    except ValueError:
        print(f"[IMG] invalid avatar reference path: {asset_path}")
        return None
    if not candidate.exists():
        print(f"[IMG] avatar reference missing path={asset_path}")
        return None
    return str(candidate)


def _extract_image_response(rsp: dict) -> Optional[str]:
    data = rsp.get("data", [])
    if data:
        b64 = data[0].get("b64_json")
        if b64:
            raw = base64.b64decode(b64)
            saved = _save_locally_bytes(raw, ".png")
            if saved:
                return saved
        url = data[0].get("url")
        if url:
            try:
                with urllib.request.urlopen(url, timeout=60) as resp:
                    raw = resp.read()
                saved = _save_locally_bytes(raw, ".png")
                if saved:
                    return saved
            except Exception:
                pass
    return None


def _load_base_image_bytes(image_url: str) -> Optional[bytes]:
    raw_url = _safe_str(image_url)
    if not raw_url:
        return None

    # Prefer local backend static file when URL points to /static/images/*
    try:
        parsed = urlparse(raw_url)
        parsed_path = unquote(parsed.path or "")
        marker = "/static/images/"
        if marker in parsed_path:
            filename = Path(parsed_path.split(marker, 1)[1]).name
            local_file = Path(_IMAGES_DIR) / filename
            if local_file.exists():
                return local_file.read_bytes()
    except Exception:
        pass

    # Fallback to HTTP fetch
    try:
        with urllib.request.urlopen(raw_url, timeout=60) as resp:
            return resp.read()
    except Exception:
        return None


def _build_interaction_delta_prompt(
    base_prompt: str,
    interaction_type: str,
    instruction: str,
) -> str:
    action_hint_map = {
        "tap": (
            "Show a clearly visible tap-result change around the interacted target while preserving scene identity. "
            "The tapped target should visibly change state (for example: opened, shifted, highlighted by lighting, "
            "or revealing a new local detail), and the child hand/finger should read as near the target."
        ),
        "drag": (
            "Show the dragged object already moved to the target location with a clear post-action result. "
            "The new placement should be obvious at a glance and remain natural in-scene."
        ),
        "mimic": (
            "Show the child in a clear mimic/imitating pose matching the instruction, "
            "with body/hand posture visibly different from the source image."
        ),
    }
    action_hint = action_hint_map.get(interaction_type, "Show a subtle interaction-result state change.")
    instruction_text = instruction if instruction else "Follow the page interaction instruction."
    return (
        "Create an interaction-result variant from the supplied source image. "
        "Keep the same characters, composition, camera angle, world props, lighting, and art style. "
        "Do not redesign identities or switch scene. "
        f"{action_hint} "
        "Ensure the post-action state is noticeable at first glance, not barely perceptible. "
        f"Interaction type: {interaction_type}. "
        f"Instruction: {instruction_text}. "
        "No text overlays, no UI elements, no split panels, no arrows, no callout symbols. "
        f"Story context prompt: {base_prompt}"
    ).strip()


def generate_interaction_delta_image(
    *,
    base_image_url: str,
    base_prompt: str,
    interaction_type: str,
    instruction: str,
) -> Optional[str]:
    uri = os.getenv("STORYIMAGE_OPENAI_URI")
    api_key = os.getenv("STORYIMAGE_OPENAI_API_KEY")
    model = os.getenv("STORYIMAGE_OPENAI_MODEL")
    if not uri or not api_key or not model:
        return None
    edits_uri = _build_edits_uri(uri)
    if not edits_uri:
        print("[IMG] interaction diff skipped: edits endpoint unavailable")
        return None

    image_bytes = _load_base_image_bytes(base_image_url)
    if not image_bytes:
        print("[IMG] interaction diff skipped: base image bytes unavailable")
        return None

    for attempt in range(PAGE_MAX_RETRIES):
        try:
            prompt = _build_interaction_delta_prompt(
                base_prompt=base_prompt,
                interaction_type=interaction_type,
                instruction=instruction,
            )
            fields = [("prompt", prompt), ("size", "1024x1024")]
            if "/deployments/" not in edits_uri:
                fields.append(("model", model))
            if "mini" not in model.lower():
                fields.append(("input_fidelity", "high"))
            print(f"[INFO] IMG interaction diff start type={interaction_type}")
            rsp = _post_multipart(
                edits_uri,
                fields,
                [("image[]", "base_scene.png", image_bytes, "image/png")],
                api_key,
            )
            saved = _extract_image_response(rsp)
            if saved:
                return saved
            print(f"[IMG] interaction diff attempt {attempt+1}: empty image data")
        except Exception as e:
            print(f"[IMG] interaction diff attempt {attempt+1} exception: {e}")
        if attempt < MAX_RETRIES - 1:
            time.sleep(RETRY_DELAYS[attempt])
    return None


def generate_page_image(prompt: str, global_style: str = "", reference_image_path: Optional[str] = None) -> Optional[str]:
    """生成单页插图，带重试。返回本地永久 URL，失败返回 None。"""
    uri = os.getenv("STORYIMAGE_OPENAI_URI")
    api_key = os.getenv("STORYIMAGE_OPENAI_API_KEY")
    model = os.getenv("STORYIMAGE_OPENAI_MODEL")
    if not uri or not api_key or not model:
        return None
    if "/images/generations" not in uri and "/image/generations" not in uri:
        print("[IMG] STORYIMAGE_OPENAI_URI should point to images/generations endpoint")
        return None

    full_prompt = f"{global_style}. {prompt}" if global_style else prompt
    edits_uri = _build_edits_uri(uri)
    reference_requested = bool(reference_image_path)
    if reference_requested and not edits_uri:
        print("[IMG] reference image provided but edits endpoint cannot be derived; skip page")
        return None

    timeout_sec = int(os.getenv("STORYIMAGE_OPENAI_TIMEOUT_SEC", "60"))
    max_timeout_sec = int(os.getenv("STORYIMAGE_OPENAI_TIMEOUT_MAX_SEC", "180"))

    for attempt in range(MAX_RETRIES):
        try:
            if reference_requested and reference_image_path and edits_uri:
                with open(reference_image_path, "rb") as ref_file:
                    ref_bytes = ref_file.read()
                fields = [
                    ("prompt", _build_reference_guidance(full_prompt)),
                    ("size", "1024x1024"),
                ]
                if "/deployments/" not in edits_uri:
                    fields.append(("model", model))
                if "mini" not in model.lower():
                    fields.append(("input_fidelity", "high"))
                print(f"[INFO] IMG reference start path={Path(reference_image_path).name}")
                rsp = _post_multipart(
                    edits_uri,
                    fields,
                    [("image[]", Path(reference_image_path).name, ref_bytes, "image/png")],
                    api_key,
                )
            else:
                payload = {
                    "prompt": full_prompt,
                    "size": "1024x1024",
                }
                if "openai.azure.com" not in uri:
                    payload["response_format"] = "b64_json"
                if "/deployments/" not in uri:
                    payload["model"] = model
                rsp = _post_json(uri, payload, api_key)

            saved = _extract_image_response(rsp)
            if saved:
                return saved
            print(f"[IMG] attempt {attempt+1}: empty image data")
        except Exception as e:
            mode = "edits" if reference_requested else "generations"
            print(f"[IMG] attempt {attempt+1} {mode} exception: {e}")

        if attempt < PAGE_MAX_RETRIES - 1:
            time.sleep(RETRY_DELAYS[attempt])

    print(f"[IMG] all {PAGE_MAX_RETRIES} attempts failed for prompt: {full_prompt[:80]}...")
    return None


def generate_images_for_pages(
    pages: list,
    global_style: str,
    visual_canon: Optional[dict[str, Any]] = None,
    page_image_prompt_packages: Optional[list[dict[str, Any]]] = None,
    child_avatar: Optional[dict[str, Any]] = None,
) -> None:
    """为所有页面生成插图（最多 2 个并发），失败页面重试后仍跳过。"""
    if not os.getenv("STORYIMAGE_OPENAI_API_KEY") or not os.getenv("STORYIMAGE_OPENAI_URI") or not os.getenv("STORYIMAGE_OPENAI_MODEL"):
        print("[IMG] STORYIMAGE_OPENAI_* not set, skipping image generation")
        return

    total = len(pages)
    success = 0
    failed = 0
    print(f"[INFO] IMG batch start pages={total}")
    prompt_package_map = {
        _safe_str(pkg.get("page_id")): pkg
        for pkg in (page_image_prompt_packages or [])
        if isinstance(pkg, dict) and _safe_str(pkg.get("page_id"))
    }
    reference_image_path = _resolve_child_avatar_reference_path(child_avatar)
    if reference_image_path:
        print(f"[INFO] IMG avatar reference ready file={Path(reference_image_path).name}")

    def gen_one(page: dict):
        prompt = _resolve_page_prompt(page, visual_canon, prompt_package_map)
        if not prompt:
            print(f"[IMG] missing prompt page_id={page.get('page_id', '?')}")
            return False
        url = generate_page_image(prompt, global_style, reference_image_path=reference_image_path)
        if url:
            page["image_url"] = url
            interaction = page.get("interaction") if isinstance(page.get("interaction"), dict) else {}
            interaction_type = _safe_str(interaction.get("type"))
            if interaction_type in {"tap", "drag", "mimic"}:
                instruction = _safe_str(interaction.get("instruction"))
                full_prompt = f"{global_style}. {prompt}" if global_style else prompt
                delta_url = generate_interaction_delta_image(
                    base_image_url=url,
                    base_prompt=full_prompt,
                    interaction_type=interaction_type,
                    instruction=instruction,
                )
                if delta_url:
                    page["interaction_image_url"] = delta_url
                else:
                    print(
                        f"[IMG] interaction diff missing page_id={page.get('page_id', '?')} type={interaction_type}"
                    )
            return True
        return False

    with ThreadPoolExecutor(max_workers=2) as executor:
        future_to_page = {executor.submit(gen_one, page): page for page in pages}
        for f in as_completed(future_to_page):
            page = future_to_page[f]
            try:
                if f.result():
                    success += 1
                else:
                    failed += 1
                    print(f"[IMG] FAILED page_id={page.get('page_id', '?')}")
            except Exception as e:
                failed += 1
                print(f"[IMG] thread error for page_id={page.get('page_id', '?')}: {e}")

    print(f"[INFO] IMG batch done success={success} failed={failed}")
