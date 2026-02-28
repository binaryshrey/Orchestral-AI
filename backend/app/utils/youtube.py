# backend/app/utils/youtube.py
def youtube_timestamp_url(video_id: str, start_sec: int) -> str:
    return f"https://www.youtube.com/watch?v={video_id}&t={start_sec}s"
