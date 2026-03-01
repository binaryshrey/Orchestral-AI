import { NextRequest, NextResponse } from "next/server";
import { Mistral } from "@mistralai/mistralai";
import {
  fetchRecentAgentMemory,
  recordAgentMemoryError,
} from "@/lib/agentMemory";
import {
  buildScopedProjectDescription,
  renderBaseProjectSystemPrompt,
  resolveBaseProjectSystemPrompt,
} from "@/lib/projectScoping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type LlmProvider = "mistral" | "grok";
type CommitMode = "preview" | "publish";
type GenerationProfile = "simple" | "standard";

interface TaskResult {
  taskId: string;
  taskName: string;
  agentName: string;
  status: "completed" | "failed";
  output: string;
  error?: string;
}

interface AgentSummary {
  id: string;
  name: string;
}

const OUTPUT_FILES = [
  "app.py",
  "requirements.txt",
  "README.md",
] as const;

type RepoFiles = Record<string, string>;
type ChunkSpec = {
  id: string;
  files: string[];
};
type ModelGenerationResult = {
  files: RepoFiles | null;
  error: string | null;
  rawPreview?: string;
  validationErrors?: string[];
  logs?: string[];
};
type StreamlitDeployResult = {
  enabled: boolean;
  deployed: boolean;
  streamlitUrl: string | null;
  logs: string[];
  error: string | null;
  accessVerified?: boolean;
  manageUrl?: string | null;
};

const REQUIRED_PACKAGES = ["streamlit", "numpy", "pandas", "plotly"] as const;

const EXTERNAL_TIMEOUT_MS = 25_000;
const MODEL_TIMEOUT_MS = 90_000;
const STREAMLIT_CHECK_TIMEOUT_MS = 12_000;
const MODEL_MAX_RETRIES = 2;
const SIMPLE_PROFILE_MAX_RETRIES = 3;
const SIMPLE_MISTRAL_MODEL =
  process.env.MISTRAL_SIMPLE_MODEL?.trim() || "mistral-small-latest";
const STANDARD_MISTRAL_MODEL =
  process.env.MISTRAL_MODEL?.trim() || "mistral-large-latest";
const DEFAULT_GROK_MODEL = process.env.GROK_MODEL?.trim() || "grok-3-mini";
const GROK_BASE_URL = process.env.GROK_BASE_URL?.trim() || "https://api.x.ai/v1";
const OUTPUT_CHUNK_SPEC: ChunkSpec = {
  id: "minimal_app_bundle",
  files: [...OUTPUT_FILES],
};

function resolveLlmProvider(value: unknown): LlmProvider {
  return value === "grok" ? "grok" : "mistral";
}

function resolveCommitMode(value: unknown): CommitMode {
  return value === "preview" ? "preview" : "publish";
}

function resolveGenerationProfile(value: unknown): GenerationProfile {
  return value === "standard" ? "standard" : "simple";
}

function buildOutputContractAppendix(outputFiles: readonly string[]): string {
  return `OUTPUT CONTRACT (STRICT):
- Generate ONLY these files:
${outputFiles.map((path) => `- ${path}`).join("\n")}
- Put all runtime logic, equations, helpers, and simulation code directly in app.py.
- Do not import local modules such as formulas.py, simulation.py, optimizer.py, or utils.py.
- requirements.txt must contain package names only (no versions, no specifiers).
- Missing output files are a hard failure.`;
}

function resolveGrokApiKey(): string | null {
  return process.env.GROK_API_KEY ?? process.env.XAI_API_KEY ?? null;
}

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

function toBase64(content: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(content, "utf-8").toString("base64");
  }
  return btoa(unescape(encodeURIComponent(content)));
}

function clipForPrompt(input: string, max: number): string {
  if (!input) return "";
  if (input.length <= max) return input;
  return `${input.slice(0, max)}\n...[truncated]`;
}

function summarizeGeneratedFiles(files: RepoFiles, previewChars = 260): string {
  const entries = Object.entries(files);
  if (entries.length === 0) return "No previous files generated yet.";
  return entries
    .map(([path, content]) => {
      const preview = clipForPrompt(
        content.replace(/\s+/g, " ").trim(),
        previewChars,
      );
      return `- ${path}: ${preview}`;
    })
    .join("\n");
}

