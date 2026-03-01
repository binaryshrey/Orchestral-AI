# MCP App Setup Guide (GitHub, Slack, Notion, Streamlit)

## 1. Goal
This guide explains how to connect GitHub, Slack, Notion, and Streamlit to your project using MCP, and how to verify each connection from `/dashboard/onboard`.

## 2. Prerequisites
1. A running MCP gateway/host reachable over HTTPS.
2. One MCP server per app (GitHub, Slack, Notion, Streamlit) registered in your gateway.
3. Admin access to create app credentials/tokens in each platform.
4. Secure backend storage for tokens (recommended for production).

## 3. MCP Connection Model
Each app connection in the UI needs:
1. `MCP Server URL` - the endpoint for that app's MCP server.
2. `Workspace / Team ID` - org/team/workspace identifier used by that app.
3. `Access Token` - app credential used by the MCP server.
4. `Notes` - optional internal metadata.

## 4. Configure MCP Servers
Register all four servers in your MCP gateway config.

```json
{
  "mcpServers": {
    "github": {
      "transport": "http",
      "url": "https://mcp.github.yourdomain.com"
    },
    "slack": {
      "transport": "http",
      "url": "https://mcp.slack.yourdomain.com"
    },
    "notion": {
      "transport": "http",
      "url": "https://mcp.notion.yourdomain.com"
    },
    "streamlit": {
      "transport": "http",
      "url": "https://mcp.streamlit.yourdomain.com"
    }
  }
}
```

## 5. App-by-App Setup

### 5.1 GitHub
1. Create a GitHub token (PAT classic or fine-grained token).
2. Minimum scopes for common orchestration tasks: `repo`, `read:org`.
3. Copy your GitHub org/user name as the `Workspace / Team ID`.
4. In `/dashboard/onboard`, open **GitHub -> Connect**.
5. Enter:
- `MCP Server URL`: your GitHub MCP endpoint.
- `Workspace / Team ID`: org/user slug.
- `Access Token`: GitHub token.
6. Save connection.

Validation:
1. Test MCP tool call: list repositories.
2. Test read/write path: create or read an issue in a test repo.

### 5.2 Slack
1. Create a Slack app in your target workspace.
2. Add bot scopes: `channels:read`, `chat:write`, `users:read`.
3. Install the app to workspace.
4. Copy the bot token (`xoxb-...`).
5. Use workspace/team ID as `Workspace / Team ID`.
6. In `/dashboard/onboard`, open **Slack -> Connect** and save details.

Validation:
1. Test MCP tool call: list channels.
2. Post a test message to a sandbox channel.

### 5.3 Notion
1. Create a Notion internal integration.
2. Copy integration token.
3. Share target pages/databases with this integration.
4. Use your Notion workspace identifier as `Workspace / Team ID`.
5. In `/dashboard/onboard`, open **Notion -> Connect** and save details.

Validation:
1. Test MCP tool call: list/search pages.
2. Create/update a test page in a shared database.

### 5.4 Streamlit
1. Create API/service token in your Streamlit environment.
2. Ensure token has access to target apps/deployments.
3. Use project/workspace slug as `Workspace / Team ID`.
4. In `/dashboard/onboard`, open **Streamlit -> Connect** and save details.

Validation:
1. Test MCP tool call: list Streamlit apps/deployments.
2. Trigger a test operation (for example, fetch app metadata or run a deployment action if supported).

## 6. Connect from Onboard UI
1. Go to `/dashboard/onboard`.
2. In **Project Context & MCP Apps**, click **Connect** for each app.
3. Fill connection details and click **Save Connection**.
4. Confirm status changes to `Connected` on the app card.

## 7. Recommended Backend Persistence
For production, do not rely on frontend state only.
1. Add backend endpoints such as `/api/mcp/connections` and `/api/mcp/test`.
2. Encrypt stored tokens using KMS/secret manager.
3. Return masked token info to UI (never full token).
4. Add a `Test Connection` action before marking a connection healthy.

## 8. Troubleshooting
1. `401` or `403`: token invalid or missing scope.
2. Notion returns no data: page/database not shared with integration.
3. Slack failures: app not installed to workspace or missing bot scopes.
4. GitHub repo access denied: token not authorized for org/repo.
5. Streamlit failures: token lacks app access or wrong workspace ID.
6. Timeout/network errors: incorrect MCP URL, TLS issues, or gateway not reachable.

## 9. Security Checklist
1. Store tokens server-side only (encrypted at rest).
2. Rotate credentials regularly.
3. Use least-privilege scopes.
4. Log audit events for connection create/update/delete.
5. Restrict who can view/manage integration settings.

## 10. Quick Verification Matrix
1. GitHub: list repos + read/write issue.
2. Slack: list channels + send message.
3. Notion: query DB + create/update page.
4. Streamlit: list apps + read deployment/app status.
