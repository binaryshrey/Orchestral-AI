"""
Streamlit MCP Service (GitHub-backed)
======================================
Streamlit Community Cloud deploys apps directly from GitHub repositories.
This service uses your GitHub PAT to manage GitHub repos that contain
Streamlit apps. Pushing to the connected branch redeploys the app automatically.

Endpoints:
  POST   /mcp/streamlit/connect                           - Register GitHub token for Streamlit deployments
  GET    /mcp/streamlit/test                              - Verify credentials
  GET    /mcp/streamlit/connection                        - Return masked connection info
  DELETE /mcp/streamlit/connection                        - Remove stored connection
  GET    /mcp/streamlit/apps                              - List GitHub repos containing Streamlit apps
  GET    /mcp/streamlit/apps/{owner}/{repo}               - Get details of a Streamlit app repo
  POST   /mcp/streamlit/apps/{owner}/{repo}/deploy        - Trigger redeployment by pushing an empty commit
  GET    /mcp/streamlit/apps/{owner}/{repo}/main-file     - Detect the Streamlit entry point file
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import httpx

router = APIRouter(prefix="/mcp/streamlit", tags=["MCP - Streamlit (GitHub-backed)"])

# ---------------------------------------------------------------------------
# In-memory connection store (replace with encrypted DB in production)
# ---------------------------------------------------------------------------
_connection: Dict[str, Any] = {}

GITHUB_API = "https://api.github.com"

# Files that indicate a repo contains a Streamlit app
STREAMLIT_INDICATORS = ["streamlit", "st.title", "st.write", "st.sidebar"]


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class StreamlitConnectRequest(BaseModel):
    mcp_server_url: str = Field(
        default="https://api.github.com",
        description="GitHub API base URL (Streamlit deploys from GitHub repos)",
    )
    workspace_team_id: str = Field(
        ..., description="GitHub org or username that owns the Streamlit app repos"
    )
    access_token: str = Field(
        ..., description="GitHub PAT with repo + read:org scopes (same token used for GitHub MCP)"
    )
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_headers() -> Dict[str, str]:
    tok = _connection.get("access_token")
    if not tok:
        raise HTTPException(
            status_code=400,
            detail="No token found. Call POST /mcp/streamlit/connect first.",
        )
    return {
        "Authorization": f"Bearer {tok}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _base_url() -> str:
    # Always use the real GitHub API — Streamlit deploys from GitHub repos
    return GITHUB_API


async def _gh_get(path: str, params: Optional[Dict] = None) -> Any:
    url = f"{_base_url()}{path}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=_get_headers(), params=params)
    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="GitHub token is invalid or expired.")
    if resp.status_code == 403:
        raise HTTPException(status_code=403, detail="GitHub token lacks required scope.")
    if not resp.is_success:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


async def _gh_post(path: str, body: Dict) -> Any:
    url = f"{_base_url()}{path}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, headers=_get_headers(), json=body)
    if not resp.is_success:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


async def _is_streamlit_repo(owner: str, repo: str) -> bool:
    """Check if a repo likely contains a Streamlit app by scanning requirements or top-level .py files."""
    try:
        # Check requirements.txt
        content_resp = await _gh_get(f"/repos/{owner}/{repo}/contents/requirements.txt")
        import base64
        content = base64.b64decode(content_resp.get("content", "")).decode("utf-8", errors="ignore")
        if "streamlit" in content.lower():
            return True
    except HTTPException:
        pass

    try:
        # Check top-level .py files for streamlit imports
        tree = await _gh_get(f"/repos/{owner}/{repo}/contents/")
        py_files = [f for f in tree if isinstance(f, dict) and f.get("name", "").endswith(".py")]
        for f in py_files[:3]:  # check up to 3 .py files
            file_resp = await _gh_get(f"/repos/{owner}/{repo}/contents/{f['name']}")
            import base64
            code = base64.b64decode(file_resp.get("content", "")).decode("utf-8", errors="ignore")
            if "import streamlit" in code or "from streamlit" in code:
                return True
    except HTTPException:
        pass

    return False


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/connect", summary="Register Streamlit (GitHub-backed) MCP connection")
async def connect(req: StreamlitConnectRequest):
    """
    Store GitHub credentials for managing Streamlit app repos.
    Uses the same GitHub PAT as the GitHub MCP — no separate token needed.
    """
    _connection.update(req.model_dump())
    return {
        "status": "connected",
        "workspace_team_id": req.workspace_team_id,
        "mcp_server_url": req.mcp_server_url,
        "token_preview": f"{req.access_token[:6]}...{req.access_token[-4:]}",
        "note": "Uses GitHub PAT — Streamlit Community Cloud auto-deploys on git push.",
    }


@router.get("/test", summary="Test Streamlit MCP connection")
async def test_connection():
    """Verifies GitHub credentials by fetching the authenticated user."""
    data = await _gh_get("/user")
    return {
        "status": "ok",
        "github_login": data.get("login"),
        "workspace_team_id": _connection.get("workspace_team_id"),
        "note": "Streamlit apps deploy automatically when you push to their connected GitHub branch.",
    }


@router.get("/connection", summary="Return masked connection info")
def get_connection():
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


@router.get("/apps", summary="List GitHub repos containing Streamlit apps")
async def list_apps(
    type: str = "all",
    per_page: int = 50,
    page: int = 1,
    filter_streamlit: bool = True,
):
    """
    Lists GitHub repos for the connected user/org.
    When filter_streamlit=true, only returns repos that contain a Streamlit app
    (detected via requirements.txt or import statements).
    """
    repos = await _gh_get(
        "/user/repos",
        params={"type": type, "sort": "updated", "per_page": per_page, "page": page},
    )

    results = []
    for r in repos:
        owner = r["owner"]["login"]
        name = r["name"]
        is_st = (await _is_streamlit_repo(owner, name)) if filter_streamlit else True
        if is_st:
            results.append({
                "full_name": r["full_name"],
                "owner": owner,
                "repo": name,
                "private": r["private"],
                "default_branch": r.get("default_branch", "main"),
                "description": r.get("description"),
                "github_url": r["html_url"],
                "streamlit_url": f"https://{name}.streamlit.app",
                "updated_at": r.get("updated_at"),
            })

    return results


@router.get("/apps/{owner}/{repo}", summary="Get Streamlit app repo details")
async def get_app(owner: str, repo: str):
    """Get GitHub repo details and the detected Streamlit entry point."""
    data = await _gh_get(f"/repos/{owner}/{repo}")

    # Try to find main Streamlit file
    main_file = await _detect_main_file(owner, repo)

    return {
        "full_name": data["full_name"],
        "owner": owner,
        "repo": repo,
        "default_branch": data.get("default_branch", "main"),
        "description": data.get("description"),
        "github_url": data["html_url"],
        "streamlit_url": f"https://{repo}.streamlit.app",
        "main_file": main_file,
        "updated_at": data.get("updated_at"),
        "deploy_note": "Push a commit to the default branch to trigger redeployment on Streamlit Community Cloud.",
    }


@router.get("/apps/{owner}/{repo}/main-file", summary="Detect Streamlit entry point file")
async def get_main_file(owner: str, repo: str):
    """Detect which .py file is the Streamlit app entry point."""
    main_file = await _detect_main_file(owner, repo)
    return {"owner": owner, "repo": repo, "main_file": main_file}


@router.post("/apps/{owner}/{repo}/deploy", summary="Trigger redeployment via empty git commit")
async def deploy_app(owner: str, repo: str):
    """
    Triggers a redeployment on Streamlit Community Cloud by pushing an empty commit
    to the default branch. Streamlit auto-deploys on every push.
    """
    # Get the current HEAD SHA
    repo_data = await _gh_get(f"/repos/{owner}/{repo}")
    branch = repo_data.get("default_branch", "main")

    ref_data = await _gh_get(f"/repos/{owner}/{repo}/git/ref/heads/{branch}")
    current_sha = ref_data["object"]["sha"]

    # Get the commit tree
    commit_data = await _gh_get(f"/repos/{owner}/{repo}/git/commits/{current_sha}")
    tree_sha = commit_data["tree"]["sha"]

    # Create a new empty commit
    new_commit = await _gh_post(
        f"/repos/{owner}/{repo}/git/commits",
        {
            "message": "chore: trigger Streamlit redeployment [skip ci]",
            "tree": tree_sha,
            "parents": [current_sha],
        },
    )

    # Update the branch ref to point to the new commit
    url = f"{_base_url()}/repos/{owner}/{repo}/git/refs/heads/{branch}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.patch(
            url,
            headers=_get_headers(),
            json={"sha": new_commit["sha"], "force": False},
        )
    if not resp.is_success:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    return {
        "status": "deployed",
        "owner": owner,
        "repo": repo,
        "branch": branch,
        "commit_sha": new_commit["sha"],
        "streamlit_url": f"https://{repo}.streamlit.app",
        "note": "Streamlit Community Cloud will pick up the new commit and redeploy automatically.",
    }


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

async def _detect_main_file(owner: str, repo: str) -> Optional[str]:
    """Detect the most likely Streamlit entry point .py file in the repo."""
    import base64

    common_names = ["app.py", "main.py", "streamlit_app.py", "Home.py", "index.py"]

    try:
        tree = await _gh_get(f"/repos/{owner}/{repo}/contents/")
        py_files = [f["name"] for f in tree if isinstance(f, dict) and f.get("name", "").endswith(".py")]
    except HTTPException:
        return None

    # Prefer common names first
    for name in common_names:
        if name in py_files:
            return name

    # Fall back to first .py file that imports streamlit
    for name in py_files[:5]:
        try:
            file_resp = await _gh_get(f"/repos/{owner}/{repo}/contents/{name}")
            code = base64.b64decode(file_resp.get("content", "")).decode("utf-8", errors="ignore")
            if "import streamlit" in code or "from streamlit" in code:
                return name
        except HTTPException:
            continue

    return py_files[0] if py_files else None
