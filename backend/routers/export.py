import json
import csv
import io
import os
from typing import Optional
from fastapi import APIRouter, HTTPException, Header, Query
from fastapi.responses import StreamingResponse
from database import get_db

router = APIRouter(prefix="/api/v1/export", tags=["export"])


def _check_admin(x_admin_key: Optional[str] = None, key: Optional[str] = None):
    expected = os.environ.get("ADMIN_API_KEY", "")
    if not expected:
        raise HTTPException(503, detail="admin key not configured")
    if (x_admin_key or key or "") != expected:
        raise HTTPException(403, detail="forbidden")


def _rows_to_csv(rows, filename: str) -> StreamingResponse:
    output = io.StringIO()
    writer = csv.writer(output)
    if rows:
        writer.writerow(rows[0].keys())
        for r in rows:
            writer.writerow(r)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/child/{child_id}")
def export_child_data(child_id: str):
    """导出某个孩子所有 session 数据为 CSV，供学术分析使用。"""
    with get_db() as db:
        rows = db.execute("""
            SELECT
                s.session_index,
                s.session_id,
                s.story_id,
                s.child_id,
                s.created_at  AS session_start,
                st.story_json,
                f.status      AS feedback_status,
                f.try_level,
                f.abort_reason,
                f.notes       AS feedback_notes,
                sus.answers   AS sus_answers,
                sus.sus_score
            FROM sessions s
            LEFT JOIN stories st  ON s.story_id   = st.story_id
            LEFT JOIN feedback f  ON s.session_id = f.session_id
            LEFT JOIN sus_responses sus ON s.session_id = sus.session_id
            WHERE s.child_id = ?
            ORDER BY s.session_index
        """, (child_id,)).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'session_index', 'session_id', 'session_start',
        'story_id', 'story_title', 'target_food', 'story_type', 'page_count',
        'feedback_status', 'try_level', 'abort_reason', 'feedback_notes',
        'sus_score', 'sus_answers',
    ])

    for row in rows:
        story_meta: dict = {}
        if row['story_json']:
            try:
                story = json.loads(row['story_json'])
                meta = story.get('book_meta', {})
                story_meta = {
                    'title': meta.get('title', ''),
                    'food': meta.get('theme_food', ''),
                    'type': meta.get('story_type', ''),
                    'pages': len(story.get('pages', [])),
                }
            except Exception:
                pass

        writer.writerow([
            row['session_index'], row['session_id'], row['session_start'],
            row['story_id'], story_meta.get('title', ''), story_meta.get('food', ''),
            story_meta.get('type', ''), story_meta.get('pages', ''),
            row['feedback_status'], row['try_level'], row['abort_reason'], row['feedback_notes'],
            row['sus_score'], row['sus_answers'],
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type='text/csv',
        headers={'Content-Disposition': f'attachment; filename="child_{child_id}.csv"'},
    )


# ─── Admin CSV Exports ─────────────────────────────────────

@router.get("/admin/sessions.csv")
def export_admin_sessions(
    x_admin_key: Optional[str] = Header(None),
    key: Optional[str] = Query(None),
):
    _check_admin(x_admin_key, key)
    with get_db() as db:
        rows = db.execute("""
            SELECT session_id, story_id, child_id, session_index,
                   client_session_token, status, created_at
            FROM sessions ORDER BY created_at DESC
        """).fetchall()
    return _rows_to_csv(rows, "sessions.csv")


@router.get("/admin/telemetry.csv")
def export_admin_telemetry(
    x_admin_key: Optional[str] = Header(None),
    key: Optional[str] = Query(None),
):
    _check_admin(x_admin_key, key)
    with get_db() as db:
        rows = db.execute("""
            SELECT event_id, session_id, story_id, page_id,
                   event_type, payload, ts_client_ms, created_at
            FROM telemetry_events ORDER BY created_at DESC
        """).fetchall()
    return _rows_to_csv(rows, "telemetry.csv")


@router.get("/admin/feedback.csv")
def export_admin_feedback(
    x_admin_key: Optional[str] = Header(None),
    key: Optional[str] = Query(None),
):
    _check_admin(x_admin_key, key)
    with get_db() as db:
        rows = db.execute("""
            SELECT id, session_id, status, try_level, abort_reason, notes, created_at
            FROM feedback ORDER BY created_at DESC
        """).fetchall()
    return _rows_to_csv(rows, "feedback.csv")


@router.get("/admin/sus.csv")
def export_admin_sus(
    x_admin_key: Optional[str] = Header(None),
    key: Optional[str] = Query(None),
):
    _check_admin(x_admin_key, key)
    with get_db() as db:
        rows = db.execute("""
            SELECT id, session_id, answers, sus_score, created_at
            FROM sus_responses ORDER BY created_at DESC
        """).fetchall()
    return _rows_to_csv(rows, "sus.csv")


@router.get("/admin/stories.csv")
def export_admin_stories(
    x_admin_key: Optional[str] = Header(None),
    key: Optional[str] = Query(None),
):
    _check_admin(x_admin_key, key)
    with get_db() as db:
        raw = db.execute("""
            SELECT story_id, parent_story_id, child_id, regen_count, story_json, created_at
            FROM stories ORDER BY created_at DESC
        """).fetchall()
    # Extract book_meta fields, omit full story_json
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "story_id", "parent_story_id", "child_id", "regen_count",
        "title", "summary", "theme_food", "story_type", "page_count", "created_at",
    ])
    for r in raw:
        meta: dict = {}
        if r["story_json"]:
            try:
                story = json.loads(r["story_json"])
                bm = story.get("book_meta", {})
                meta = {
                    "title": bm.get("title", ""),
                    "summary": bm.get("summary", ""),
                    "theme_food": bm.get("theme_food", ""),
                    "story_type": bm.get("story_type", ""),
                    "page_count": len(story.get("pages", [])),
                }
            except Exception:
                pass
        writer.writerow([
            r["story_id"], r["parent_story_id"], r["child_id"], r["regen_count"],
            meta.get("title", ""), meta.get("summary", ""), meta.get("theme_food", ""),
            meta.get("story_type", ""), meta.get("page_count", ""), r["created_at"],
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="stories.csv"'},
    )
