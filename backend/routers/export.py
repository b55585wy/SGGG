import json
import csv
import io
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from database import get_db

router = APIRouter(prefix="/api/v1/export", tags=["export"])


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
