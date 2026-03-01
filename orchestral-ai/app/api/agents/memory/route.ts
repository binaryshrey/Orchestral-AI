import { NextRequest, NextResponse } from "next/server";
import { recordAgentMemoryError } from "@/lib/agentMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      project_name,
      session_id,
      agent_id,
      agent_name,
      task_id,
      task_name,
      stage,
      error_type,
      error_message,
      remediation,
      context,
    }: {
      project_name?: string;
      session_id?: string;
      agent_id?: string;
      agent_name?: string;
      task_id?: string;
      task_name?: string;
      stage?: "execution" | "deployment" | "commit";
      error_type?: string;
      error_message?: string;
      remediation?: string;
      context?: Record<string, unknown>;
    } = body ?? {};

    if (!project_name || !agent_id || !agent_name || !error_message) {
      return NextResponse.json(
        {
          error:
            "project_name, agent_id, agent_name, and error_message are required",
        },
        { status: 400 },
      );
    }

    await recordAgentMemoryError({
      projectName: project_name,
      sessionId: session_id ?? null,
      agentId: agent_id,
      agentName: agent_name,
      taskId: task_id ?? null,
      taskName: task_name ?? null,
      stage: stage ?? "execution",
      errorType: error_type,
      errorMessage: error_message,
      remediation: remediation ?? null,
      context: context ?? {},
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to persist memory" },
      { status: 500 },
    );
  }
}
