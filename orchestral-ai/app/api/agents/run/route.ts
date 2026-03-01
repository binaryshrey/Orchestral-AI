import { NextRequest, NextResponse } from "next/server";
import { Mistral } from "@mistralai/mistralai";
import {
  fetchRecentAgentMemory,
  recordAgentMemoryError,
} from "@/lib/agentMemory";

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

async function runTaskWithMistral(
  agent: Agent,
  task: Task,
  projectContext: string,
  previousOutputs: string,
  memoryGuidance: string,
  client: InstanceType<typeof Mistral>,
): Promise<string> {
  const prompt = `You are an AI agent with the following profile:
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

  const result = await client.chat.complete({
    model: agent.model || "mistral-large-latest",
    messages: [{ role: "user", content: prompt }],
    temperature: agent.temperature ?? 0.4,
    maxTokens: agent.max_tokens ?? 1200,
  });

  const raw = result.choices?.[0]?.message?.content ?? "";
  return Array.isArray(raw)
    ? (raw as Array<{ text?: string }>).map((c) => c.text ?? "").join("")
    : raw;
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
      previousOutputsSummary,
      session_id,
    }: {
      agents: Agent[];
      tasks: Task[];
      project_name: string;
      description?: string;
      previousOutputsSummary?: string;
      session_id?: string;
    } = body;

    if (!Array.isArray(agents) || !Array.isArray(tasks)) {
      return NextResponse.json(
        { error: "agents and tasks arrays are required" },
        { status: 400 },
      );
    }

    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "MISTRAL_API_KEY is not configured" },
        { status: 500 },
      );
    }

    const client = new Mistral({ apiKey });
    const agentMap = new Map<string, Agent>(agents.map((a) => [a.id, a]));

    const projectContext = `Project: ${project_name}\n${description ? `Description: ${description}` : ""}`;

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
          output = await runTaskWithMistral(
            agent,
            task,
            projectContext,
            runningOutputsSummary,
            memoryGuidance,
            client,
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
