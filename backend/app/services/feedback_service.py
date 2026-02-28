import os, json
import vertexai
from vertexai.generative_models import GenerativeModel

from ..config import GOOGLE_CLOUD_PROJECT, VERTEX_LOCATION

vertexai.init(project=GOOGLE_CLOUD_PROJECT, location=VERTEX_LOCATION)
model = GenerativeModel("gemini-2.5-flash")

def generate_feedback(pitch_text: str, contexts, qa_transcript=None):
    ctx_block = "\n\n".join(
        [f"[{i+1}] {c.get('title','')} ({c['video_id']} {c['start_sec']}-{c['end_sec']}s)\n{c['text']}"
         for i, c in enumerate(contexts)]
    )

    prompt = f"""
You are a YC partner. You will grade a startup pitch and give VC-style feedback.
Use the provided YC context snippets as grounding. If you reference an insight, cite the snippet number(s).

Return ONLY valid JSON with this schema:
{{
  "overall_score": 0-100,
  "scores": {{
    "clarity": 0-10,
    "problem": 0-10,
    "solution": 0-10,
    "market": 0-10,
    "traction": 0-10,
    "moat": 0-10,
    "business_model": 0-10,
    "ask": 0-10
  }},
  "top_strengths": ["..."],
  "top_risks": ["..."],
  "missing_info": ["..."],
  "suggested_improvements": ["..."],
  "rewritten_pitch": "string (<= 1200 chars)",
  "follow_up_questions": ["..."],
  "tts_summary": "string (<= 500 chars, spoken style)",
  "citations": [
    {{"claim":"...", "snippets":[1,2]}}
  ]
}}

PITCH:
{pitch_text}

YC CONTEXT SNIPPETS:
{ctx_block}
""".strip()

    resp = model.generate_content(prompt)
    text = resp.text.strip()

    # Try to parse JSON robustly
    try:
        return json.loads(text)
    except Exception:
        # fallback: attempt to extract json block
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start:end+1])
        raise
