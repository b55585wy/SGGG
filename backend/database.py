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
