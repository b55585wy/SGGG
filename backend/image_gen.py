import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from http import HTTPStatus
import dashscope
from dashscope import ImageSynthesis


def generate_page_image(prompt: str, global_style: str = "") -> str | None:
    """生成单页插图，返回图片 URL，失败返回 None（不影响故事生成）。"""
    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        return None

    full_prompt = f"{global_style}. {prompt}" if global_style else prompt

    try:
        rsp = ImageSynthesis.call(
            api_key=api_key,
            model="wanx2.1-t2i-turbo",   # 速度快、价格低
            prompt=full_prompt,
            n=1,
            size="1024*576",              # 横版 16:9，适合绘本阅读界面
        )
        if rsp.status_code == HTTPStatus.OK:
            results = rsp.output.get("results", [])
            if results:
                return results[0].get("url")
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
