import os
from fastapi import APIRouter, HTTPException, Header
from database import get_backend_stats

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def _check_admin_key(x_admin_key: str | None):
    expected = os.environ.get("ADMIN_API_KEY", "")
    if not expected:
        raise HTTPException(503, detail="admin key not configured")
    if x_admin_key != expected:
        raise HTTPException(403, detail="forbidden")


@router.get("/stats")
def admin_stats(x_admin_key: str | None = Header(None)):
    _check_admin_key(x_admin_key)
    return get_backend_stats()
