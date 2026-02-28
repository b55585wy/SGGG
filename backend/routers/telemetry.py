import json
from fastapi import APIRouter
from models import TelemetryReportRequest, TelemetryReportResponse
from database import get_db

router = APIRouter(prefix="/api/v1/telemetry", tags=["telemetry"])


@router.post("/report", response_model=TelemetryReportResponse)
def telemetry_report(req: TelemetryReportRequest):
    accepted = deduped = 0

    with get_db() as db:
        for event in req.events:
            # De-duplicate by event_id
            existing = db.execute(
                "SELECT 1 FROM telemetry_events WHERE event_id = ?", (event.event_id,)
            ).fetchone()

            if existing:
                deduped += 1
                continue

            db.execute(
                """INSERT INTO telemetry_events
                   (event_id, session_id, story_id, page_id, event_type, payload, ts_client_ms)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    event.event_id,
                    event.session_id,
                    event.story_id,
                    event.page_id,
                    event.event_type,
                    json.dumps(event.payload) if event.payload else None,
                    event.ts_client_ms,
                ),
            )
            accepted += 1

    return TelemetryReportResponse(accepted=accepted, deduped=deduped, rejected=0)