function buildChunkPrompt(params: {
  projectName: string;
  context: string;
  scopedDescription?: string;
  documentExcerpt?: string;
  pdfUrl?: string;
  chunk: ChunkSpec;
  generatedFiles: RepoFiles;
  generationProfile: GenerationProfile;
  previousAttemptError?: string;
}): string {
  const {
    projectName,
    context,
    scopedDescription,
    documentExcerpt,
    pdfUrl,
    chunk,
    generatedFiles,
    generationProfile,
    previousAttemptError,
  } = params;
  const limits =
    generationProfile === "simple"
      ? {
          scoped: 3_000,
          ocr: 2_500,
          context: 5_000,
          generatedPreview: 140,
        }
      : {
          scoped: 8_000,
          ocr: 6_000,
          context: 14_000,
          generatedPreview: 260,
        };
  const scopedSection = scopedDescription
    ? `\nPROJECT SCOPING CONTEXT:\n${clipForPrompt(scopedDescription, limits.scoped)}\n`
    : "";
  const ocrSection = documentExcerpt
    ? `\nDOCUMENT OCR EXCERPT:\n${clipForPrompt(documentExcerpt, limits.ocr)}\n`
    : "";
  const pdfSection = pdfUrl ? `\nDOCUMENT URL:\n${pdfUrl}\n` : "";
  const contextSection = clipForPrompt(context, limits.context);
  const profileRules =
    generationProfile === "simple"
      ? `SIMPLE BUILD PROFILE:
- Keep implementation concise and minimal while fully working.
- Prefer straightforward functions over complex abstractions.
- Avoid adding optional features beyond requirements.
- Keep docs concise and operational.`
      : `STANDARD BUILD PROFILE:
- Full production-ready implementation with clear modularity and documentation.`;

  const attemptCorrection = previousAttemptError
    ? `\nPREVIOUS ATTEMPT ISSUE TO FIX:\n${previousAttemptError}\n`
    : "";

  return `Generate repository files for project "${projectName}".

SOURCE OF TRUTH:
- Use only the current project context below.
- Do not invent unrelated domain assumptions.
- If uncertain, choose conservative defaults and document them.

CONTEXT:
${contextSection}
${scopedSection}${ocrSection}${pdfSection}

${profileRules}

CURRENTLY GENERATED FILES (REFERENCE, DO NOT REWRITE UNLESS LISTED BELOW):
${summarizeGeneratedFiles(generatedFiles, limits.generatedPreview)}

CHUNK CONTRACT:
- Generate ONLY these files in this chunk:
${chunk.files.map((f) => `- ${f}`).join("\n")}
- Every listed file must be present and non-empty.
- Do not include any files outside this chunk.
- app.py must be fully self-contained (no local module imports).
- requirements.txt must list package names only, one per line, no versions.
- Keep code short and clear, with no TODOs/pseudocode/placeholders.

OUTPUT FORMAT:
Return ONLY JSON:
{
  "files": {
    "${chunk.files[0]}": "..."
  }
}
${attemptCorrection}
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

function parseChunkFilesFromModelText(
  text: string,
  expectedFiles: string[],
): ModelGenerationResult {
  const parsed = parseJsonObject(text) as
    | { files?: Record<string, unknown> }
    | Record<string, unknown>
    | null;

  const filesNode =
    parsed && typeof parsed === "object" && "files" in parsed
      ? (parsed as { files?: Record<string, unknown> }).files
      : parsed;

  if (!filesNode || typeof filesNode !== "object") {
    return {
      files: null,
      error: "Model response did not include a valid files object.",
      rawPreview: text.slice(0, 1200),
    };
  }

  const files: RepoFiles = {};
  for (const path of expectedFiles) {
    const value = (filesNode as Record<string, unknown>)[path];
    if (typeof value === "string" && value.trim()) {
      files[path] = value;
    }
  }

  const missing = expectedFiles.filter((path) => !files[path]?.trim());
  if (missing.length > 0) {
    return {
      files: null,
      error: `Model output is missing expected chunk files: ${missing.join(", ")}`,
      validationErrors: missing,
      rawPreview: text.slice(0, 1200),
    };
  }

  return {
    files,
    error: null,
  };
}

function validateOutputFiles(
  files: RepoFiles,
  outputFiles: readonly string[],
): string[] {
  return outputFiles.filter(
    (path) => typeof files[path] !== "string" || !files[path].trim(),
  );
}

function isValidRepoFiles(
  files: RepoFiles,
  outputFiles: readonly string[],
): boolean {
  return validateOutputFiles(files, outputFiles).length === 0;
}

function isRetryableModelError(message: string): boolean {
  const value = message.toLowerCase();
  return (
    value.includes("timed out") ||
    value.includes("timeout") ||
    value.includes("rate limit") ||
    value.includes("429") ||
    value.includes("502") ||
    value.includes("503") ||
    value.includes("504") ||
    value.includes("network") ||
    value.includes("fetch failed") ||
    value.includes("socket")
  );
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function sanitizeRequirements(content: string): string {
  const normalizedLines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const packageNames = new Set<string>();

  for (const line of normalizedLines) {
    const pkgMatch = line.match(/^([A-Za-z0-9_.-]+)/);
    if (!pkgMatch) {
      continue;
    }
    packageNames.add(pkgMatch[1].toLowerCase());
  }

  REQUIRED_PACKAGES.forEach((name) => packageNames.add(name));

  const ordered = [
    ...REQUIRED_PACKAGES,
    ...Array.from(packageNames).filter(
      (name) => !REQUIRED_PACKAGES.includes(name as (typeof REQUIRED_PACKAGES)[number]),
    ),
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

async function checkRepoExists(
  owner: string,
  repo: string,
  headers: Record<string, string>,
): Promise<boolean> {
  const resp = await fetchWithTimeout(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    { headers },
  );
  if (resp.status === 404) return false;
  if (resp.ok) return true;

  const txt = await resp.text();
  throw new Error(
    `Repo existence check failed (${resp.status}) for ${owner}/${repo}: ${txt.slice(0, 160)}`,
  );
}

function parseSuggestedSuffixFromMemory(baseName: string, messages: string[]): number {
  let maxSuffix = 0;
  const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${escapedBase}-(\\d+)`, "gi");
  for (const message of messages) {
    let match: RegExpExecArray | null = regex.exec(message);
    while (match) {
      const value = Number.parseInt(match[1], 10);
      if (Number.isFinite(value)) {
        maxSuffix = Math.max(maxSuffix, value);
      }
      match = regex.exec(message);
    }
  }
  return maxSuffix + 1;
}

