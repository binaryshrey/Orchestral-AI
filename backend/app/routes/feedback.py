from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime

from ..deps import get_supabase, get_embedding_model
from ..services.rag_service import retrieve_contexts
from ..services.feedback_service import generate_feedback

from app.db.session import get_db
from app.db.models import PitchSession

router = APIRouter(prefix="/pitch", tags=["pitch"])


class FeedbackReq(BaseModel):
    pitch_text: str = Field(..., min_length=20)
    top_k: int = Field(6, ge=1, le=20)
    # optional: include live Q&A transcript later
    qa_transcript: Optional[List[Dict[str, Any]]] = None
    # optional: id of the pitch session created earlier so we can update
    # the exact DB row instead of attempting to match by content
    pitch_id: Optional[str] = None


@router.post("/feedback")
def pitch_feedback(req: FeedbackReq, db: Session = Depends(get_db)):
    # retrieve relevant context snippets
    rag = retrieve_contexts(
        supabase=get_supabase(),
        embedding_model=get_embedding_model(),
        query=req.pitch_text,
        top_k=req.top_k,
        filter_video_id=None,
    )

    # generate structured feedback JSON from model
    fb = generate_feedback(pitch_text=req.pitch_text, contexts=rag["contexts"], qa_transcript=req.qa_transcript)

    # Attempt to find a matching PitchSession to persist feedback and scores.
    # Prefer an explicit pitch_id if provided by the frontend. Fallback to
    # previous behaviour of matching by exact content equality (most recent).
    row = None
    try:
        if req.pitch_id:
            row = db.query(PitchSession).filter(PitchSession.id == req.pitch_id).first()
        else:
            row = (
                db.query(PitchSession)
                .filter(PitchSession.content == req.pitch_text)
                .order_by(PitchSession.created_at.desc())
                .first()
            )
    except Exception:
        row = None

    if row:
        try:
            # Prepare score dict: overall_score + scores
            score_val = {
                "overall_score": fb.get("overall_score"),
                "scores": fb.get("scores"),
            }

            # Prepare feedback dict with the requested keys
            feedback_val = {
                "top_strengths": fb.get("top_strengths"),
                "top_risks": fb.get("top_risks"),
                "missing_info": fb.get("missing_info"),
                "suggested_improvements": fb.get("suggested_improvements"),
                "rewritten_pitch": fb.get("rewritten_pitch"),
                "follow_up_questions": fb.get("follow_up_questions"),
                "tts_summary": fb.get("tts_summary"),
                "citations": fb.get("citations"),
            }

            row.score = score_val
            row.feedback = feedback_val
            row.status = "Review Needed"
            row.updated_at = datetime.utcnow()

            db.add(row)
            db.commit()
            db.refresh(row)
        except Exception as e:
            db.rollback()
            # don't fail the whole request if DB persist fails; return feedback but surface an error
            raise HTTPException(status_code=500, detail=f"Failed to persist feedback to DB: {e}")

    # return the generated feedback to the caller (frontend expects tts_summary etc.)
    return fb


@router.post("/{pitch_id}/review-completed")
def mark_review_completed(pitch_id: str, db: Session = Depends(get_db)):
    # Validate UUID format
    try:
        import uuid

        pid = uuid.UUID(pitch_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid pitch_id format; must be a UUID")

    row = db.query(PitchSession).filter(PitchSession.id == pid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Pitch session not found")

    try:
        # store the explicit 'Review Completed' status to match Pydantic schema
        row.status = "Review Completed"
        row.review_required = False
        row.updated_at = datetime.utcnow()

        db.add(row)
        db.commit()
        db.refresh(row)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update pitch session: {e}")

    return {"id": str(row.id), "status": row.status}
