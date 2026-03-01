import { NextRequest, NextResponse } from "next/server";
import { Mistral } from "@mistralai/mistralai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TaskResult {
  taskId: string;
  taskName: string;
  agentName: string;
  status: "completed" | "failed";
  output: string;
  error?: string;
}

const REQUIRED_FILES = [
  "app.py",
  "simulation.py",
  "formulas.py",
  "optimizer.py",
  "utils.py",
  "requirements.txt",
  "README.md",
  "architecture.md",
  "templates/base.html",
  "templates/dashboard.html",
  "templates/components/parameter_panel.html",
  "templates/components/charts_section.html",
  "templates/components/tables_section.html",
] as const;

type RepoFiles = Record<string, string>;
type StreamlitDeployResult = {
  enabled: boolean;
  deployed: boolean;
  streamlitUrl: string | null;
  logs: string[];
  error: string | null;
  accessVerified?: boolean;
  manageUrl?: string | null;
};

const REQUIRED_PACKAGES: Record<string, string> = {
  streamlit: "streamlit>=1.36.0",
  numpy: "numpy>=2.1.0",
  pandas: "pandas>=2.2.2",
  plotly: "plotly>=5.22.0",
  jinja2: "jinja2>=3.1.4",
};

const EXTERNAL_TIMEOUT_MS = 25_000;
const MODEL_TIMEOUT_MS = 45_000;
const STREAMLIT_CHECK_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  timeoutMs = EXTERNAL_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toBase64(content: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(content, "utf-8").toString("base64");
  }
  return btoa(unescape(encodeURIComponent(content)));
}

function buildRepoPrompt(projectName: string, context: string): string {
  return `You are a senior quantitative researcher and senior full-stack Python engineer.

Generate a COMPLETE repository for the project "${projectName}".
Use the context from previous agent outputs below.

CONTEXT:
${context}

MANDATORY FILE CONTRACT:
${REQUIRED_FILES.map((f) => `- ${f}`).join("\n")}

MATHEMATICAL REQUIREMENTS:
- Ornstein-Uhlenbeck process: dX_t = -k X_t dt + sigma dB_t (Euler-Maruyama)
- Power utility: U(W_T) = (1/gamma) * W_T^gamma
- Optimal control: alpha*_t = -W_t X_t D(tau)
- tau = T - t, nu = 1/sqrt(1-gamma)
- C(tau) = cosh(nu*tau) + nu*sinh(nu*tau)
- D(tau) = C'(tau)/C(tau)
- Wealth dynamics: dW_t = alpha_t dX_t

OUTPUT FORMAT:
Return ONLY valid JSON with this exact schema:
{
  "files": {
    "app.py": "...",
    "simulation.py": "...",
    "formulas.py": "...",
    "optimizer.py": "...",
    "utils.py": "...",
    "requirements.txt": "...",
    "README.md": "...",
    "architecture.md": "...",
    "templates/base.html": "...",
    "templates/dashboard.html": "...",
    "templates/components/parameter_panel.html": "...",
    "templates/components/charts_section.html": "...",
    "templates/components/tables_section.html": "..."
  }
}

Rules:
- Every required file must be present and non-empty.
- No TODO placeholders or pseudocode.
- Python code must be executable.
- Use Streamlit + Plotly + Jinja2 templates.
- Keep code modular and production-ready.
`;
}

function normalizeContent(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object" && "text" in entry) {
          const text = (entry as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("");
  }
  return "";
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function isValidRepoFiles(files: RepoFiles): boolean {
  return REQUIRED_FILES.every((path) => {
    const content = files[path];
    return typeof content === "string" && content.trim().length > 0;
  });
}

function sanitizeRequirements(content: string): string {
  const normalizedLines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const packageMap = new Map<string, string>();
  const passthrough: string[] = [];

  for (const line of normalizedLines) {
    const pkgMatch = line.match(/^([A-Za-z0-9_.-]+)/);
    if (!pkgMatch) {
      passthrough.push(line);
      continue;
    }
    const pkgName = pkgMatch[1].toLowerCase();
    if (REQUIRED_PACKAGES[pkgName]) {
      packageMap.set(pkgName, REQUIRED_PACKAGES[pkgName]);
      continue;
    }
    packageMap.set(pkgName, line);
  }

  Object.entries(REQUIRED_PACKAGES).forEach(([name, pinned]) => {
    packageMap.set(name, pinned);
  });

  const ordered = [
    ...Object.values(REQUIRED_PACKAGES),
    ...Array.from(packageMap.entries())
      .filter(([name]) => !(name in REQUIRED_PACKAGES))
      .map(([, value]) => value),
    ...passthrough,
  ];

  return `${ordered.join("\n")}\n`;
}

function buildRepositoryName(projectName: string): string {
  const raw = projectName.trim();
  if (!raw) {
    return "paper2prod";
  }

  const normalized = raw
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/\.git$/i, "");

  const limited = normalized.slice(0, 100).replace(/^[._-]+|[._-]+$/g, "");
  return limited || "paper2prod";
}