async function findAvailableRepoName(params: {
  owner: string;
  baseName: string;
  headers: Record<string, string>;
  startSuffix?: number;
}): Promise<{ name: string; collisionDetected: boolean }> {
  const { owner, baseName, headers } = params;
  const startSuffix = Math.max(params.startSuffix ?? 1, 1);

  const baseExists = await checkRepoExists(owner, baseName, headers);
  if (!baseExists) {
    return { name: baseName, collisionDetected: false };
  }

  for (let suffix = startSuffix; suffix < startSuffix + 100; suffix += 1) {
    const candidate = `${baseName}-${suffix}`;
    const exists = await checkRepoExists(owner, candidate, headers);
    if (!exists) {
      return { name: candidate, collisionDetected: true };
    }
  }

  throw new Error(
    `Unable to find an available repository name for base "${baseName}"`,
  );
}

async function requestJsonFromProvider(params: {
  provider: LlmProvider;
  baseSystemPrompt: string;
  userPrompt: string;
  generationProfile: GenerationProfile;
  mistralClient: Mistral | null;
}): Promise<string> {
  if (params.provider === "mistral") {
    if (!params.mistralClient) {
      throw new Error("MISTRAL_API_KEY is not configured.");
    }
    const model =
      params.generationProfile === "simple"
        ? SIMPLE_MISTRAL_MODEL
        : STANDARD_MISTRAL_MODEL;
    const maxTokens = params.generationProfile === "simple" ? 3600 : 8000;
    const result = await params.mistralClient.chat.complete({
      model,
      messages: [
        { role: "system", content: params.baseSystemPrompt },
        { role: "user", content: params.userPrompt },
      ],
      temperature: 0.2,
      maxTokens,
      responseFormat: { type: "json_object" },
    });
    return normalizeContent(result.choices?.[0]?.message?.content);
  }

  const grokApiKey = resolveGrokApiKey();
  if (!grokApiKey) {
    throw new Error("GROK_API_KEY/XAI_API_KEY is not configured.");
  }

  const response = await fetchWithTimeout(
    `${GROK_BASE_URL}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${grokApiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_GROK_MODEL,
        messages: [
          { role: "system", content: params.baseSystemPrompt },
          { role: "user", content: params.userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 8000,
      }),
    },
    MODEL_TIMEOUT_MS,
  );

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Grok API error ${response.status}: ${responseText.slice(0, 300)}`,
    );
  }
  const payload = parseJsonObject(responseText) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  } | null;
  return normalizeContent(payload?.choices?.[0]?.message?.content);
}

