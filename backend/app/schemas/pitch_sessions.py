from datetime import datetime
from typing import Optional, Literal, Dict, Any
from pydantic import BaseModel, EmailStr, Field

StatusType = Literal["Pending", "Review Completed", "Review Needed"]

class PitchSessionCreate(BaseModel):
    user_id: str
    user_name: str
    user_email: EmailStr

    startup_name: str
    website_link: Optional[str] = None
    github_link: Optional[str] = None
    content: Optional[str] = None

    duration_seconds: int = Field(..., ge=1, le=3600)
    language: str
    region: str

    # UI uploads directly to GCS and sends these
    gcp_bucket: Optional[str] = None
    gcp_object_path: Optional[str] = None
    gcp_file_url: Optional[str] = None  

    # JSON-based feedback and score
    feedback: Dict[str, Any] = Field(default_factory=dict)
    review_required: bool = False
    score: Dict[str, Any] = Field(default_factory=dict)
    status: StatusType = "Pending"

class PitchSessionUpdate(BaseModel):
    # allow updating review results later
    feedback: Optional[Dict[str, Any]] = None
    review_required: Optional[bool] = None
    score: Optional[Dict[str, Any]] = None
    status: Optional[StatusType] = None

    # allow updating file references too (optional)
    gcp_bucket: Optional[str] = None
    gcp_object_path: Optional[str] = None
    gcp_file_url: Optional[str] = None

class PitchSessionOut(BaseModel):
    id: str

    user_id: str
    user_name: str
    user_email: str

    startup_name: str
    website_link: Optional[str]
    github_link: Optional[str]
    content: Optional[str]

    duration_seconds: int
    language: str
    region: str

    gcp_bucket: Optional[str]
    gcp_object_path: Optional[str]
    gcp_file_url: Optional[str]

    feedback: Dict[str, Any]
    review_required: bool
    score: Dict[str, Any]
    status: StatusType

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
