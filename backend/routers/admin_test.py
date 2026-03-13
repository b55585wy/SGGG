from fastapi import APIRouter, HTTPException, Header
import os
from typing import Optional

from llm import set_storytext_fake_delay


router = APIRouter(prefix="/api/v1/admin/test", tags=["admin_test"])


def _check_admin(x_admin_key: Optional[str]):
    expected = os.environ.get("ADMIN_API_KEY", "")
    if not expected:
        raise HTTPException(503, detail="admin key not configured")
    if x_admin_key != expected:
        raise HTTPException(403, detail="forbidden")


@router.post("/llm_delay")
def set_llm_delay(seconds: float, x_admin_key: Optional[str] = Header(None)):
    _check_admin(x_admin_key)
    set_storytext_fake_delay(seconds)
    return {"ok": True, "seconds": seconds}

