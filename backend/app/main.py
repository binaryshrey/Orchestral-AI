from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from app.routes.pitch_sessions import router as pitch_sessions_router
from app.routes.pitch_sessions import pitch_router as pitch_router
from app.routes.rag import router as rag_router
from app.routes.feedback import router as feedback_router
from app.routes.user_data import router as user_data_router

app = FastAPI(title="DemoDay AI Backend", version="0.1.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://demoday-ai.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pitch_sessions_router)
app.include_router(pitch_router)
app.include_router(rag_router)
app.include_router(feedback_router)
app.include_router(user_data_router)

@app.get("/health")
def health():
    return {"alive": True}
