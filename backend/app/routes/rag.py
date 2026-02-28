# backend/app/routes/rag.py
from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..deps import get_embedding_model, get_supabase
from ..services.rag_service import retrieve_contexts

router = APIRouter(prefix="/rag", tags=["rag"])


class RetrieveReq(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(5, ge=1, le=20)


@router.post("/retrieve")
def rag_retrieve(req: RetrieveReq):
    return retrieve_contexts(
        supabase=get_supabase(),
        embedding_model=get_embedding_model(),
        query=req.query,
        top_k=req.top_k,
        filter_video_id=None,
    )
