import sqlite3
from contextlib import contextmanager

DB_PATH = "storybook.db"


def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS stories (
                story_id        TEXT PRIMARY KEY,
                parent_story_id TEXT,
                child_id        TEXT,
                regen_count     INTEGER NOT NULL DEFAULT 0,
                story_json      TEXT NOT NULL,
                created_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS sessions (
                session_id           TEXT PRIMARY KEY,
                story_id             TEXT NOT NULL,
                child_id             TEXT,
                session_index        INTEGER NOT NULL DEFAULT 0,
                client_session_token TEXT NOT NULL,
                status               TEXT NOT NULL DEFAULT 'READING',
                created_at           TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(story_id, client_session_token)
            );

            CREATE TABLE IF NOT EXISTS telemetry_events (
                event_id      TEXT PRIMARY KEY,
                session_id    TEXT NOT NULL,
                story_id      TEXT,
                page_id       TEXT,
                event_type    TEXT NOT NULL,
                payload       TEXT,
                ts_client_ms  INTEGER,
                created_at    TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS feedback (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id   TEXT UNIQUE NOT NULL,
                status       TEXT NOT NULL,
                try_level    TEXT,
                abort_reason TEXT,
                notes        TEXT,
                created_at   TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS sus_responses (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                answers    TEXT NOT NULL,
                sus_score  REAL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        """)
        # 迁移旧数据库（列已存在则忽略）
        for sql in [
            "ALTER TABLE stories ADD COLUMN child_id TEXT",
            "ALTER TABLE sessions ADD COLUMN child_id TEXT",
            "ALTER TABLE sessions ADD COLUMN session_index INTEGER NOT NULL DEFAULT 0",
        ]:
            try:
                conn.execute(sql)
            except Exception:
                pass


def get_backend_stats() -> dict:
    """Aggregate stats from sessions, feedback, sus_responses for admin dashboard."""
    with get_db() as conn:
        row = conn.execute("""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'ABORTED' THEN 1 ELSE 0 END) as aborted
            FROM sessions
        """).fetchone()
        total = row["total"] or 0
        sessions = {
            "total": total,
            "completed": row["completed"] or 0,
            "aborted": row["aborted"] or 0,
            "completedRate": round((row["completed"] or 0) / total * 100, 1) if total > 0 else 0,
            "abortedRate": round((row["aborted"] or 0) / total * 100, 1) if total > 0 else 0,
        }

        try_levels = conn.execute("""
            SELECT try_level, COUNT(*) as cnt
            FROM feedback WHERE try_level IS NOT NULL
            GROUP BY try_level
        """).fetchall()
        try_level_dist = {r["try_level"]: r["cnt"] for r in try_levels}

        abort_reasons = conn.execute("""
            SELECT abort_reason, COUNT(*) as cnt
            FROM feedback WHERE abort_reason IS NOT NULL
            GROUP BY abort_reason
        """).fetchall()
        abort_reason_dist = {r["abort_reason"]: r["cnt"] for r in abort_reasons}

        sus_row = conn.execute("""
            SELECT COUNT(*) as cnt, AVG(sus_score) as avg_score
            FROM sus_responses
        """).fetchone()
        sus_dist = conn.execute("""
            SELECT
                SUM(CASE WHEN sus_score < 50 THEN 1 ELSE 0 END) as low,
                SUM(CASE WHEN sus_score >= 50 AND sus_score < 70 THEN 1 ELSE 0 END) as mid,
                SUM(CASE WHEN sus_score >= 70 THEN 1 ELSE 0 END) as high
            FROM sus_responses
        """).fetchone()
        sus = {
            "responseCount": sus_row["cnt"] or 0,
            "avgScore": round(sus_row["avg_score"], 1) if sus_row["avg_score"] is not None else None,
            "distribution": {
                "low": sus_dist["low"] or 0,
                "mid": sus_dist["mid"] or 0,
                "high": sus_dist["high"] or 0,
            },
        }

        feedback_count = conn.execute("SELECT COUNT(DISTINCT session_id) as cnt FROM feedback").fetchone()["cnt"] or 0
        sus_count = sus_row["cnt"] or 0
        completeness = {
            "sessionsWithFeedback": feedback_count,
            "sessionsWithFeedbackPct": round(feedback_count / total * 100, 1) if total > 0 else 0,
            "sessionsWithSUS": sus_count,
            "sessionsWithSUSPct": round(sus_count / total * 100, 1) if total > 0 else 0,
        }

        return {
            "sessions": sessions,
            "feedback": {"tryLevelDist": try_level_dist, "abortReasonDist": abort_reason_dist},
            "sus": sus,
            "completeness": completeness,
        }


def get_telemetry_stats() -> dict:
    """Aggregate telemetry event stats for admin dashboard."""
    with get_db() as conn:
        row = conn.execute("""
            SELECT
                COUNT(*) as total_events,
                COUNT(DISTINCT session_id) as unique_sessions,
                AVG(ts_client_ms) as avg_dwell_ms
            FROM telemetry_events
        """).fetchone()

        type_dist = conn.execute("""
            SELECT event_type, COUNT(*) as cnt
            FROM telemetry_events
            GROUP BY event_type
        """).fetchall()

        return {
            "totalEvents": row["total_events"] or 0,
            "uniqueSessions": row["unique_sessions"] or 0,
            "avgDwellMs": round(row["avg_dwell_ms"] or 0, 1),
            "byType": {r["event_type"]: r["cnt"] for r in type_dist},
        }


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
