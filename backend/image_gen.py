import base64
import json
import os
import time
import uuid as _uuid
import urllib.request
import urllib.error
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8000")
_IMAGES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "images")

MAX_RETRIES = 3
RETRY_DELAYS = [2, 5, 10]  # seconds between retries


def _save_locally_bytes(raw: bytes, ext: str = ".png", child_id: Optional[str] = None) -> Optional[str]:
    """保存图片字节到本地，返回永久本地 URL。失败返回 None。"""
    try:
        os.makedirs(_IMAGES_DIR, exist_ok=True)
        safe_id = child_id.replace(os.sep, "_").replace("/", "_") if child_id else ""
        prefix = f"{safe_id}_" if safe_id else ""
        img_name = prefix + _uuid.uuid4().hex + ext
        path = os.path.join(_IMAGES_DIR, img_name)
        with open(path, "wb") as f:
            f.write(raw)
        return f"{BACKEND_BASE_URL}/static/images/{img_name}"
    except Exception as e:
        print(f"[IMG] 本地保存失败: {e}")
        return None


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
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        raise RuntimeError(f"image request failed ({e.code}): {body}")
    print("[INFO] IMG request done")
    return json.loads(body) if body else {}


def generate_page_image(prompt: str, global_style: str = "", child_id: Optional[str] = None) -> Optional[str]:
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

    for attempt in range(MAX_RETRIES):
        try:
            payload = {
                "prompt": full_prompt,
                "size": "1024x1024",
            }
            if "openai.azure.com" not in uri:
                payload["response_format"] = "b64_json"
            if "/deployments/" not in uri:
                payload["model"] = model
            rsp = _post_json(uri, payload, api_key)
            data = rsp.get("data", [])
            if data:
                b64 = data[0].get("b64_json")
                if b64:
                    raw = base64.b64decode(b64)
                    saved = _save_locally_bytes(raw, ".png", child_id)
                    if saved:
                        return saved
                url = data[0].get("url")
                if url:
                    try:
                        with urllib.request.urlopen(url, timeout=60) as resp:
                            raw = resp.read()
                        saved = _save_locally_bytes(raw, ".png", child_id)
                        if saved:
                            return saved
                    except Exception:
                        pass
            print(f"[IMG] attempt {attempt+1}: empty image data")
        except Exception as e:
            print(f"[IMG] attempt {attempt+1} exception: {e}")

        if attempt < MAX_RETRIES - 1:
            time.sleep(RETRY_DELAYS[attempt])

    print(f"[IMG] all {MAX_RETRIES} attempts failed for prompt: {full_prompt[:80]}...")
    return None


def generate_cover_image(title: str, theme_food: str, global_style: str = "", child_id: Optional[str] = None) -> Optional[str]:
    """生成绘本封面图，带重试。返回本地永久 URL，失败返回 None。"""
    uri = os.getenv("STORYIMAGE_OPENAI_URI")
    api_key = os.getenv("STORYIMAGE_OPENAI_API_KEY")
    model = os.getenv("STORYIMAGE_OPENAI_MODEL")
    if not uri or not api_key or not model:
        return None

    prompt = (
        f"Children's picture book cover illustration, featuring {theme_food}, "
        f"colorful and whimsical, no text, no letters, no words. "
        f"{global_style}" if global_style else
        f"Children's picture book cover illustration, featuring {theme_food}, "
        f"colorful and whimsical, no text, no letters, no words."
    )

    for attempt in range(MAX_RETRIES):
        try:
            payload = {"prompt": prompt, "size": "1024x1024"}
            if "openai.azure.com" not in uri:
                payload["response_format"] = "b64_json"
            if "/deployments/" not in uri:
                payload["model"] = model
            rsp = _post_json(uri, payload, api_key)
            data = rsp.get("data", [])
            if data:
                b64 = data[0].get("b64_json")
                if b64:
                    saved = _save_locally_bytes(base64.b64decode(b64), ".png", child_id)
                    if saved:
                        return saved
                url = data[0].get("url")
                if url:
                    try:
                        with urllib.request.urlopen(url, timeout=60) as resp:
                            saved = _save_locally_bytes(resp.read(), ".png", child_id)
                            if saved:
                                return saved
                    except Exception:
                        pass
            print(f"[COVER] attempt {attempt+1}: empty image data")
        except Exception as e:
            print(f"[COVER] attempt {attempt+1} exception: {e}")

        if attempt < MAX_RETRIES - 1:
            time.sleep(RETRY_DELAYS[attempt])

    print(f"[COVER] all {MAX_RETRIES} attempts failed for title: {title}")
    return None


def generate_images_for_pages(pages: list, global_style: str, child_id: Optional[str] = None) -> None:
    """为所有页面生成插图（最多 2 个并发），失败页面重试后仍跳过。"""
    if not os.getenv("STORYIMAGE_OPENAI_API_KEY") or not os.getenv("STORYIMAGE_OPENAI_URI") or not os.getenv("STORYIMAGE_OPENAI_MODEL"):
        print("[IMG] STORYIMAGE_OPENAI_* not set, skipping image generation")
        return

    total = len(pages)
    success = 0
    failed = 0
    print(f"[INFO] IMG batch start pages={total}")

    def gen_one(page: dict):
        url = generate_page_image(page.get("image_prompt", ""), global_style, child_id)
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

    print(f"[INFO] IMG batch done success={success} failed={failed}")