function buildFallbackRepository(projectName: string): RepoFiles {
  const safeTitle = projectName.replace(/`/g, "").trim() || "Paper2Prod";
  return {
    "app.py": `import streamlit as st\nimport pandas as pd\nimport plotly.express as px\n\nfrom simulation import run_simulation\nfrom optimizer import alpha_star\n\nst.set_page_config(page_title="${safeTitle}", layout="wide")\nst.title("${safeTitle} Dashboard")\n\nwith st.sidebar:\n    k = st.slider("k", 0.01, 2.0, 0.4)\n    sigma = st.slider("sigma", 0.01, 2.0, 0.3)\n    gamma = st.slider("gamma", 0.01, 0.95, 0.4)\n    w0 = st.number_input("initial wealth", 1.0, 1_000_000.0, 10000.0)\n    horizon = st.number_input("time horizon", 0.1, 20.0, 1.0)\n\nresult = run_simulation(k=k, sigma=sigma, gamma=gamma, w0=w0, horizon=horizon)\ndf = pd.DataFrame(result)\n\nst.subheader("Spread Simulation")\nst.plotly_chart(px.line(df, x="t", y="x", title="OU Spread"), use_container_width=True)\n\nst.subheader("Wealth Trajectory")\nst.plotly_chart(px.line(df, x="t", y="w", title="Wealth"), use_container_width=True)\n\nst.subheader("Summary")\nst.dataframe(df.describe().T, use_container_width=True)\n`,
    "simulation.py": `import numpy as np\n\nfrom formulas import ou_step, power_utility\nfrom optimizer import alpha_star\n\n\ndef run_simulation(k: float, sigma: float, gamma: float, w0: float, horizon: float, steps: int = 250):\n    dt = horizon / steps\n    x = 0.0\n    w = w0\n\n    rows = []\n    for i in range(steps + 1):\n        t = i * dt\n        tau = max(horizon - t, 1e-9)\n        alpha = alpha_star(w, x, tau, gamma)\n\n        rows.append({\n            "t": t,\n            "x": x,\n            "w": w,\n            "alpha": alpha,\n            "utility": power_utility(max(w, 1e-9), gamma),\n        })\n\n        if i < steps:\n            x_next, d_x = ou_step(x, k, sigma, dt)\n            w = w + alpha * d_x\n            x = x_next\n\n    return rows\n`,
    "formulas.py": `import math\nimport numpy as np\n\n\ndef ou_step(x: float, k: float, sigma: float, dt: float):\n    d_b = np.random.normal(0.0, math.sqrt(dt))\n    d_x = -k * x * dt + sigma * d_b\n    return x + d_x, d_x\n\n\ndef power_utility(w_t: float, gamma: float):\n    w_t = max(w_t, 1e-12)\n    if abs(gamma) < 1e-12:\n        return math.log(w_t)\n    return (w_t ** gamma) / gamma\n`,
    "optimizer.py": `import math\n\n\ndef _nu(gamma: float) -> float:\n    g = min(max(gamma, 1e-6), 0.999999)\n    return 1.0 / math.sqrt(1.0 - g)\n\n\ndef c_tau(tau: float, gamma: float) -> float:\n    nu = _nu(gamma)\n    return math.cosh(nu * tau) + nu * math.sinh(nu * tau)\n\n\ndef c_prime_tau(tau: float, gamma: float) -> float:\n    nu = _nu(gamma)\n    return nu * math.sinh(nu * tau) + (nu**2) * math.cosh(nu * tau)\n\n\ndef d_tau(tau: float, gamma: float) -> float:\n    c = c_tau(tau, gamma)\n    cp = c_prime_tau(tau, gamma)\n    return cp / c if c != 0 else 0.0\n\n\ndef alpha_star(w_t: float, x_t: float, tau: float, gamma: float) -> float:\n    return -w_t * x_t * d_tau(tau, gamma)\n`,
    "utils.py": `from __future__ import annotations\n\nfrom dataclasses import dataclass\n\n\n@dataclass\nclass SimulationConfig:\n    k: float\n    sigma: float\n    gamma: float\n    initial_wealth: float\n    horizon: float\n    steps: int = 250\n\n\ndef clamp_gamma(gamma: float) -> float:\n    return min(max(gamma, 1e-6), 0.999999)\n`,
    "requirements.txt": `streamlit>=1.36.0\nnumpy>=2.1.0\npandas>=2.2.2\nplotly>=5.22.0\njinja2>=3.1.4\n`,
    "README.md": `# ${safeTitle}\n\nProduction-ready analytical web application implementing an OU-process based optimal control simulation.\n\n## Run Locally\n\n\`\`\`bash\npip install -r requirements.txt\nstreamlit run app.py\n\`\`\`\n\n## Files\n- app.py\n- simulation.py\n- formulas.py\n- optimizer.py\n- templates/*\n`,
    "architecture.md": `# Architecture\n\n## Components\n- app.py: Streamlit entrypoint and dashboard orchestration\n- simulation.py: stochastic simulation engine\n- formulas.py: reusable math equations\n- optimizer.py: optimal control derivations\n- templates/: Jinja layout components\n\n## Data Flow\n1. User selects parameters\n2. Simulation engine generates paths\n3. Optimizer computes controls\n4. Dashboard renders charts and tables\n`,
    "templates/base.html": `<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <title>{{ title or \"Paper2Prod\" }}</title>\n  <style>body{background:#0f172a;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;margin:0}main{padding:24px;max-width:1200px;margin:auto}.card{background:#111827;border:1px solid #334155;border-radius:12px;padding:16px;margin-bottom:16px}</style>\n</head>\n<body>\n  <main>\n    {% block content %}{% endblock %}\n  </main>\n</body>\n</html>\n`,
    "templates/dashboard.html": `{% extends \"base.html\" %}\n{% block content %}\n<div class=\"card\">{% include \"components/parameter_panel.html\" %}</div>\n<div class=\"card\">{% include \"components/charts_section.html\" %}</div>\n<div class=\"card\">{% include \"components/tables_section.html\" %}</div>\n{% endblock %}\n`,
    "templates/components/parameter_panel.html": `<h2>Parameter Configuration</h2>\n<p>k, sigma, gamma, initial wealth, time horizon</p>\n`,
    "templates/components/charts_section.html": `<h2>Charts</h2>\n<div id=\"spread-chart\"></div>\n<div id=\"dual-axis-chart\"></div>\n<div id=\"wealth-chart\"></div>\n<div id=\"sensitivity-chart\"></div>\n`,
    "templates/components/tables_section.html": `<h2>Tables</h2>\n<div id=\"parameter-summary\"></div>\n<div id=\"derived-metrics\"></div>\n<div id=\"simulation-statistics\"></div>\n`,
  };
}

