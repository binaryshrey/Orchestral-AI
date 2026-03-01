"""
Streamlit MCP Service
=====================
Provides a FastAPI-based MCP server for Streamlit Cloud integration.

Endpoints:
  POST   /mcp/streamlit/connect              - Register / update connection credentials
  GET    /mcp/streamlit/test                 - Verify stored credentials via Streamlit API
  GET    /mcp/streamlit/connection           - Return masked connection info (no full token)
  DELETE /mcp/streamlit/connection           - Remove stored connection
  GET    /mcp/streamlit/apps                 - List all Streamlit apps in the workspace
  GET    /mcp/streamlit/apps/{app_id}        - Get details for a specific app
  POST   /mcp/streamlit/apps/{app_id}/reboot - Reboot (restart) a Streamlit app
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import httpx

router = APIRouter(prefix="/mcp/streamlit", tags=["MCP - Streamlit"])

# ---------------------------------------------------------------------------
# In-memory connection store (replace with encrypted DB in production)
# ---------------------------------------------------------------------------
_connection: Dict[str, Any] = {}

STREAMLIT_API = "https://api.streamlit.io/v1"


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class StreamlitConnectRequest(BaseModel):
    mcp_server_url: str = Field(
        default="https://api.streamlit.io/v1",
        description="Streamlit Cloud API base URL",
    )
    workspace_team_id: str = Field(
        ..., description="Streamlit workspace slug or team identifier"
    )
    access_token: str = Field(..., description="Streamlit Cloud API token")
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_headers(token: Optional[str] = None) -> Dict[str, str]:
    tok = token or _connection.get("access_token")
    if not tok:
        raise HTTPException(
            status_code=400,
            detail="No Streamlit access token found. Call POST /mcp/streamlit/connect first.",
        )
    return {
        "Authorization": f"Bearer {tok}",
        "Content-Type": "application/json",
    }


def _base_url() -> str:
    return _connection.get("mcp_server_url", STREAMLIT_API).rstrip("/")


async def _st_get(path: str, params: Optional[Dict] = None) -> Any:
    url = f"{_base_url()}{path}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=_get_headers(), params=params)
    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="Streamlit token is invalid or expired.")
    if resp.status_code == 403:
        raise HTTPException(status_code=403, detail="Streamlit token lacks required scope.")
    if not resp.is_success:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


async def _st_post(path: str, body: Optional[Dict] = None) -> Any:
    url = f"{_base_url()}{path}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, headers=_get_headers(), json=body or {})
    if not resp.is_success:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    # Some reboot endpoints return 204 No Content
    if resp.status_code == 204 or not resp.content:
        return {"status": "ok"}
    return resp.json()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/connect", summary="Register Streamlit MCP connection")
async def connect(req: StreamlitConnectRequest):
    """
    Store Streamlit credentials for subsequent MCP tool calls.
    In production, encrypt the token and persist to a secure store.
    """
    _connection.update(req.model_dump())
    return {
        "status": "connected",
        "workspace_team_id": req.workspace_team_id,
        "mcp_server_url": req.mcp_server_url,
        "token_preview": f"{req.access_token[:6]}...{req.access_token[-4:]}",
    }


@router.get("/test", summary="Test Streamlit MCP connection")
async def test_connection():
    """
    Verifies stored credentials by listing apps from Streamlit Cloud API.
    """
    data = await _st_get("/apps")
    apps = data if isinstance(data, list) else data.get("apps", [])
    return {
        "status": "ok",
        "workspace_team_id": _connection.get("workspace_team_id"),
        "app_count": len(apps),
    }


@router.get("/connection", summary="Return masked connection info")
def get_connection():
    """Returns stored connection details with the token masked."""
    if not _connection:
        raise HTTPException(status_code=404, detail="No connection configured.")
    tok = _connection.get("access_token", "")
    return {
        "mcp_server_url": _connection.get("mcp_server_url"),
        "workspace_team_id": _connection.get("workspace_team_id"),
        "token_preview": f"{tok[:6]}...{tok[-4:]}" if len(tok) > 10 else "***",
        "notes": _connection.get("notes"),
        "status": "connected",
    }


@router.delete("/connection", summary="Remove stored Streamlit connection")
def delete_connection():
    _connection.clear()
    return {"status": "disconnected"}


@router.get("/apps", summary="List Streamlit apps")
async def list_apps():
    """
    List all Streamlit Cloud apps accessible with the stored token.
    Returns app id, name, subdomain, status, and URL.
    """
    data = await _st_get("/apps")
    apps = data if isinstance(data, list) else data.get("apps", [])
    return [
        {
            "id": a.get("id") or a.get("appId"),
            "name": a.get("appName") or a.get("name"),
            "subdomain": a.get("subdomain"),
            "status": a.get("status"),
            "url": (
                f"https://{a['subdomain']}.streamlit.app"
                if a.get("subdomain")
                else a.get("url")
            ),
            "updated_at": a.get("updatedAt") or a.get("updated_at"),
        }
        for a in apps
    ]


@router.get("/apps/{app_id}", summary="Get Streamlit app details")
async def get_app(app_id: str):
    """Get metadata and status for a specific Streamlit app."""
    data = await _st_get(f"/apps/{app_id}")
    return {
        "id": data.get("id") or data.get("appId"),
        "name": data.get("appName") or data.get("name"),
        "subdomain": data.get("subdomain"),
        "status": data.get("status"),
        "url": (
            f"https://{data['subdomain']}.streamlit.app"
            if data.get("subdomain")
            else data.get("url")
        ),
        "repo": data.get("repoUrl") or data.get("repo"),
        "branch": data.get("branch"),
        "main_file": data.get("mainModule") or data.get("main_file"),
        "updated_at": data.get("updatedAt") or data.get("updated_at"),
    }


@router.post("/apps/{app_id}/reboot", summary="Reboot a Streamlit app")
async def reboot_app(app_id: str):
    """Trigger a reboot / restart of the specified Streamlit app."""
    result = await _st_post(f"/apps/{app_id}/reboot")
    return {"app_id": app_id, "status": "rebooting", "response": result}
