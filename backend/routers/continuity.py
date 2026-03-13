import json
import os
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import parse_qs, urlparse
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/continuity", tags=["continuity"])


class StoryArcGenerateRequest(BaseModel):
    user_profile: dict[str, Any]


class StorySummarizeRequest(BaseModel):
    previous_blocks: list[Any]
    story_framework: Optional[dict[str, Any]] = None


def _parse_last_json_line(stdout: str) -> Any:
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    for line in reversed(lines):
        try:
            return json.loads(line)
        except Exception:
            continue
    raise ValueError("No valid JSON found in module stdout")


def _run_python_code(cwd: str, code: str) -> Any:
    env = os.environ.copy()
    # Compatibility bridge: allow continuity modules to run with existing STORYTEXT_* config.
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

    proc = subprocess.run(
        [os.getenv("PYTHON_EXECUTABLE") or sys.executable, "-c", code],
        cwd=cwd,
        capture_output=True,
        text=True,
        env=env,
        timeout=int(os.getenv("CONTINUITY_MODULE_TIMEOUT_SEC", "180")),
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "module execution failed")
    return _parse_last_json_line(proc.stdout)


@router.post("/story_arc/generate")
def continuity_generate_story_arc(req: StoryArcGenerateRequest):
    module_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    required = [
        "story_arc_module.py",
        "basic_constraints.json",
        "design_consideration.json",
        "story_bible_template_optional_library.json",
    ]
    try:
        uid = str(req.user_profile.get("user_id") or req.user_profile.get("userID") or req.user_profile.get("nickname") or "unknown")
        print(f"INFO: continuity.story_arc:start user={uid}")
        with tempfile.TemporaryDirectory(prefix="sggg_story_arc_") as tmpdir:
            for name in required:
                src = os.path.join(module_dir, name)
                if not os.path.exists(src):
                    raise RuntimeError(f"missing required file: {name}")
                shutil.copy(src, os.path.join(tmpdir, name))
            with open(os.path.join(tmpdir, "user_profile.json"), "w", encoding="utf-8") as f:
                json.dump(req.user_profile, f, ensure_ascii=False, indent=2)
            code = "import runpy,json; ns=runpy.run_path('story_arc_module.py'); print(json.dumps(ns['story_arc_framework'], ensure_ascii=False))"
            story_arc = _run_python_code(tmpdir, code)
            print(f"INFO: continuity.story_arc:done user={uid}")
            return {"story_arc": story_arc}
    except Exception as e:
        print(f"INFO: continuity.story_arc:error message={str(e)}")
        raise HTTPException(500, detail={"error": {"code": "CONTINUITY_STORY_ARC_ERROR", "message": str(e)}})


@router.post("/summarize")
def continuity_summarize(req: StorySummarizeRequest):
    module_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    module_path = os.path.join(module_dir, "summarizer_module.py")
    if not os.path.exists(module_path):
        raise HTTPException(500, detail={"error": {"code": "CONTINUITY_SUMMARY_ERROR", "message": "missing summarizer_module.py"}})
    try:
        print(f"INFO: continuity.summarize:start blocks={len(req.previous_blocks)}")
        with tempfile.TemporaryDirectory(prefix="sggg_summary_") as tmpdir:
            shutil.copy(module_path, os.path.join(tmpdir, "summarizer_module.py"))
            payload = {
                "previous_blocks": req.previous_blocks,
                "story_framework": req.story_framework,
            }
            with open(os.path.join(tmpdir, "input.json"), "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            code = (
                "import json,runpy; "
                "ns=runpy.run_path('summarizer_module.py'); "
                "payload=json.load(open('input.json','r',encoding='utf-8')); "
                "out=ns['summarize_previous_episodes'](payload.get('previous_blocks', []), payload.get('story_framework')); "
                "print(json.dumps(out, ensure_ascii=False))"
            )
            summary = _run_python_code(tmpdir, code)
            print("INFO: continuity.summarize:done")
            return {"summary": summary}
    except Exception as e:
        print(f"INFO: continuity.summarize:error message={str(e)}")
        raise HTTPException(500, detail={"error": {"code": "CONTINUITY_SUMMARY_ERROR", "message": str(e)}})
