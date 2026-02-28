import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Text, Integer, Boolean, Numeric,
    DateTime, CheckConstraint, text
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class PitchSession(Base):
    __tablename__ = "pitch_sessions"
    __table_args__ = (
        CheckConstraint(
            "status in ('Pending', 'Review Needed', 'Review Completed')",
            name="pitch_sessions_status_check",
        ),
        {"schema": "public"},
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    user_id = Column(String, nullable=False)         # external user id from UI
    user_name = Column(String, nullable=False)
    user_email = Column(String, nullable=False)

    startup_name = Column(String, nullable=False)
    website_link = Column(String, nullable=True)
    github_link = Column(String, nullable=True)
    content = Column(Text, nullable=True)

    duration_seconds = Column(Integer, nullable=False)
    language = Column(String, nullable=False)
    region = Column(String, nullable=False)

    # Provided by UI after uploading directly to GCS
    gcp_file_url = Column(Text, nullable=True)       
    gcp_bucket = Column(String, nullable=True)
    gcp_object_path = Column(Text, nullable=True)

    # JSONB fields for structured feedback and scores
    feedback = Column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    review_required = Column(Boolean, nullable=False, default=False)
    score = Column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))

    status = Column(String, nullable=False, default="Pending")

    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
