import os
from typing import Optional
from fastapi import APIRouter, HTTPException, Header
from database import get_backend_stats, get_telemetry_stats, delete_user_data

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def _check_admin_key(x_admin_key: Optional[str]):
    expected = os.environ.get("ADMIN_API_KEY", "")
    if not expected:
        raise HTTPException(503, detail="admin key not configured")
    if x_admin_key != expected:
        raise HTTPException(403, detail="forbidden")


@router.get("/stats")
def admin_stats(x_admin_key: Optional[str] = Header(None)):
    _check_admin_key(x_admin_key)
    stats = get_backend_stats()
    stats["telemetry"] = get_telemetry_stats()
    return stats


@router.delete("/users/{child_id}")
def admin_delete_user(child_id: str, x_admin_key: Optional[str] = Header(None)):
    _check_admin_key(x_admin_key)
    counts = delete_user_data(child_id)
    return {"ok": True, "deleted": counts}