async function generateRepositoryFilesWithMistral(
  projectName: string,
  context: string,
): Promise<RepoFiles | null> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Mistral({ apiKey });
    const prompt = buildRepoPrompt(projectName, context);

    const result = await withTimeout(
      client.chat.complete({
        model: "mistral-large-latest",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.25,
        responseFormat: { type: "json_object" },
      }),
      MODEL_TIMEOUT_MS,
      "Mistral repository generation",
    );

    const text = normalizeContent(result.choices?.[0]?.message?.content);
    const parsed = parseJsonObject(text) as { files?: Record<string, unknown> } | null;

    if (!parsed?.files || typeof parsed.files !== "object") {
      return null;
    }

    const files: RepoFiles = {};
    for (const [path, content] of Object.entries(parsed.files)) {
      if (typeof content === "string") files[path] = content;
    }

    if (!isValidRepoFiles(files)) {
      return null;
    }

    return files;
  } catch (err) {
    console.error("[agents/commit] model generation error:", err);
    return null;
  }
}

async function deployToStreamlit(params: {
  backendUrl: string;
  owner: string;
  repo: string;
  token: string;
  workspaceId?: string;
}): Promise<StreamlitDeployResult> {
  const { backendUrl, owner, repo, token, workspaceId } = params;
  const logs: string[] = [];
  const result: StreamlitDeployResult = {
    enabled: true,
    deployed: false,
    streamlitUrl: `https://${repo}.streamlit.app`,
    logs,
    error: null,
    manageUrl: "https://share.streamlit.io/",
  };

  try {
    logs.push("Connecting Streamlit MCP...");
    const connectResponse = await fetchWithTimeout(
      `${backendUrl}/mcp/streamlit/connect`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mcp_server_url: "https://api.github.com",
          workspace_team_id: workspaceId?.trim() || owner,
          access_token: token,
        }),
      },
    );
    if (!connectResponse.ok) {
      const bodyText = await connectResponse.text();
      throw new Error(
        `Streamlit MCP connect failed (${connectResponse.status}): ${bodyText.slice(0, 180)}`,
      );
    }
    logs.push("Streamlit MCP connected.");

    logs.push("Triggering Streamlit redeploy...");
    const deployResponse = await fetchWithTimeout(
      `${backendUrl}/mcp/streamlit/apps/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/deploy`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
    );
    if (!deployResponse.ok) {
      const bodyText = await deployResponse.text();
      throw new Error(
        `Streamlit deploy trigger failed (${deployResponse.status}): ${bodyText.slice(0, 180)}`,
      );
    }

    const deployData = (await deployResponse.json()) as {
      status?: string;
      streamlit_url?: string;
      commit_sha?: string;
    };
    result.deployed = true;
    result.streamlitUrl = deployData.streamlit_url ?? result.streamlitUrl;
    logs.push(
      `Streamlit deploy triggered (${deployData.status ?? "accepted"}${deployData.commit_sha ? `, commit ${deployData.commit_sha.slice(0, 7)}` : ""}).`,
    );
    logs.push(
      `Streamlit URL: ${result.streamlitUrl ?? `https://${repo}.streamlit.app`}`,
    );
    logs.push(
      "Build logs are available on Streamlit Cloud dashboard while deployment is in progress.",
    );

    // Verify whether the app URL is actually accessible with current account linkage.
    if (result.streamlitUrl) {
      try {
        const verifyResp = await fetchWithTimeout(
          result.streamlitUrl,
          {
            method: "GET",
            redirect: "manual",
            headers: {
              "User-Agent": "Orchestral-AI",
              Accept: "text/html,application/xhtml+xml",
            },
          },
          STREAMLIT_CHECK_TIMEOUT_MS,
        );
        const locationHeader = verifyResp.headers.get("location") || "";
        const redirectedToAuth = /share\.streamlit\.io\/-\/auth\/app/i.test(
          locationHeader,
        );
        const verifyHtml = (await verifyResp.text()).toLowerCase();
        const permissionIssue =
          redirectedToAuth ||
          verifyHtml.includes("do not have access to this app or it does not exist") ||
          verifyHtml.includes("sign out and sign in with a different account") ||
          verifyHtml.includes("source control account");

        if (permissionIssue) {
          result.deployed = false;
          result.accessVerified = false;
          result.error =
            "Streamlit URL is auth-gated. Set the app Sharing mode to public (or grant this account access) in Streamlit Cloud.";
          logs.push(
            "Streamlit access check failed: app requires auth or account linkage is missing.",
          );
          logs.push(
            "Action: open Streamlit Cloud > App Settings > Sharing > 'This app is public and searchable'.",
          );
        } else if (!verifyResp.ok && verifyResp.status >= 400) {
          result.accessVerified = false;
          logs.push(
            `Streamlit access check returned HTTP ${verifyResp.status}; deployment may still be warming up.`,
          );
        } else {
          result.accessVerified = true;
          logs.push("Streamlit access check passed.");
        }
      } catch (verifyErr) {
        result.accessVerified = false;
        logs.push(
          `Streamlit access check skipped: ${
            verifyErr instanceof Error ? verifyErr.message : String(verifyErr)
          }`,
        );
      }
    }

    return result;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    logs.push(`Streamlit deployment error: ${result.error}`);
    logs.push(
      "Action: open https://share.streamlit.io and verify app ownership + Sharing settings.",
    );
    return result;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      results,
      project_name,
      github_token,
      github_workspace_id,
      streamlit_token,
      streamlit_workspace_id,
    }: {
      results: TaskResult[];
      project_name: string;
      github_token?: string;
      github_workspace_id?: string;
      streamlit_token?: string;
      streamlit_workspace_id?: string;
    } = body;

    if (!Array.isArray(results)) {
      return NextResponse.json({ error: "results array required" }, { status: 400 });
    }

    const completedResults = results.filter((r) => r.status === "completed");
    const allOutputs = completedResults
      .map((r) => `## ${r.taskName} (${r.agentName})\n${r.output}`)
      .join("\n\n");

    const fallbackFiles = buildFallbackRepository(project_name || "Paper2Prod");
    let repoFiles = await generateRepositoryFilesWithMistral(project_name || "Paper2Prod", allOutputs);
    if (!repoFiles) {
      repoFiles = fallbackFiles;
    }

    // Fill any missing required files from fallback to satisfy hard file contract.
    for (const filePath of REQUIRED_FILES) {
      if (!repoFiles[filePath] || !repoFiles[filePath].trim()) {
        repoFiles[filePath] = fallbackFiles[filePath];
      }
    }
    repoFiles["requirements.txt"] = sanitizeRequirements(
      repoFiles["requirements.txt"] ?? fallbackFiles["requirements.txt"],
    );

    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_DEMODAY_API_URI ||
      "https://orchestral-ai.onrender.com";

    let commitUrl: string | null = null;
    let githubError: string | null = null;
    const commitLogs: string[] = [];

    const defaultToken = process.env.GITHUB_DEFAULT_TOKEN ?? null;
    const resolvedToken = github_token ? github_token.trim() : defaultToken;
    const resolvedStreamlitToken =
      streamlit_token?.trim() || resolvedToken || null;

    let resolvedOwner: string | null = github_workspace_id ?? null;
    let resolvedRepo: string | null = null;
    let streamlitDeploy: StreamlitDeployResult = {
      enabled: Boolean(resolvedStreamlitToken),
      deployed: false,
      streamlitUrl: null,
      logs: [],
      error: resolvedStreamlitToken
        ? null
        : "Streamlit token not available. Connect Streamlit in /dashboard/onboard.",
      manageUrl: "https://share.streamlit.io/",
    };

    if (!resolvedToken) {
      githubError =
        "GitHub token not available. Connect GitHub in /dashboard/onboard and run again.";
      commitLogs.push(githubError);
    } else {
      const ghHeaders = {
        Authorization: `Bearer ${resolvedToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Orchestral-AI",
      };

      try {
        commitLogs.push("Authenticating with GitHub...");
        const userResp = await fetchWithTimeout("https://api.github.com/user", {
          headers: ghHeaders,
        });
        if (!userResp.ok) {
          const txt = await userResp.text();
          githubError = `GitHub auth error ${userResp.status}: ${txt.slice(0, 180)}`;
          commitLogs.push(githubError);
        } else {
          const ghUser = (await userResp.json()) as { login: string };
          resolvedOwner = ghUser.login;
          resolvedRepo = buildRepositoryName(project_name || "paper2prod");
          commitLogs.push(`Using GitHub owner "${resolvedOwner}".`);
          commitLogs.push(`Preparing repository "${resolvedRepo}".`);

          const createResp = await fetchWithTimeout("https://api.github.com/user/repos", {
            method: "POST",
            headers: ghHeaders,
            body: JSON.stringify({
              name: resolvedRepo,
              description: `Repository generated by Orchestral AI for ${project_name}`,
              private: false,
              auto_init: false,
            }),
          });

          if (!createResp.ok && createResp.status !== 422) {
            const txt = await createResp.text();
            githubError = `Failed to create repo \"${resolvedRepo}\" (${createResp.status}): ${txt.slice(0, 200)}`;
            commitLogs.push(githubError);
          } else {
            if (createResp.status === 422) {
              commitLogs.push(`Repository "${resolvedRepo}" already exists. Updating files.`);
            } else {
              commitLogs.push(`Repository "${resolvedRepo}" created.`);
            }
            const pushFile = async (filePath: string, content: string): Promise<string> => {
              const apiUrl = `https://api.github.com/repos/${resolvedOwner}/${resolvedRepo}/contents/${filePath}`;

              let sha: string | undefined;
              const refreshSha = async () => {
                try {
                  const checkRes = await fetchWithTimeout(apiUrl, {
                    headers: ghHeaders,
                  });
                  if (checkRes.ok) {
                    const existing = (await checkRes.json()) as { sha?: string };
                    sha = existing.sha;
                  } else if (checkRes.status === 404) {
                    sha = undefined;
                  }
                } catch {
                  // ignore metadata fetch errors and let PUT fail with details
                }
              };

              await refreshSha();

              for (let attempt = 0; attempt < 3; attempt += 1) {
                const putBody: Record<string, unknown> = {
                  message: `[Orchestral AI] Generate repository files for ${project_name}`,
                  content: toBase64(content),
                };
                if (sha) putBody.sha = sha;

                const putRes = await fetchWithTimeout(apiUrl, {
                  method: "PUT",
                  headers: ghHeaders,
                  body: JSON.stringify(putBody),
                });

                if (putRes.ok) {
                  const data = (await putRes.json()) as {
                    content?: { html_url?: string };
                  };
                  return (
                    data?.content?.html_url ??
                    `https://github.com/${resolvedOwner}/${resolvedRepo}`
                  );
                }

                const bodyText = await putRes.text();
                const isConflict =
                  putRes.status === 409 &&
                  bodyText.toLowerCase().includes("reference already exists");
                if (!isConflict || attempt === 2) {
                  throw new Error(
                    `GitHub ${putRes.status} on ${filePath}: ${bodyText.slice(0, 300)}`,
                  );
                }

                commitLogs.push(
                  `GitHub ref conflict on ${filePath}, retrying...`,
                );
                await refreshSha();
              }

              throw new Error(`GitHub push failed on ${filePath} after retries.`);
            };

            commitLogs.push(
              `Pushing ${REQUIRED_FILES.length} files to GitHub...`,
            );
            let firstUrl: string | null = null;
            for (const filePath of REQUIRED_FILES) {
              const url = await pushFile(filePath, repoFiles[filePath]);
              if (!firstUrl) firstUrl = url;
            }

            commitUrl =
              firstUrl ??
              `https://github.com/${resolvedOwner}/${resolvedRepo}`;
            commitLogs.push("GitHub push completed.");
          }
        }
      } catch (err) {
        githubError = err instanceof Error ? err.message : "Unknown GitHub error";
        commitLogs.push(`GitHub push error: ${githubError}`);
      }
    }

    if (resolvedToken && resolvedOwner) {
      fetchWithTimeout(`${backendUrl}/mcp/github/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mcp_server_url: "https://api.github.com",
          workspace_team_id: resolvedOwner,
          access_token: resolvedToken,
        }),
      }).catch(() => {
        // best effort
      });
    }

    if (resolvedOwner && resolvedRepo && commitUrl) {
      if (!resolvedStreamlitToken) {
        streamlitDeploy = {
          ...streamlitDeploy,
          enabled: false,
          error:
            "Streamlit token not available. Connect Streamlit in /dashboard/onboard.",
        };
      } else {
        streamlitDeploy = await deployToStreamlit({
          backendUrl,
          owner: resolvedOwner,
          repo: resolvedRepo,
          token: resolvedStreamlitToken,
          workspaceId: streamlit_workspace_id ?? resolvedOwner,
        });
      }
    }

    return NextResponse.json({
      commitUrl,
      repoUrl:
        resolvedOwner && resolvedRepo
          ? `https://github.com/${resolvedOwner}/${resolvedRepo}`
          : null,
      githubError,
      commitLogs,
      streamlitDeploy,
      files: repoFiles,
      requiredFiles: REQUIRED_FILES,
    });
  } catch (err) {
    console.error("[agents/commit] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
