import os
from pydantic import BaseModel

class Settings(BaseModel):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    ENV: str = os.getenv("ENV", "development")
    PORT: int = int(os.getenv("PORT", "8080"))

settings = Settings()

if not settings.DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")