from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import PitchSession

router = APIRouter(prefix="/users", tags=["users"])


@router.delete("/{user_id}/data")
def delete_user_data(user_id: str, db: Session = Depends(get_db)):
    """Delete all DB rows associated with a given external `user_id`.

    Currently this will delete rows in the `pitch_sessions` table where
    `PitchSession.user_id == user_id`. Returns a simple JSON payload
    with the count of deleted rows.
    """
    try:
        # Count matching rows first
        count = db.query(PitchSession).filter(PitchSession.user_id == user_id).count()

        if count == 0:
            return {"deleted_rows": 0}

        # Perform bulk delete and commit
        db.query(PitchSession).filter(PitchSession.user_id == user_id).delete(synchronize_session=False)
        db.commit()
        return {"deleted_rows": count}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to delete user data: {e}")
