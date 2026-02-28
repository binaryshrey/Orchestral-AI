from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import PitchSession
from app.schemas.pitch_sessions import PitchSessionCreate, PitchSessionUpdate, PitchSessionOut

router = APIRouter(prefix="/pitch-sessions", tags=["pitch-sessions"])

# Additional router exposing a singular, user-friendly path for fetching a pitch
pitch_router = APIRouter(prefix="/pitch", tags=["pitch"]) 

def _to_out(row: PitchSession) -> PitchSessionOut:
    return PitchSessionOut(
        id=str(row.id),

        user_id=row.user_id,
        user_name=row.user_name,
        user_email=row.user_email,

        startup_name=row.startup_name,
        website_link=row.website_link,
        github_link=row.github_link,
        content=row.content,

        duration_seconds=row.duration_seconds,
        language=row.language,
        region=row.region,

        gcp_bucket=row.gcp_bucket,
        gcp_object_path=row.gcp_object_path,
        gcp_file_url=row.gcp_file_url,

        feedback=row.feedback,
        review_required=row.review_required,
        score=row.score,
        status=row.status,  # type: ignore

        created_at=row.created_at,
        updated_at=row.updated_at,
    )

@router.post("", response_model=PitchSessionOut)
def create_pitch_session(payload: PitchSessionCreate, db: Session = Depends(get_db)):
    try:
        row = PitchSession(
            user_id=payload.user_id,
            user_name=payload.user_name,
            user_email=str(payload.user_email),

            startup_name=payload.startup_name,
            website_link=payload.website_link,
            github_link=payload.github_link,
            content=payload.content,

            duration_seconds=payload.duration_seconds,
            language=payload.language,
            region=payload.region,

            gcp_bucket=payload.gcp_bucket,
            gcp_object_path=payload.gcp_object_path,
            gcp_file_url=payload.gcp_file_url,

            feedback=payload.feedback,
            review_required=payload.review_required,
            score=payload.score,
            status=payload.status,

            updated_at=datetime.utcnow(),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return _to_out(row)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"DB insert failed: {e}")

@router.get("", response_model=List[PitchSessionOut])
def list_pitch_sessions(
    user_id: str = Query(...),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(PitchSession)
        .filter(PitchSession.user_id == user_id)
        .order_by(PitchSession.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_to_out(r) for r in rows]

@router.patch("/{pitch_session_id}", response_model=PitchSessionOut)
def update_pitch_session(
    pitch_session_id: str,
    payload: PitchSessionUpdate,
    db: Session = Depends(get_db),
):
    row = db.query(PitchSession).filter(PitchSession.id == pitch_session_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Pitch session not found")

    data = payload.model_dump(exclude_unset=True)

    # if "score" in data and data["score"] is not None:
    #     data["score"] = round(float(data["score"]), 1)

    for k, v in data.items():
        setattr(row, k, v)

    row.updated_at = datetime.utcnow()

    try:
        db.add(row)
        db.commit()
        db.refresh(row)
        return _to_out(row)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"DB update failed: {e}")


@pitch_router.get("/{pitch_session_id}", response_model=PitchSessionOut)
def get_pitch_session(
    pitch_session_id: str,
    db: Session = Depends(get_db),
):
    """Fetch a single pitch session by its id.

    Returns 404 if not found.
    """
    row = db.query(PitchSession).filter(PitchSession.id == pitch_session_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Pitch session not found")

    return _to_out(row)