async function generateRepositoryFilesWithProvider(params: {
  projectName: string;
  context: string;
  baseSystemPrompt: string;
  provider: LlmProvider;
  generationProfile: GenerationProfile;
  outputFiles: readonly string[];
  chunkSpecs: ChunkSpec[];
  scopedDescription?: string;
  documentExcerpt?: string;
  pdfUrl?: string;
}): Promise<ModelGenerationResult> {
  const logs: string[] = [];
  const generatedFiles: RepoFiles = {};
  const maxRetries =
    params.generationProfile === "simple"
      ? SIMPLE_PROFILE_MAX_RETRIES
      : MODEL_MAX_RETRIES;

  try {
    const mistralApiKey = process.env.MISTRAL_API_KEY;
    const mistralClient =
      params.provider === "mistral" && mistralApiKey
        ? new Mistral({ apiKey: mistralApiKey })
        : null;

    if (params.provider === "mistral" && !mistralClient) {
      return {
        files: null,
        error: "MISTRAL_API_KEY is not configured.",
        logs,
      };
    }

    for (const chunk of params.chunkSpecs) {
      let chunkDone = false;
      let lastError = "";
      let lastRaw = "";

      for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        const prompt = buildChunkPrompt({
          projectName: params.projectName,
          context: params.context,
          scopedDescription: params.scopedDescription,
          documentExcerpt: params.documentExcerpt,
          pdfUrl: params.pdfUrl,
          chunk,
          generatedFiles,
          generationProfile: params.generationProfile,
          previousAttemptError: attempt > 1 ? lastError : undefined,
        });
        try {
          logs.push(
            `Generating chunk "${chunk.id}" (attempt ${attempt}/${maxRetries})...`,
          );
          const text = await requestJsonFromProvider({
            provider: params.provider,
            baseSystemPrompt: params.baseSystemPrompt,
            userPrompt: prompt,
            generationProfile: params.generationProfile,
            mistralClient,
          });
          lastRaw = text;
          const parsed = parseChunkFilesFromModelText(text, chunk.files);
          if (!parsed.files) {
            lastError = parsed.error ?? "Invalid chunk response.";
            throw new Error(lastError);
          }
          Object.assign(generatedFiles, parsed.files);
          logs.push(
            `Chunk "${chunk.id}" generated (${chunk.files.length} file(s)).`,
          );
          chunkDone = true;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          logs.push(
            `Chunk "${chunk.id}" failed on attempt ${attempt}: ${lastError}`,
          );
          if (attempt >= maxRetries) {
            break;
          }
          const retryDelayMs = isRetryableModelError(lastError)
            ? 2_000 * attempt + Math.floor(Math.random() * 500)
            : 900 * attempt;
          await delay(retryDelayMs);
        }
      }

      if (!chunkDone) {
        return {
          files: null,
          error: `Failed to generate chunk "${chunk.id}": ${lastError}`,
          validationErrors: chunk.files.filter((path) => !generatedFiles[path]),
          rawPreview: lastRaw.slice(0, 1200),
          logs,
        };
      }
    }

    const validationErrors = validateOutputFiles(
      generatedFiles,
      params.outputFiles,
    );
    if (
      validationErrors.length > 0 ||
      !isValidRepoFiles(generatedFiles, params.outputFiles)
    ) {
      return {
        files: null,
        error: "Model output is missing expected output files after generation.",
        validationErrors,
        logs,
      };
    }

    logs.push("All repository chunks generated successfully.");
    return {
      files: generatedFiles,
      error: null,
      logs,
    };
  } catch (err) {
    console.error("[agents/commit] model generation error:", err);
    return {
      files: null,
      error: err instanceof Error ? err.message : String(err),
      logs,
    };
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
    streamlitUrl: null,
    logs,
    error: null,
    manageUrl: "https://share.streamlit.io/",
  };

  const collectStreamlitUrls = (payload: unknown): string[] => {
    const urls: string[] = [];
    const maybePush = (value: unknown) => {
      if (typeof value !== "string") return;
      const trimmed = value.trim();
      if (!trimmed) return;
      if (!/^https?:\/\//i.test(trimmed)) return;
      if (!/streamlit/i.test(trimmed)) return;
      urls.push(trimmed);
    };
    if (!payload || typeof payload !== "object") return urls;
    const record = payload as Record<string, unknown>;
    maybePush(record.streamlit_url);
    maybePush(record.app_url);
    maybePush(record.public_url);
    maybePush(record.url);
    maybePush(record.appUrl);
    if (record.app && typeof record.app === "object") {
      const app = record.app as Record<string, unknown>;
      maybePush(app.streamlit_url);
      maybePush(app.app_url);
      maybePush(app.public_url);
      maybePush(app.url);
    }
    if (Array.isArray(record.apps)) {
      for (const app of record.apps) {
        if (app && typeof app === "object") {
          const appRecord = app as Record<string, unknown>;
          maybePush(appRecord.streamlit_url);
          maybePush(appRecord.app_url);
          maybePush(appRecord.public_url);
          maybePush(appRecord.url);
        }
      }
    }
    return urls;
  };

  const probeStreamlitUrl = async (url: string) => {
    try {
      const verifyResp = await fetchWithTimeout(
        url,
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
      const authGated =
        redirectedToAuth ||
        verifyHtml.includes("do not have access to this app or it does not exist") ||
        verifyHtml.includes("sign out and sign in with a different account") ||
        verifyHtml.includes("source control account");
      const notFound =
        verifyResp.status === 404 ||
        verifyHtml.includes("page not found") ||
        verifyHtml.includes("not found");
      return {
        url,
        ok: verifyResp.ok && !authGated && !notFound,
        authGated,
        notFound,
        status: verifyResp.status,
      };
    } catch {
      return {
        url,
        ok: false,
        authGated: false,
        notFound: false,
        status: 0,
      };
    }
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
      app_url?: string;
      public_url?: string;
      url?: string;
      commit_sha?: string;
    };
    logs.push(
      `Streamlit deploy triggered (${deployData.status ?? "accepted"}${deployData.commit_sha ? `, commit ${deployData.commit_sha.slice(0, 7)}` : ""}).`,
    );
    logs.push(
      "Build logs are available on Streamlit Cloud dashboard while deployment is in progress.",
    );

    const candidates = new Set<string>(collectStreamlitUrls(deployData));
    // Optional MCP read-back by owner/repo to avoid relying on guessed URLs.
    try {
      const appResp = await fetchWithTimeout(
        `${backendUrl}/mcp/streamlit/apps/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
      );
      if (appResp.ok) {
        const appPayload = (await appResp.json()) as unknown;
        for (const url of collectStreamlitUrls(appPayload)) {
          candidates.add(url);
        }
      }
    } catch {
      // best effort
    }

    // Probe conventional URL only for verification fallback; do not trust unless it resolves.
    candidates.add(`https://${repo}.streamlit.app`);

    const candidateList = Array.from(candidates);
    logs.push(
      candidateList.length > 0
        ? `Checking Streamlit app URLs: ${candidateList.join(", ")}`
        : "No Streamlit URL returned by deploy APIs yet.",
    );

    let sawAuthGated = false;
    for (const candidate of candidateList) {
      const probe = await probeStreamlitUrl(candidate);
      if (probe.ok) {
        result.streamlitUrl = candidate;
        result.deployed = true;
        result.accessVerified = true;
        result.error = null;
        logs.push(`Streamlit access check passed for ${candidate}.`);
        return result;
      }
      if (probe.authGated) {
        sawAuthGated = true;
        result.streamlitUrl = candidate;
        logs.push(`Streamlit URL is auth-gated: ${candidate}`);
        continue;
      }
      if (probe.notFound) {
        logs.push(`Streamlit URL not found yet (404): ${candidate}`);
        continue;
      }
      if (probe.status > 0) {
        logs.push(`Streamlit URL check returned HTTP ${probe.status}: ${candidate}`);
      } else {
        logs.push(`Streamlit URL check failed (network/timeout): ${candidate}`);
      }
    }

    result.deployed = false;
    result.accessVerified = false;
    if (sawAuthGated) {
      result.error =
        "Streamlit app exists but is auth-gated. Set Sharing to public or grant account access.";
      logs.push(
        "Action: Streamlit Cloud > App Settings > Sharing > 'This app is public and searchable'.",
      );
    } else {
      result.error =
        `Streamlit deploy was triggered for ${owner}/${repo}, but no reachable app URL was confirmed yet.`;
      logs.push(
        `Action: verify the app in Streamlit Cloud for repo ${owner}/${repo} and rerun once build completes.`,
      );
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
      description,
      pdf_url,
      base_system_prompt,
      document_excerpt,
      llm_provider,
      mode,
      repo_files,
      generation_profile,
      session_id,
      agents,
      github_token,
      github_workspace_id,
      streamlit_token,
      streamlit_workspace_id,
    }: {
      results: TaskResult[];
      project_name: string;
      description?: string;
      pdf_url?: string;
      base_system_prompt?: string;
      document_excerpt?: string;
      llm_provider?: LlmProvider;
      mode?: CommitMode;
      repo_files?: RepoFiles;
      generation_profile?: GenerationProfile;
      session_id?: string;
      agents?: AgentSummary[];
      github_token?: string;
      github_workspace_id?: string;
      streamlit_token?: string;
      streamlit_workspace_id?: string;
    } = body;

    if (!Array.isArray(results)) {
      return NextResponse.json({ error: "results array required" }, { status: 400 });
    }

    const resolvedMode = resolveCommitMode(mode);
    const resolvedGenerationProfile = resolveGenerationProfile(generation_profile);
    const outputFiles = [...OUTPUT_FILES];
    const chunkSpecs = [OUTPUT_CHUNK_SPEC];

    const completedResults = results.filter((r) => r.status === "completed");
    const allOutputs = completedResults
      .map((r) => `## ${r.taskName} (${r.agentName})\n${r.output}`)
      .join("\n\n");

    const resolvedProjectName = project_name || "Paper2Prod";
    const resolvedBaseSystemPrompt = resolveBaseProjectSystemPrompt({
      projectName: resolvedProjectName,
      providedBasePrompt: base_system_prompt,
    });
    const profileBaseSystemPrompt =
      resolvedGenerationProfile === "simple"
        ? renderBaseProjectSystemPrompt(resolvedProjectName)
        : resolvedBaseSystemPrompt;
    const effectiveBaseSystemPrompt = `${profileBaseSystemPrompt}\n\n${buildOutputContractAppendix(outputFiles)}`;
    const scopedDescription = buildScopedProjectDescription({
      projectName: resolvedProjectName,
      description,
      documentOcrText: document_excerpt,
    });
    const resolvedLlmProvider = resolveLlmProvider(llm_provider);
    let repoFiles: RepoFiles | null = null;
    let generation: ModelGenerationResult | null = null;
    const usingProvidedFiles =
      resolvedMode === "publish" &&
      repo_files &&
      typeof repo_files === "object" &&
      !Array.isArray(repo_files);

    if (usingProvidedFiles) {
      const provided = repo_files as RepoFiles;
      const missing = validateOutputFiles(provided, outputFiles);
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: `Provided repo_files are missing expected output files: ${missing.join(", ")}`,
            generationDetails: {
              usedModelOutput: false,
              usedProvidedFiles: true,
              usedFallback: false,
              error: "Provided repo_files did not pass validation.",
              validationErrors: missing,
              rawPreview: null,
              provider: resolvedLlmProvider,
              mode: resolvedMode,
            },
            commitLogs: ["Publish aborted: provided preview files are incomplete."],
          },
          { status: 400 },
        );
      }
      repoFiles = { ...provided };
    } else {
      generation = await generateRepositoryFilesWithProvider({
        projectName: resolvedProjectName,
        context: allOutputs,
        baseSystemPrompt: effectiveBaseSystemPrompt,
        provider: resolvedLlmProvider,
        generationProfile: resolvedGenerationProfile,
        outputFiles,
        chunkSpecs,
        scopedDescription,
        documentExcerpt: document_excerpt,
        pdfUrl: pdf_url,
      });
      repoFiles = generation.files;
    }

    const generationDetails = {
      usedModelOutput: Boolean(generation?.files),
      usedProvidedFiles: Boolean(usingProvidedFiles),
      usedFallback: false,
      error: generation?.error ?? null,
      validationErrors: generation?.validationErrors ?? [],
      rawPreview: generation?.rawPreview ?? null,
      provider: resolvedLlmProvider,
      mode: resolvedMode,
      generationProfile: resolvedGenerationProfile,
    };

    if (!repoFiles) {
      return NextResponse.json(
        {
          error:
            generation?.error ??
            "Repository generation failed before commit. No fallback was used.",
          generationDetails,
          commitLogs: [
            ...(generation?.logs ?? []),
            "Repository generation failed; publish aborted.",
            "No silent fallback was applied.",
          ],
        },
        { status: 502 },
      );
    }

    repoFiles = { ...repoFiles };
    repoFiles["requirements.txt"] = sanitizeRequirements(
      repoFiles["requirements.txt"] ?? "",
    );

    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_DEMODAY_API_URI ||
      "https://orchestral-ai.onrender.com";

    let commitUrl: string | null = null;
    let githubError: string | null = null;
    const commitLogs: string[] = [...(generation?.logs ?? [])];
    if (generationDetails.usedModelOutput) {
      commitLogs.push(
        `Repository files generated from ${resolvedLlmProvider} model output.`,
      );
    } else if (generationDetails.usedProvidedFiles) {
      commitLogs.push(
        "Using user-approved preview files for publish; no model regeneration performed.",
      );
    } else if (generationDetails.usedFallback) {
      commitLogs.push("Fallback repository template was used.");
    }
    if (generationDetails.error) {
      commitLogs.push(`Generation warning: ${generationDetails.error}`);
    }
    commitLogs.push(`Generation profile: ${resolvedGenerationProfile}.`);

    if (resolvedMode === "preview") {
      commitLogs.push(
        "Preview generation complete. Review files in UI and trigger Publish when ready.",
      );
      return NextResponse.json({
        mode: "preview",
        previewReady: true,
        files: repoFiles,
        outputFiles,
        generationDetails,
        commitLogs,
      });
    }

    const defaultToken = process.env.GITHUB_DEFAULT_TOKEN ?? null;
    const resolvedToken = github_token ? github_token.trim() : defaultToken;
    const resolvedStreamlitToken =
      streamlit_token?.trim() || resolvedToken || null;

    let resolvedOwner: string | null = github_workspace_id ?? null;
    let resolvedRepo: string | null = null;
    const devopsAgent =
      agents?.find((agent) => /devops/i.test(agent.name)) ??
      ({
        id: "agent_devops",
        name: "AI DevOps",
      } satisfies AgentSummary);
    const devopsAgentId = devopsAgent.id;
    const devopsAgentName = devopsAgent.name;
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
          const baseRepoName = buildRepositoryName(project_name || "paper2prod");
          const devopsMemories = await fetchRecentAgentMemory({
            projectName: project_name,
            agentId: devopsAgentId,
            limit: 12,
          });
          if (devopsMemories.length > 0) {
            commitLogs.push(
              `Loaded ${devopsMemories.length} memory event(s) for ${devopsAgentName}.`,
            );
          }
          const preferredSuffix = parseSuggestedSuffixFromMemory(
            baseRepoName,
            devopsMemories.map(
              (memory) =>
                `${memory.error_message} ${memory.remediation ?? ""}`.trim(),
            ),
          );
          const availableRepo = await findAvailableRepoName({
            owner: resolvedOwner,
            baseName: baseRepoName,
            headers: ghHeaders,
            startSuffix: preferredSuffix,
          });
          resolvedRepo = availableRepo.name;
          commitLogs.push(`Using GitHub owner "${resolvedOwner}".`);
          if (availableRepo.collisionDetected) {
            commitLogs.push(
              `Repo name collision detected for "${baseRepoName}". Using "${resolvedRepo}".`,
            );
            await recordAgentMemoryError({
              projectName: project_name,
              sessionId: session_id ?? null,
              agentId: devopsAgentId,
              agentName: devopsAgentName,
              taskName: "Repository provisioning",
              stage: "deployment",
              errorType: "github_repo_exists",
              errorMessage: `Repository "${baseRepoName}" already exists under owner "${resolvedOwner}".`,
              remediation: `Use "${resolvedRepo}" as the next available repository name.`,
              context: {
                github_owner: resolvedOwner,
                original_repo_name: baseRepoName,
                selected_repo_name: resolvedRepo,
              },
            });
          }
          commitLogs.push(`Preparing repository "${resolvedRepo}".`);

          let repositoryCreated = false;
          for (let createAttempt = 0; createAttempt < 4; createAttempt += 1) {
            const createResp = await fetchWithTimeout(
              "https://api.github.com/user/repos",
              {
                method: "POST",
                headers: ghHeaders,
                body: JSON.stringify({
                  name: resolvedRepo,
                  description: `Repository generated by Orchestral AI for ${project_name}`,
                  private: false,
                  auto_init: false,
                }),
              },
            );
            if (createResp.ok) {
              repositoryCreated = true;
              commitLogs.push(`Repository "${resolvedRepo}" created.`);
              break;
            }

            const txt = await createResp.text();
            if (createResp.status !== 422) {
              githubError = `Failed to create repo \"${resolvedRepo}\" (${createResp.status}): ${txt.slice(0, 200)}`;
              commitLogs.push(githubError);
              break;
            }

            await recordAgentMemoryError({
              projectName: project_name,
              sessionId: session_id ?? null,
              agentId: devopsAgentId,
              agentName: devopsAgentName,
              taskName: "Repository provisioning",
              stage: "deployment",
              errorType: "github_repo_exists",
              errorMessage: txt.slice(0, 400) || `Repository "${resolvedRepo}" already exists.`,
              remediation:
                "Auto-increment repository suffix and retry repository creation.",
              context: {
                github_owner: resolvedOwner,
                attempted_repo_name: resolvedRepo,
                attempt: createAttempt + 1,
              },
            });

            const suffixMatch = resolvedRepo.match(/-(\d+)$/);
            const nextSuffix = suffixMatch
              ? Number.parseInt(suffixMatch[1], 10) + 1
              : 2;
            const nextRepo = await findAvailableRepoName({
              owner: resolvedOwner,
              baseName: baseRepoName,
              headers: ghHeaders,
              startSuffix: nextSuffix,
            });
            resolvedRepo = nextRepo.name;
            commitLogs.push(
              `Repository already existed. Retrying with "${resolvedRepo}".`,
            );
          }

          if (!repositoryCreated) {
            if (!githubError) {
              githubError = "Unable to create a unique GitHub repository name.";
              commitLogs.push(githubError);
            }
          } else {
            if (!resolvedRepo) {
              throw new Error("Repository name was not resolved after creation.");
            }
            const targetRepo = resolvedRepo;
            const pushFile = async (filePath: string, content: string): Promise<string> => {
              const apiUrl = `https://api.github.com/repos/${resolvedOwner}/${targetRepo}/contents/${filePath}`;

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
                    `https://github.com/${resolvedOwner}/${targetRepo}`
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
              `Pushing ${outputFiles.length} files to GitHub...`,
            );
            let firstUrl: string | null = null;
            for (const filePath of outputFiles) {
              const url = await pushFile(filePath, repoFiles[filePath]);
              if (!firstUrl) firstUrl = url;
            }

            commitUrl =
              firstUrl ??
              `https://github.com/${resolvedOwner}/${targetRepo}`;
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
        if (streamlitDeploy.error) {
          await recordAgentMemoryError({
            projectName: project_name,
            sessionId: session_id ?? null,
            agentId: devopsAgentId,
            agentName: devopsAgentName,
            taskName: "Streamlit deployment",
            stage: "deployment",
            errorType: "streamlit_deploy_error",
            errorMessage: streamlitDeploy.error,
            remediation:
              "Use MCP returned URL only after verification; ensure repo linkage and sharing settings before retry.",
            context: {
              github_owner: resolvedOwner,
              github_repo: resolvedRepo,
              streamlit_url: streamlitDeploy.streamlitUrl,
            },
          });
        }
      }
    }

    return NextResponse.json({
      mode: "publish",
      commitUrl,
      repoUrl:
        resolvedOwner && resolvedRepo
          ? `https://github.com/${resolvedOwner}/${resolvedRepo}`
          : null,
      githubError,
      commitLogs,
      generationDetails,
      streamlitDeploy,
      files: repoFiles,
      outputFiles,
    });
  } catch (err) {
    console.error("[agents/commit] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
