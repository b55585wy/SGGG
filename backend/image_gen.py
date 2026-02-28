import os
import uuid as _uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from http import HTTPStatus
from dashscope import ImageSynthesis

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8000")
_IMAGES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "images")


def _save_locally(dash_url: str) -> str:
    """下载 DashScope 临时图片保存到本地，返回永久本地 URL。失败则返回原始 URL。"""
    try:
        import requests as _req
        os.makedirs(_IMAGES_DIR, exist_ok=True)
        img_name = _uuid.uuid4().hex + ".jpg"
        path = os.path.join(_IMAGES_DIR, img_name)
        with _req.get(dash_url, timeout=30) as r:
            r.raise_for_status()
            with open(path, "wb") as f:
                f.write(r.content)
        return f"{BACKEND_BASE_URL}/static/images/{img_name}"
    except Exception as e:
        print(f"[IMG] 本地保存失败，使用原始 URL: {e}")
        return dash_url  # fallback：直接用临时 URL


def generate_page_image(prompt: str, global_style: str = "") -> str | None:
    """生成单页插图，返回本地永久 URL（或 DashScope 原始 URL），失败返回 None。"""
    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        return None

    full_prompt = f"{global_style}. {prompt}" if global_style else prompt

    try:
        rsp = ImageSynthesis.call(
            api_key=api_key,
            model="wanx2.1-t2i-turbo",
            prompt=full_prompt,
            n=1,
            size="1024*576",              # 横版 16:9
        )
        if rsp.status_code == HTTPStatus.OK:
            results = rsp.output.get("results", [])
            if results:
                dash_url = results[0].get("url")
                if dash_url:
                    return _save_locally(dash_url)
    except Exception as e:
        print(f"[IMG] page image error: {e}")

    return None


def generate_images_for_pages(pages: list, global_style: str) -> None:
    """并行为所有页面生成插图（最多 4 个并发），失败页面跳过。"""
    if not os.getenv("DASHSCOPE_API_KEY"):
        print("[IMG] DASHSCOPE_API_KEY not set, skipping image generation")
        return

    def gen_one(page: dict):
        url = generate_page_image(page.get("image_prompt", ""), global_style)
        if url:
            page["image_url"] = url

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(gen_one, page) for page in pages]
        for f in as_completed(futures):
            try:
                f.result()
            except Exception as e:
                print(f"[IMG] thread error: {e}")
