import { NextRequest, NextResponse } from "next/server";
import { Mistral } from "@mistralai/mistralai";
import {
  fetchRecentAgentMemory,
  recordAgentMemoryError,
} from "@/lib/agentMemory";
import {
  buildScopedProjectDescription,
  resolveBaseProjectSystemPrompt,
} from "@/lib/projectScoping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type LlmProvider = "mistral" | "grok";
const DEFAULT_GROK_MODEL = process.env.GROK_MODEL?.trim() || "grok-3-mini";
const GROK_BASE_URL = process.env.GROK_BASE_URL?.trim() || "https://api.x.ai/v1";
const GROK_TIMEOUT_MS = 90_000;

interface Agent {
  id: string;
  name: string;
  role: string;
  goal: string;
  backstory: string;
  model: string;
  temperature: number;
  max_tokens: number;
  tools: string[];
  memoryEnabled: boolean;
  description: string;
}

interface Task {
  id: string;
  name: string;
  description: string;
  assignedAgentId: string;
  executionType: string;
  expectedOutputFormat: string;
  retryPolicy: number;
}

interface TaskResult {
  taskId: string;
  taskName: string;
  agentName: string;
  status: "completed" | "failed";
  output: string;
  error?: string;
}

function resolveLlmProvider(value: unknown): LlmProvider {
  return value === "grok" ? "grok" : "mistral";
}

function resolveGrokApiKey(): string | null {
  return process.env.GROK_API_KEY ?? process.env.XAI_API_KEY ?? null;
}

