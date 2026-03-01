"""
GitHub MCP Service
==================
Provides a FastAPI-based MCP server for GitHub integration.

Endpoints:
  POST /mcp/github/connect          - Register / update connection credentials
  GET  /mcp/github/test             - Verify stored credentials by calling GitHub API
  GET  /mcp/github/repos            - List repositories for the authenticated user/org
  GET  /mcp/github/issues/{owner}/{repo}   - List issues in a repository
  POST /mcp/github/issues/{owner}/{repo}   - Create an issue in a repository
  GET  /mcp/github/connection       - Return masked connection info (no full token)
  DELETE /mcp/github/connection     - Remove stored connection
"""

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import httpx

router = APIRouter(prefix="/mcp/github", tags=["MCP - GitHub"])

# ---------------------------------------------------------------------------
# In-memory connection store (replace with encrypted DB in production)
# ---------------------------------------------------------------------------
_connection: Dict[str, Any] = {}

GITHUB_API = "https://api.github.com"


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class GitHubConnectRequest(BaseModel):
    mcp_server_url: str = Field(
        default="https://api.github.com",
        description="GitHub API base URL (usually https://api.github.com or GitHub Enterprise URL)",
    )
    workspace_team_id: str = Field(..., description="GitHub org or username slug")
    access_token: str = Field(..., description="GitHub PAT (classic or fine-grained)")
    notes: Optional[str] = None


class IssueCreateRequest(BaseModel):
    title: str = Field(..., min_length=1)
    body: Optional[str] = None
    labels: Optional[List[str]] = None
    assignees: Optional[List[str]] = None


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _get_headers(token: Optional[str] = None) -> Dict[str, str]:
    """Build GitHub request headers, preferring per-request token over stored one."""
    tok = token or _connection.get("access_token")
    if not tok:
        raise HTTPException(
            status_code=400,
            detail="No GitHub access token found. Call POST /mcp/github/connect first.",
        )
    return {
        "Authorization": f"Bearer {tok}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _base_url() -> str:
    return _connection.get("mcp_server_url", GITHUB_API).rstrip("/")


async def _github_get(path: str, token: Optional[str] = None, params: Optional[Dict] = None) -> Any:
    url = f"{_base_url()}{path}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=_get_headers(token), params=params)
    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="GitHub token is invalid or expired.")
    if resp.status_code == 403:
        raise HTTPException(status_code=403, detail="GitHub token lacks required scope.")
    if not resp.is_success:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


async def _github_post(path: str, body: Dict, token: Optional[str] = None) -> Any:
    url = f"{_base_url()}{path}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, headers=_get_headers(token), json=body)
    if not resp.is_success:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/connect", summary="Register GitHub MCP connection")
async def connect(req: GitHubConnectRequest):
    """
    Store GitHub credentials for subsequent MCP tool calls.
    In production, encrypt the token and persist to a secure store.
    """
    _connection.update(req.model_dump())
    return {
        "status": "connected",
        "workspace_team_id": req.workspace_team_id,
        "mcp_server_url": req.mcp_server_url,
        "token_preview": f"{req.access_token[:6]}...{req.access_token[-4:]}",
    }


@router.get("/test", summary="Test GitHub MCP connection")
async def test_connection():
    """
    Verifies stored credentials by fetching the authenticated user from GitHub.
    """
    data = await _github_get("/user")
    return {
        "status": "ok",
        "github_login": data.get("login"),
        "github_name": data.get("name"),
        "github_url": data.get("html_url"),
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


@router.delete("/connection", summary="Remove stored GitHub connection")
def delete_connection():
    _connection.clear()
    return {"status": "disconnected"}


@router.get("/repos", summary="List repositories")
async def list_repos(
    type: str = "all",
    sort: str = "updated",
    per_page: int = 30,
    page: int = 1,
):
    """
    List repositories for the authenticated user.
    `type` can be: all, owner, public, private, member.
    """
    data = await _github_get(
        "/user/repos",
        params={"type": type, "sort": sort, "per_page": per_page, "page": page},
    )
    return [
        {
            "full_name": r["full_name"],
            "private": r["private"],
            "description": r.get("description"),
            "url": r["html_url"],
            "default_branch": r.get("default_branch"),
            "updated_at": r.get("updated_at"),
        }
        for r in data
    ]


@router.get("/issues/{owner}/{repo}", summary="List issues in a repository")
async def list_issues(
    owner: str,
    repo: str,
    state: str = "open",
    per_page: int = 30,
    page: int = 1,
):
    """List issues for a given repository."""
    data = await _github_get(
        f"/repos/{owner}/{repo}/issues",
        params={"state": state, "per_page": per_page, "page": page},
    )
    return [
        {
            "number": i["number"],
            "title": i["title"],
            "state": i["state"],
            "url": i["html_url"],
            "created_at": i.get("created_at"),
            "author": i.get("user", {}).get("login"),
        }
        for i in data
        if "pull_request" not in i  # exclude PRs
    ]


@router.post("/issues/{owner}/{repo}", summary="Create an issue in a repository")
async def create_issue(owner: str, repo: str, req: IssueCreateRequest):
    """Create a new issue in the specified repository."""
    body: Dict[str, Any] = {"title": req.title}
    if req.body:
        body["body"] = req.body
    if req.labels:
        body["labels"] = req.labels
    if req.assignees:
        body["assignees"] = req.assignees

    data = await _github_post(f"/repos/{owner}/{repo}/issues", body)
    return {
        "number": data["number"],
        "title": data["title"],
        "url": data["html_url"],
        "state": data["state"],
        "created_at": data.get("created_at"),
    }
