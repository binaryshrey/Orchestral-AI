import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type AgentMemoryStage = "execution" | "deployment" | "commit";

export interface AgentMemoryRecord {
  id: string;
  project_name: string;
  session_id: string | null;
  agent_id: string;
  agent_name: string;
  task_id: string | null;
  task_name: string | null;
  stage: AgentMemoryStage;
  error_type: string;
  error_signature: string;
  error_message: string;
  remediation: string | null;
  context: Record<string, unknown>;
  created_at: string;
}

type RecordAgentMemoryInput = {
  projectName: string;
  sessionId?: string | null;
  agentId: string;
  agentName: string;
  taskId?: string | null;
  taskName?: string | null;
  stage: AgentMemoryStage;
  errorType?: string;
  errorMessage: string;
  remediation?: string | null;
  context?: Record<string, unknown>;
};

function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function classifyAgentError(errorMessage: string): string {
  const text = errorMessage.toLowerCase();
  if (text.includes("already exists") || text.includes("name already exists")) {
    return "github_repo_exists";
  }
  if (text.includes("rate limit") || text.includes("429")) {
    return "rate_limit";
  }
  if (text.includes("timeout") || text.includes("timed out")) {
    return "timeout";
  }
  if (text.includes("auth") || text.includes("unauthorized") || text.includes("401")) {
    return "auth_error";
  }
  if (text.includes("permission") || text.includes("forbidden") || text.includes("403")) {
    return "permission_error";
  }
  return "runtime_error";
}

export function normalizeErrorSignature(errorType: string, errorMessage: string): string {
  const compact = `${errorType}:${errorMessage}`
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[0-9a-f]{7,40}/g, "")
    .replace(/\b\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return compact.slice(0, 220) || errorType;
}

export async function fetchRecentAgentMemory(params: {
  projectName: string;
  agentId: string;
  limit?: number;
}): Promise<AgentMemoryRecord[]> {
  if (!hasSupabaseConfig()) return [];

  try {
    const { data, error } = await supabaseAdmin
      .from("agent_error_memory")
      .select(
        "id,project_name,session_id,agent_id,agent_name,task_id,task_name,stage,error_type,error_signature,error_message,remediation,context,created_at",
      )
      .eq("project_name", params.projectName)
      .eq("agent_id", params.agentId)
      .order("created_at", { ascending: false })
      .limit(params.limit ?? 8);

    if (error) {
      console.warn("[agent-memory] fetch error:", error.message);
      return [];
    }

    return (data ?? []) as AgentMemoryRecord[];
  } catch (err) {
    console.warn(
      "[agent-memory] fetch exception:",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}

export async function recordAgentMemoryError(
  input: RecordAgentMemoryInput,
): Promise<void> {
  if (!hasSupabaseConfig()) return;

  const errorType = input.errorType ?? classifyAgentError(input.errorMessage);
  const signature = normalizeErrorSignature(errorType, input.errorMessage);

  try {
    const { error } = await supabaseAdmin.from("agent_error_memory").insert({
      project_name: input.projectName,
      session_id: input.sessionId ?? null,
      agent_id: input.agentId,
      agent_name: input.agentName,
      task_id: input.taskId ?? null,
      task_name: input.taskName ?? null,
      stage: input.stage,
      error_type: errorType,
      error_signature: signature,
      error_message: input.errorMessage,
      remediation: input.remediation ?? null,
      context: input.context ?? {},
    });

    if (error) {
      console.warn("[agent-memory] insert error:", error.message);
    }
  } catch (err) {
    console.warn(
      "[agent-memory] insert exception:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
