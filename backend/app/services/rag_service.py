# backend/app/services/rag_service.py
from typing import Any, Dict, Optional

from ..config import RAG_MATCH_FN
from ..utils.youtube import youtube_timestamp_url


def retrieve_contexts(
    *,
    supabase,
    embedding_model,
    query: str,
    top_k: int = 5,
    filter_video_id: Optional[str] = None,
) -> Dict[str, Any]:
    # 1) Embed query
    qvec = embedding_model.get_embeddings([query])[0].values

    # 2) Vector search via Supabase RPC
    res = supabase.rpc(
        RAG_MATCH_FN,
        {
            "query_embedding": qvec,
            "match_count": top_k,
            "filter_video_id": filter_video_id,
        },
    ).execute()

    # 3) Format contexts with citations
    contexts = []
    for row in (res.data or []):
        video_id = row["video_id"]
        start_sec = int(row["start_sec"])
        contexts.append(
            {
                "text": row["text"],
                "title": row.get("title"),
                "video_id": video_id,
                "start_sec": start_sec,
                "end_sec": int(row["end_sec"]),
                "similarity": row.get("similarity"),
                "youtube_url": youtube_timestamp_url(video_id, start_sec),
            }
        )

    return {"query": query, "contexts": contexts}