function resolveGrokModel(model: string): string {
  if (model && /^grok/i.test(model)) return model;
  return DEFAULT_GROK_MODEL;
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

function buildTaskPrompt(
  agent: Agent,
  task: Task,
  projectContext: string,
  previousOutputs: string,
  memoryGuidance: string,
): string {
  return `You are an AI agent with the following profile:
- Name: ${agent.name}
- Role: ${agent.role}
- Goal: ${agent.goal}
- Backstory: ${agent.backstory}

Project Context:
${projectContext}

${previousOutputs ? `Previous agents have completed these tasks:\n${previousOutputs}\n` : ""}
${memoryGuidance ? `Agent memory from prior failures (do not repeat these mistakes):\n${memoryGuidance}\n` : ""}

Your assigned task: "${task.name}"
Task description: ${task.description}
Expected output format: ${task.expectedOutputFormat}

Execute this task thoroughly and produce a high-quality output. Be specific, actionable, and relevant to the project. Format your response in ${task.expectedOutputFormat} format.`;
}

async function runTaskWithMistral(
  agent: Agent,
  task: Task,
  baseSystemPrompt: string,
  projectContext: string,
  previousOutputs: string,
  memoryGuidance: string,
  client: InstanceType<typeof Mistral>,
): Promise<string> {
  const prompt = buildTaskPrompt(
    agent,
    task,
    projectContext,
    previousOutputs,
    memoryGuidance,
  );

  const result = await client.chat.complete({
    model: agent.model || "mistral-large-latest",
    messages: [
      { role: "system", content: baseSystemPrompt },
      { role: "user", content: prompt },
    ],
    temperature: agent.temperature ?? 0.4,
    maxTokens: agent.max_tokens ?? 1200,
  });

  const raw = result.choices?.[0]?.message?.content ?? "";
  return normalizeContent(raw);
}

async function runTaskWithGrok(
  agent: Agent,
  task: Task,
  baseSystemPrompt: string,
  projectContext: string,
  previousOutputs: string,
  memoryGuidance: string,
  apiKey: string,
): Promise<string> {
  const prompt = buildTaskPrompt(
    agent,
    task,
    projectContext,
    previousOutputs,
    memoryGuidance,
  );
  const model = resolveGrokModel(agent.model);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROK_TIMEOUT_MS);
  try {
    const response = await fetch(`${GROK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: baseSystemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: agent.temperature ?? 0.4,
        max_tokens: agent.max_tokens ?? 1200,
      }),
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `Grok API error ${response.status}: ${responseText.slice(0, 260)}`,
      );
    }

    let payload: unknown = null;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new Error("Grok returned a non-JSON response.");
    }

    const raw = (payload as { choices?: Array<{ message?: { content?: unknown } }> })
      .choices?.[0]?.message?.content;
    return normalizeContent(raw);
  } finally {
    clearTimeout(timeout);
  }
}

async function commitToGitHub(
  output: string,
  projectName: string,
  backendUrl: string,
): Promise<string | null> {
  try {
    // Check if GitHub is connected via the backend MCP
    const connResp = await fetch(`${backendUrl}/mcp/github/connection`);
    if (!connResp.ok) return null;

    const conn = await connResp.json();
    if (!conn?.token) return null;

    // Get user repos to find default one
    const reposResp = await fetch(`${backendUrl}/mcp/github/repos`);
    if (!reposResp.ok) return null;

    const repos = await reposResp.json();
    if (!Array.isArray(repos) || repos.length === 0) return null;

    const repo = repos[0] as { full_name: string };
    const [owner, repoName] = repo.full_name.split("/");

    const safeName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .slice(0, 40);
    const filePath = `orchestral-ai-plans/${safeName}-${Date.now()}.md`;

    const fileContent = btoa(unescape(encodeURIComponent(output)));

    const apiUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`;
    const commitResp = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${conn.token}`,
        "Content-Type": "application/json",
        "User-Agent": "Orchestral-AI",
      },
      body: JSON.stringify({
        message: `[Orchestral AI] Agent execution plan for ${projectName}`,
        content: fileContent,
      }),
    });

    if (!commitResp.ok) return null;

    const commitData = (await commitResp.json()) as {
      content?: { html_url?: string };
    };
    return commitData?.content?.html_url ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      agents,
      tasks,
      project_name,
      description,
      pdf_url,
      base_system_prompt,
      document_excerpt,
      llm_provider,
      previousOutputsSummary,
      session_id,
    }: {
      agents: Agent[];
      tasks: Task[];
      project_name: string;
      description?: string;
      pdf_url?: string;
      base_system_prompt?: string;
      document_excerpt?: string;
      llm_provider?: LlmProvider;
      previousOutputsSummary?: string;
      session_id?: string;
    } = body;

    if (!Array.isArray(agents) || !Array.isArray(tasks)) {
      return NextResponse.json(
        { error: "agents and tasks arrays are required" },
        { status: 400 },
      );
    }

    const provider = resolveLlmProvider(llm_provider);
    const mistralApiKey = process.env.MISTRAL_API_KEY;
    const grokApiKey = resolveGrokApiKey();
    if (provider === "mistral" && !mistralApiKey) {
      return NextResponse.json(
        { error: "MISTRAL_API_KEY is not configured" },
        { status: 500 },
      );
    }
    if (provider === "grok" && !grokApiKey) {
      return NextResponse.json(
        {
          error:
            "GROK_API_KEY/XAI_API_KEY is not configured for provider 'grok'.",
        },
        { status: 500 },
      );
    }

    const client =
      provider === "mistral" && mistralApiKey
        ? new Mistral({ apiKey: mistralApiKey })
        : null;
    const agentMap = new Map<string, Agent>(agents.map((a) => [a.id, a]));

    const resolvedBaseSystemPrompt = resolveBaseProjectSystemPrompt({
      projectName: project_name,
      providedBasePrompt: base_system_prompt,
    });
    const scopedDescription = buildScopedProjectDescription({
      projectName: project_name,
      description,
      documentOcrText: document_excerpt,
    });
    const projectContext = [
      `Project: ${project_name}`,
      `Scoped context:\n${scopedDescription}`,
      pdf_url ? `Document URL: ${pdf_url}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const results: TaskResult[] = [];
    let runningOutputsSummary = previousOutputsSummary ?? "";

    for (const task of tasks) {
      const agent = agentMap.get(task.assignedAgentId);
      if (!agent) {
        results.push({
          taskId: task.id,
          taskName: task.name,
          agentName: "Unassigned",
          status: "failed",
          output: "",
          error: "No agent assigned to this task",
        });
        continue;
      }

      let lastError = "";
      let succeeded = false;
      let output = "";
      const learnedErrors = await fetchRecentAgentMemory({
        projectName: project_name,
        agentId: agent.id,
        limit: 6,
      });
      const memoryGuidance = learnedErrors
        .map((memory, index) => {
          const remediation = memory.remediation
            ? ` | fix: ${memory.remediation}`
            : "";
          return `${index + 1}. ${memory.error_type}: ${memory.error_message}${remediation}`;
        })
        .join("\n");

      for (let attempt = 0; attempt <= task.retryPolicy; attempt++) {
        try {
          output =
            provider === "grok"
              ? await runTaskWithGrok(
                  agent,
                  task,
                  resolvedBaseSystemPrompt,
                  projectContext,
                  runningOutputsSummary,
                  memoryGuidance,
                  grokApiKey!,
                )
              : await runTaskWithMistral(
                  agent,
                  task,
                  resolvedBaseSystemPrompt,
                  projectContext,
                  runningOutputsSummary,
                  memoryGuidance,
                  client!,
                );
          succeeded = true;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
      }

      const result: TaskResult = {
        taskId: task.id,
        taskName: task.name,
        agentName: agent.name,
        status: succeeded ? "completed" : "failed",
        output: succeeded ? output : "",
        error: succeeded ? undefined : lastError,
      };

      results.push(result);

      if (succeeded) {
        runningOutputsSummary += `\n### ${task.name} (by ${agent.name})\n${output.slice(0, 400)}...\n`;
      } else {
        await recordAgentMemoryError({
          projectName: project_name,
          sessionId: session_id ?? null,
          agentId: agent.id,
          agentName: agent.name,
          taskId: task.id,
          taskName: task.name,
          stage: "execution",
          errorMessage: lastError || "Task execution failed without explicit error",
          remediation:
            "Review previous failures in memory and revise prompts/tool usage before retry.",
          context: {
            task_description: task.description,
            expected_output_format: task.expectedOutputFormat,
            retry_policy: task.retryPolicy,
          },
        });
      }
    }

    return NextResponse.json({
      results,
    });
  } catch (err) {
    console.error("[agents/run] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
