import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { MarkerType } from "@xyflow/react";

const AGENT_PLAN_PROMPT = (
  projectName: string,
  description: string,
  pdfUrl: string,
) => `You are an expert AI workflow architect. Given a startup project, design a multi-agent workflow with up to 5 specialized AI agents and their corresponding tasks.

Project Name: ${projectName}
Description: ${description}
${pdfUrl ? `Reference Document: ${pdfUrl}` : ""}

Create a tailored team of up to 5 agents that would be ideal for executing this specific project. Each agent should have a unique, relevant role. Generate exactly one task per agent.

Return ONLY valid JSON (no markdown, no code fences, no explanation) in this exact structure:
{
  "agents": [
    {
      "id": "agent_1",
      "name": "Agent Display Name",
      "role": "Specific role for this project",
      "goal": "Clear, specific goal relevant to the project",
      "backstory": "Why this agent is qualified and their approach",
      "model": "gemini-2.0-flash",
      "temperature": 0.3,
      "max_tokens": 1200,
      "tools": [],
      "memoryEnabled": true,
      "description": "One-sentence description of what this agent does"
    }
  ],
  "tasks": [
    {
      "id": "task_1",
      "name": "Task Name",
      "description": "Detailed description of what needs to be done for this specific project",
      "assignedAgentId": "agent_1",
      "executionType": "sequential",
      "expectedOutputFormat": "Markdown",
      "retryPolicy": 1
    }
  ]
}

Rules:
- Generate between 3–5 agents/tasks (not more than 5)
- Agent ids must be "agent_1", "agent_2", etc.
- Task ids must be "task_1", "task_2", etc.
- Each task's assignedAgentId must match an agent id exactly
- Make agent names, roles, goals, and task descriptions highly specific to: "${projectName}"
- Tasks should flow sequentially from planning → execution → review`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      project_name,
      description,
      pdf_url,
    }: { project_name: string; description: string; pdf_url?: string } = body;

    if (!project_name) {
      return NextResponse.json(
        { error: "project_name is required" },
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
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.4,
        responseMimeType: "application/json",
      },
    });

    const prompt = AGENT_PLAN_PROMPT(
      project_name,
      description || "",
      pdf_url || "",
    );

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    let parsed: { agents: unknown[]; tasks: unknown[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      // Attempt to extract JSON from text
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        return NextResponse.json(
          { error: "Gemini returned invalid JSON", raw: text },
          { status: 500 },
        );
      }
      parsed = JSON.parse(match[0]);
    }

    if (!Array.isArray(parsed.agents) || !Array.isArray(parsed.tasks)) {
      return NextResponse.json(
        { error: "Invalid plan structure from Gemini", raw: parsed },
        { status: 500 },
      );
    }

    // Build edges: agent → task + sequential task → task chain
    const edges: Array<{
      id: string;
      source: string;
      target: string;
      type: string;
      markerEnd: { type: string };
    }> = [];

    for (const task of parsed.tasks as Array<{
      id: string;
      assignedAgentId: string;
    }>) {
      edges.push({
        id: `edge_${task.assignedAgentId}_${task.id}`,
        source: task.assignedAgentId,
        target: task.id,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    }

    // Sequential task chain edges: task_1 → task_2 → task_3 …
    const taskList = parsed.tasks as Array<{ id: string }>;
    for (let i = 0; i < taskList.length - 1; i++) {
      edges.push({
        id: `edge_seq_${taskList[i].id}_${taskList[i + 1].id}`,
        source: taskList[i].id,
        target: taskList[i + 1].id,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    }

    // Build positions for a clean layout
    const agentCount = (parsed.agents as unknown[]).length;
    const colSpacing = 380;
    const positions: Record<string, { x: number; y: number }> = {};

    (parsed.agents as Array<{ id: string }>).forEach((agent, i) => {
      positions[agent.id] = {
        x: i * colSpacing + 80,
        y: 80,
      };
    });

    (parsed.tasks as Array<{ id: string }>).forEach((task, i) => {
      positions[task.id] = {
        x: i * colSpacing + 80,
        y: 360,
      };
    });

    void agentCount; // suppress unused warning

    const workflow = {
      agents: parsed.agents,
      tasks: parsed.tasks,
      edges,
      positions,
      savedAt: new Date().toISOString(),
      templateVersion: 2,
    };

    return NextResponse.json(workflow);
  } catch (err) {
    console.error("[agents/plan] error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
