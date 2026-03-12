import base64
import json
import os
import time
import uuid as _uuid
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8000")
_IMAGES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "images")

MAX_RETRIES = 3
RETRY_DELAYS = [2, 5, 10]  # seconds between retries


def _save_locally(image_url: str) -> str:
    """下载远程图片保存到本地，返回永久本地 URL。失败则返回原始 URL。"""
    try:
        import requests as _req
        os.makedirs(_IMAGES_DIR, exist_ok=True)
        img_name = _uuid.uuid4().hex + ".jpg"
        path = os.path.join(_IMAGES_DIR, img_name)
        with _req.get(image_url, timeout=60) as r:
            r.raise_for_status()
            with open(path, "wb") as f:
                f.write(r.content)
        return f"{BACKEND_BASE_URL}/static/images/{img_name}"
    except Exception as e:
        print(f"[IMG] 本地保存失败，使用原始 URL: {e}")
        return image_url


def _save_b64_locally(b64_data: str) -> str:
    """保存 base64 图片到本地，返回永久本地 URL。"""
    try:
        os.makedirs(_IMAGES_DIR, exist_ok=True)
        img_name = _uuid.uuid4().hex + ".png"
        path = os.path.join(_IMAGES_DIR, img_name)
        with open(path, "wb") as f:
            f.write(base64.b64decode(b64_data))
        return f"{BACKEND_BASE_URL}/static/images/{img_name}"
    except Exception as e:
        print(f"[IMG] base64 保存失败: {e}")
        return ""


# ─── OpenAI-compatible image API ─────────────────────────────────────────────

def _get_openai_config():
    """返回 (uri, api_key, model) 或 None（未配置时）。"""
    api_key = os.getenv("IMAGE_API_KEY")
    if not api_key:
        return None
    base_url = os.getenv("IMAGE_API_BASE_URL", "https://api.openai.com")
    uri = f"{base_url.rstrip('/')}/v1/images/generations"
    model = os.getenv("IMAGE_MODEL", "dall-e-3")
    return uri, api_key, model


def _call_openai_image(prompt: str, size: str, uri: str, api_key: str, model: str) -> str | None:
    """调用 OpenAI 兼容图片生成接口，返回本地 URL 或 None。"""
    payload = {"model": model, "prompt": prompt, "n": 1, "size": size}
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(uri, data=data, headers=headers, method="POST")

    with urllib.request.urlopen(req, timeout=180) as resp:
        body = json.loads(resp.read().decode("utf-8"))

    items = body.get("data", [])
    if not items:
        return None
    item = items[0]
    if item.get("url"):
        return _save_locally(item["url"])
    if item.get("b64_json"):
        return _save_b64_locally(item["b64_json"])
    return None


# ─── DashScope fallback ──────────────────────────────────────────────────────

def _call_dashscope_image(prompt: str, size: str) -> str | None:
    """DashScope 后备方案（仅在 IMAGE_API_KEY 未设置时使用）。"""
    from http import HTTPStatus
    from dashscope import ImageSynthesis

    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        return None
    rsp = ImageSynthesis.call(
        api_key=api_key, model="wanx2.1-t2i-turbo", prompt=prompt, n=1, size=size,
    )
    if rsp.status_code == HTTPStatus.OK:
        results = rsp.output.get("results", [])
        if results and results[0].get("url"):
            return _save_locally(results[0]["url"])
    return None


# ─── Public API (签名不变) ───────────────────────────────────────────────────

def generate_page_image(prompt: str, global_style: str = "") -> str | None:
    """生成单页插图，带重试。返回本地永久 URL，失败返回 None。"""
    full_prompt = f"{global_style}. {prompt}" if global_style else prompt
    config = _get_openai_config()
    page_size = os.getenv("IMAGE_PAGE_SIZE", "1792x1024")

    for attempt in range(MAX_RETRIES):
        try:
            if config:
                url = _call_openai_image(full_prompt, page_size, *config)
            else:
                url = _call_dashscope_image(full_prompt, "1024*576")
            if url:
                return url
            print(f"[IMG] attempt {attempt+1}: empty result")
        except urllib.error.HTTPError as e:
            code = e.code
            msg = e.read().decode("utf-8", errors="replace")[:200]
            print(f"[IMG] attempt {attempt+1}: HTTP {code} {msg}")
            if code < 500:
                return None
        except Exception as e:
            print(f"[IMG] attempt {attempt+1} exception: {e}")

        if attempt < MAX_RETRIES - 1:
            time.sleep(RETRY_DELAYS[attempt])

    print(f"[IMG] all {MAX_RETRIES} attempts failed for prompt: {full_prompt[:80]}...")
    return None


def generate_cover_image(title: str, theme_food: str, global_style: str = "") -> str | None:
    """生成绘本封面图（竖版），带重试。返回本地永久 URL，失败返回 None。"""
    prompt = (
        f"Children's picture book cover illustration, featuring {theme_food}, "
        f"colorful and whimsical, no text, no letters, no words. "
        f"{global_style}" if global_style else
        f"Children's picture book cover illustration, featuring {theme_food}, "
        f"colorful and whimsical, no text, no letters, no words."
    )
    config = _get_openai_config()
    cover_size = os.getenv("IMAGE_COVER_SIZE", "1024x1792")

    for attempt in range(MAX_RETRIES):
        try:
            if config:
                url = _call_openai_image(prompt, cover_size, *config)
            else:
                url = _call_dashscope_image(prompt, "576*1024")
            if url:
                return url
            print(f"[COVER] attempt {attempt+1}: empty result")
        except urllib.error.HTTPError as e:
            code = e.code
            msg = e.read().decode("utf-8", errors="replace")[:200]
            print(f"[COVER] attempt {attempt+1}: HTTP {code} {msg}")
            if code < 500:
                return None
        except Exception as e:
            print(f"[COVER] attempt {attempt+1} exception: {e}")

        if attempt < MAX_RETRIES - 1:
            time.sleep(RETRY_DELAYS[attempt])

    print(f"[COVER] all {MAX_RETRIES} attempts failed for title: {title}")
    return None


def generate_images_for_pages(pages: list, global_style: str) -> None:
    """为所有页面生成插图（最多 2 个并发），失败页面重试后仍跳过。"""
    config = _get_openai_config()
    has_dashscope = bool(os.getenv("DASHSCOPE_API_KEY"))
    if not config and not has_dashscope:
        print("[IMG] No image API configured, skipping image generation")
        return

    total = len(pages)
    success = 0
    failed = 0

    def gen_one(page: dict):
        url = generate_page_image(page.get("image_prompt", ""), global_style)
        if url:
            page["image_url"] = url
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

    print(f"[IMG] done: {success}/{total} succeeded, {failed} failed")
