# backend/app/deps.py
import vertexai
from vertexai.language_models import TextEmbeddingModel
from supabase import create_client

from .config import (
    GOOGLE_CLOUD_PROJECT,
    VERTEX_LOCATION,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    EMBEDDING_MODEL_NAME,
)

# Initialize Vertex AI once (module import time)
vertexai.init(project=GOOGLE_CLOUD_PROJECT, location=VERTEX_LOCATION)
_embedding_model = TextEmbeddingModel.from_pretrained(EMBEDDING_MODEL_NAME)

# Initialize Supabase once
_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def get_embedding_model() -> TextEmbeddingModel:
    return _embedding_model


def get_supabase():
    return _supabase
