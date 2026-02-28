# backend/app/config.py
import os
from dotenv import load_dotenv

load_dotenv()


def env_get(env_var: str) -> str:
    val = os.environ.get(env_var)
    if not val:
        raise KeyError(f"Env variable '{env_var}' is not set!")
    return val


# --- Google Cloud / Vertex ---
GOOGLE_CLOUD_PROJECT = env_get("GOOGLE_CLOUD_PROJECT")
VERTEX_LOCATION = os.environ.get("VERTEX_LOCATION", "europe-west4")

# --- Supabase ---
SUPABASE_URL = env_get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = env_get("SUPABASE_SERVICE_ROLE_KEY")

# --- RAG ---
RAG_MATCH_FN = os.environ.get("RAG_MATCH_FN", "match_chunks")
EMBEDDING_MODEL_NAME = os.environ.get("EMBEDDING_MODEL_NAME", "text-embedding-004")
