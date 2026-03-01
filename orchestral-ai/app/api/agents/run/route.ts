import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

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

async function runTaskWithGemini(
  agent: Agent,
  task: Task,
  projectContext: string,
  previousOutputs: string,
  genAI: GoogleGenerativeAI,
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      temperature: agent.temperature ?? 0.4,
      maxOutputTokens: agent.max_tokens ?? 1200,
    },
  });

  const prompt = `You are an AI agent with the following profile:
- Name: ${agent.name}
- Role: ${agent.role}
- Goal: ${agent.goal}
- Backstory: ${agent.backstory}

Project Context:
${projectContext}

${previousOutputs ? `Previous agents have completed these tasks:\n${previousOutputs}\n` : ""}

Your assigned task: "${task.name}"
Task description: ${task.description}
Expected output format: ${task.expectedOutputFormat}

Execute this task thoroughly and produce a high-quality output. Be specific, actionable, and relevant to the project. Format your response in ${task.expectedOutputFormat} format.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
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
    }: {
      agents: Agent[];
      tasks: Task[];
      project_name: string;
      description?: string;
    } = body;

    if (!Array.isArray(agents) || !Array.isArray(tasks)) {
      return NextResponse.json(
        { error: "agents and tasks arrays are required" },
        { status: 400 },
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured" },
        { status: 500 },
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const agentMap = new Map<string, Agent>(agents.map((a) => [a.id, a]));

    const projectContext = `Project: ${project_name}\n${description ? `Description: ${description}` : ""}`;

    const results: TaskResult[] = [];
    let previousOutputsSummary = "";

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

      for (let attempt = 0; attempt <= task.retryPolicy; attempt++) {
        try {
          output = await runTaskWithGemini(
            agent,
            task,
            projectContext,
            previousOutputsSummary,
            genAI,
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
        previousOutputsSummary += `\n### ${task.name} (by ${agent.name})\n${output.slice(0, 400)}...\n`;
      }
    }

    // Compile full report for GitHub commit
    const fullReport = [
      `# Orchestral AI Execution Report`,
      `**Project:** ${project_name}`,
      `**Generated:** ${new Date().toISOString()}`,
      "",
      ...results.map(
        (r) =>
          `## ${r.taskName}\n**Agent:** ${r.agentName}\n**Status:** ${r.status}\n\n${r.output || r.error || ""}`,
      ),
    ].join("\n\n");

    // Attempt GitHub commit
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_DEMODAY_API_URI ||
      "https://orchestral-ai.onrender.com";

    const commitUrl = await commitToGitHub(
      fullReport,
      project_name,
      backendUrl,
    );

    return NextResponse.json({
      results,
      fullReport,
      commitUrl,
    });
  } catch (err) {
    console.error("[agents/run] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
