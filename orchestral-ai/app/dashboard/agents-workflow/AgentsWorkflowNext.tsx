"use client";

import {
  type ChangeEvent,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  Handle,
  MarkerType,
  MiniMap,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  XYPosition,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  Loader2,
  Plus,
  Play,
  Save,
  Upload,
  UserCog,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

type NodeKind = "agent" | "task";
type ExecutionType = "sequential" | "parallel";
type EditorTab = "editor" | "execution";
type ExecutionStatus = "idle" | "queued" | "running" | "completed" | "failed";

type ToolCategory =
  | "AI & Machine Learning"
  | "Automation"
  | "Database & Data"
  | "File & Document"
  | "Integrations"
  | "Web Scraping"
  | "Uncategorized";

type Agent = {
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
};

type Task = {
  id: string;
  name: string;
  description: string;
  assignedAgentId: string;
  executionType: ExecutionType;
  expectedOutputFormat: string;
  retryPolicy: number;
};

type Workflow = {
  agents: Agent[];
  tasks: Task[];
  edges: Edge[];
};

type PersistedWorkflow = Workflow & {
  positions?: Record<string, XYPosition>;
  savedAt?: string;
  templateVersion?: number;
};

type AgentNodeData = {
  kind: "agent";
  agent: Agent;
};

type TaskNodeData = {
  kind: "task";
  task: Task;
};

type AgentNode = Node<AgentNodeData, "agentNode">;
type TaskNode = Node<TaskNodeData, "taskNode">;
type WorkflowNode = AgentNode | TaskNode;
type WorkflowEdge = Edge;

type ToolDefinition = {
  id: string;
  name: string;
  type: string;
  category: ToolCategory;
  configSchema: string;
};

type EditorContextType = {
  agents: Agent[];
  toolsById: Record<string, ToolDefinition>;
  openNodeEditor: (nodeId: string) => void;
  updateAgentModel: (agentId: string, model: string) => void;
  updateAgentDescription: (agentId: string, description: string) => void;
  assignTaskAgent: (taskId: string, agentId: string) => void;
  updateTaskDescription: (taskId: string, description: string) => void;
  addToolToAgent: (agentId: string, toolId: string) => void;
};

const MODELS = ["Mistral Small", "Mistral Medium", "Codestral", "gpt-4o-mini"];
const WORKFLOW_TEMPLATE_VERSION = 2;

const CATEGORY_ORDER: ToolCategory[] = [
  "AI & Machine Learning",
  "Automation",
  "Database & Data",
  "File & Document",
  "Integrations",
  "Web Scraping",
  "Uncategorized",
];

const TOOL_LIBRARY: ToolDefinition[] = [
  {
    id: "search_web",
    name: "Search Web",
    type: "api",
    category: "AI & Machine Learning",
    configSchema: "{ query: string, recency?: number }",
  },
  {
    id: "embed_text",
    name: "Text Embeddings",
    type: "model",
    category: "AI & Machine Learning",
    configSchema: "{ text: string }",
  },
  {
    id: "schedule_run",
    name: "Scheduler",
    type: "automation",
    category: "Automation",
    configSchema: "{ cron: string, timezone: string }",
  },
  {
    id: "send_email",
    name: "Send Email",
    type: "automation",
    category: "Automation",
    configSchema: "{ to: string, subject: string, body: string }",
  },
  {
    id: "query_sql",
    name: "SQL Query",
    type: "database",
    category: "Database & Data",
    configSchema: "{ sql: string, source: string }",
  },
  {
    id: "warehouse_loader",
    name: "Warehouse Loader",
    type: "database",
    category: "Database & Data",
    configSchema: "{ table: string, mode: 'append' | 'replace' }",
  },
  {
    id: "pdf_reader",
    name: "PDF Reader",
    type: "file",
    category: "File & Document",
    configSchema: "{ path: string }",
  },
  {
    id: "notion_writer",
    name: "Notion Writer",
    type: "integration",
    category: "File & Document",
    configSchema: "{ pageId: string, content: string }",
  },
  {
    id: "slack_post",
    name: "Slack Post",
    type: "integration",
    category: "Integrations",
    configSchema: "{ channel: string, message: string }",
  },
  {
    id: "github_issue",
    name: "Create GitHub Issue",
    type: "integration",
    category: "Integrations",
    configSchema: "{ repo: string, title: string, body: string }",
  },
  {
    id: "scrape_page",
    name: "Scrape Page",
    type: "web",
    category: "Web Scraping",
    configSchema: "{ url: string, selector?: string }",
  },
  {
    id: "crawl_site",
    name: "Crawl Site",
    type: "web",
    category: "Web Scraping",
    configSchema: "{ rootUrl: string, maxDepth: number }",
  },
  {
    id: "custom_script",
    name: "Custom Script",
    type: "custom",
    category: "Uncategorized",
    configSchema: "{ command: string }",
  },
];

const NODE_MIME = "application/x-workflow-node";
const TOOL_MIME = "application/x-workflow-tool";

const EditorContext = createContext<EditorContextType | null>(null);

function useEditorContext() {
  const value = useContext(EditorContext);
  if (!value) {
    throw new Error("Workflow nodes must be used within EditorContext");
  }
  return value;
}

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeAgent(input: unknown, index: number): Agent {
  const value = isRecord(input) ? input : {};
  return {
    id: asString(value.id, `agent_${index + 1}`),
    name: asString(value.name, `Agent ${index + 1}`),
    role: asString(value.role),
    goal: asString(value.goal),
    backstory: asString(value.backstory),
    model: asString(value.model, MODELS[0]),
    temperature: asNumber(value.temperature, 0.3),
    max_tokens: asNumber(value.max_tokens, 1024),
    tools: Array.isArray(value.tools)
      ? value.tools.filter(
          (toolId): toolId is string => typeof toolId === "string",
        )
      : [],
    memoryEnabled: asBoolean(value.memoryEnabled, false),
    description: asString(value.description),
  };
}

function normalizeTask(input: unknown, index: number): Task {
  const value = isRecord(input) ? input : {};
  const executionType = asString(value.executionType, "sequential");
  return {
    id: asString(value.id, `task_${index + 1}`),
    name: asString(value.name, `Task ${index + 1}`),
    description: asString(value.description),
    assignedAgentId: asString(value.assignedAgentId),
    executionType: executionType === "parallel" ? "parallel" : "sequential",
    expectedOutputFormat: asString(value.expectedOutputFormat, "Markdown"),
    retryPolicy: Math.max(0, asNumber(value.retryPolicy, 1)),
  };
}

function normalizePositions(input: unknown): Record<string, XYPosition> {
  if (!isRecord(input)) {
    return {};
  }

  const normalized: Record<string, XYPosition> = {};
  for (const [key, rawPosition] of Object.entries(input)) {
    if (!isRecord(rawPosition)) {
      continue;
    }

    const x = asNumber(rawPosition.x, 0);
    const y = asNumber(rawPosition.y, 0);
    normalized[key] = { x, y };
  }

  return normalized;
}

function normalizeEdges(input: unknown): WorkflowEdge[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const normalized: WorkflowEdge[] = [];

  input.forEach((rawEdge, index) => {
    const value = isRecord(rawEdge) ? rawEdge : null;
    if (!value) {
      return;
    }

    const source = asString(value.source);
    const target = asString(value.target);
    if (!source || !target) {
      return;
    }

    normalized.push({
      id: asString(value.id, `edge_${source}_${target}_${index}`),
      source,
      target,
      type: asString(value.type, "smoothstep"),
      animated: asBoolean(value.animated, false),
      markerEnd: { type: MarkerType.ArrowClosed },
    });
  });

  return normalized;
}

function isAgentNode(node: WorkflowNode): node is AgentNode {
  return node.data.kind === "agent";
}

function isTaskNode(node: WorkflowNode): node is TaskNode {
  return node.data.kind === "task";
}

function buildAgentNode(agent: Agent, position: XYPosition): AgentNode {
  return {
    id: agent.id,
    type: "agentNode",
    position,
    data: {
      kind: "agent",
      agent,
    },
  };
}

function buildTaskNode(task: Task, position: XYPosition): TaskNode {
  return {
    id: task.id,
    type: "taskNode",
    position,
    data: {
      kind: "task",
      task,
    },
  };
}

function createInitialWorkflow(): PersistedWorkflow {
  const agents: Agent[] = [
    {
      id: "agent_product_manager",
      name: "AI Product Manager",
      role: "AI Product Manager",
      goal: "Define the product scope, PRD, and success metrics.",
      backstory:
        "Translates business needs into execution-ready product plans.",
      model: "Mistral Medium",
      temperature: 0.2,
      max_tokens: 1200,
      tools: ["schedule_run"],
      memoryEnabled: true,
      description:
        "Owns planning and requirement clarity for the AI initiative.",
    },
    {
      id: "agent_architect",
      name: "AI Architect",
      role: "AI Architect",
      goal: "Design scalable architecture, data flow, and service boundaries.",
      backstory: "Specializes in reliable AI systems and integration patterns.",
      model: "Codestral",
      temperature: 0.3,
      max_tokens: 1400,
      tools: ["query_sql"],
      memoryEnabled: false,
      description:
        "Defines technical architecture and implementation blueprint.",
    },
    {
      id: "agent_developer",
      name: "AI Developer",
      role: "AI Developer",
      goal: "Implement core features, prompts, and tool integrations.",
      backstory: "Builds production-grade AI services and orchestration logic.",
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 1400,
      tools: ["github_issue", "custom_script"],
      memoryEnabled: true,
      description: "Builds and iterates on workflow logic and integrations.",
    },
    {
      id: "agent_qa",
      name: "AI QA Engineer",
      role: "AI QA Engineer",
      goal: "Validate correctness, reliability, and regressions.",
      backstory: "Designs robust evaluation checks and failure-mode tests.",
      model: "Mistral Small",
      temperature: 0.1,
      max_tokens: 1100,
      tools: ["custom_script"],
      memoryEnabled: false,
      description: "Ensures the workflow output quality before release.",
    },
    {
      id: "agent_compliance",
      name: "AI Complaince Engineer",
      role: "AI Complaince Engineer",
      goal: "Verify policy, privacy, and governance compliance.",
      backstory: "Focuses on security controls, data handling, and policy fit.",
      model: "Mistral Small",
      temperature: 0.1,
      max_tokens: 1100,
      tools: ["pdf_reader"],
      memoryEnabled: false,
      description: "Performs compliance validation and control checks.",
    },
    {
      id: "agent_devops",
      name: "AI DevOps",
      role: "AI DevOps",
      goal: "Deploy, monitor, and maintain workflow reliability.",
      backstory: "Operates resilient release and observability pipelines.",
      model: "Codestral",
      temperature: 0.2,
      max_tokens: 1200,
      tools: ["schedule_run", "slack_post"],
      memoryEnabled: false,
      description: "Owns rollout, monitoring, and operational stability.",
    },
  ];

  const tasks: Task[] = [
    {
      id: "task_requirements",
      name: "Define Requirements",
      description: "Finalize scope, PRD, constraints, and acceptance criteria.",
      assignedAgentId: "agent_product_manager",
      executionType: "sequential",
      expectedOutputFormat: "PRD document",
      retryPolicy: 1,
    },
    {
      id: "task_architecture",
      name: "Design Architecture",
      description: "Define components, data pipelines, and service contracts.",
      assignedAgentId: "agent_architect",
      executionType: "sequential",
      expectedOutputFormat: "Architecture spec",
      retryPolicy: 1,
    },
    {
      id: "task_implementation",
      name: "Implement Features",
      description: "Build orchestration logic, tools, and integrations.",
      assignedAgentId: "agent_developer",
      executionType: "sequential",
      expectedOutputFormat: "Working implementation",
      retryPolicy: 2,
    },
    {
      id: "task_quality",
      name: "Validate Quality",
      description: "Run QA checks, edge-case tests, and regression validation.",
      assignedAgentId: "agent_qa",
      executionType: "sequential",
      expectedOutputFormat: "QA report",
      retryPolicy: 1,
    },
    {
      id: "task_compliance",
      name: "Compliance Review",
      description: "Run governance, security, and compliance checks.",
      assignedAgentId: "agent_compliance",
      executionType: "sequential",
      expectedOutputFormat: "Compliance checklist",
      retryPolicy: 1,
    },
    {
      id: "task_release",
      name: "Release & Monitor",
      description: "Deploy, observe, and stabilize the workflow in production.",
      assignedAgentId: "agent_devops",
      executionType: "sequential",
      expectedOutputFormat: "Release notes and monitoring summary",
      retryPolicy: 2,
    },
  ];

  const edges: WorkflowEdge[] = [
    {
      id: "edge_agent_pm_task_requirements",
      source: "agent_product_manager",
      target: "task_requirements",
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
    },
    {
      id: "edge_agent_architect_task_architecture",
      source: "agent_architect",
      target: "task_architecture",
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
    },
    {
      id: "edge_agent_developer_task_implementation",
      source: "agent_developer",
      target: "task_implementation",
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
    },
    {
      id: "edge_agent_qa_task_quality",
      source: "agent_qa",
      target: "task_quality",
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
    },
    {
      id: "edge_agent_compliance_task_compliance",
      source: "agent_compliance",
      target: "task_compliance",
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
    },
    {
      id: "edge_agent_devops_task_release",
      source: "agent_devops",
      target: "task_release",
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
    },
    {
      id: "edge_requirements_architecture",
      source: "task_requirements",
      target: "task_architecture",
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
    },
    {
      id: "edge_architecture_implementation",
      source: "task_architecture",
      target: "task_implementation",
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
    },
    {
      id: "edge_implementation_quality",
      source: "task_implementation",
      target: "task_quality",
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
    },
    {
      id: "edge_quality_compliance",
      source: "task_quality",
      target: "task_compliance",
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
    },
    {
      id: "edge_compliance_release",
      source: "task_compliance",
      target: "task_release",
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
    },
  ];

  return {
    agents,
    tasks,
    edges,
    positions: {
      agent_product_manager: { x: 80, y: 80 },
      agent_architect: { x: 440, y: 80 },
      agent_developer: { x: 800, y: 80 },
      agent_qa: { x: 80, y: 330 },
      agent_compliance: { x: 440, y: 330 },
      agent_devops: { x: 800, y: 330 },
      task_requirements: { x: 80, y: 650 },
      task_architecture: { x: 440, y: 650 },
      task_implementation: { x: 800, y: 650 },
      task_quality: { x: 80, y: 930 },
      task_compliance: { x: 440, y: 930 },
      task_release: { x: 800, y: 930 },
    },
    savedAt: new Date().toISOString(),
    templateVersion: WORKFLOW_TEMPLATE_VERSION,
  };
}

function serializeWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): PersistedWorkflow {
  const agents: Agent[] = [];
  const tasks: Task[] = [];
  const positions: Record<string, XYPosition> = {};

  for (const node of nodes) {
    positions[node.id] = node.position;
    if (isAgentNode(node)) {
      agents.push(node.data.agent);
      continue;
    }
    tasks.push(node.data.task);
  }

  return {
    agents,
    tasks,
    edges: edges.map((edge) => ({
      ...edge,
      type: edge.type ?? "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
    })),
    positions,
    savedAt: new Date().toISOString(),
    templateVersion: WORKFLOW_TEMPLATE_VERSION,
  };
}

function materializeCanvas(workflow: PersistedWorkflow): {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
} {
  const agents = Array.isArray(workflow.agents)
    ? workflow.agents.map(normalizeAgent)
    : [];

  const tasks = Array.isArray(workflow.tasks)
    ? workflow.tasks.map(normalizeTask)
    : [];

  const positions = normalizePositions(workflow.positions);

  const nodes: WorkflowNode[] = [
    ...agents.map((agent, index) =>
      buildAgentNode(
        agent,
        positions[agent.id] ?? { x: 80 + index * 360, y: 70 },
      ),
    ),
    ...tasks.map((task, index) =>
      buildTaskNode(
        task,
        positions[task.id] ?? { x: 80 + index * 360, y: 390 },
      ),
    ),
  ];

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = normalizeEdges(workflow.edges).filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
  );

  return { nodes, edges };
}

function parseWorkflowJson(payload: string): PersistedWorkflow | null {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    if (
      !Array.isArray(parsed.agents) ||
      !Array.isArray(parsed.tasks) ||
      !Array.isArray(parsed.edges)
    ) {
      return null;
    }

    return {
      agents: parsed.agents.map(normalizeAgent),
      tasks: parsed.tasks.map(normalizeTask),
      edges: normalizeEdges(parsed.edges),
      positions: normalizePositions(parsed.positions),
      savedAt: asString(parsed.savedAt, new Date().toISOString()),
      templateVersion: asNumber(parsed.templateVersion, 1),
    };
  } catch {
    return null;
  }
}

const INITIAL_WORKFLOW = createInitialWorkflow();
const INITIAL_CANVAS = materializeCanvas(INITIAL_WORKFLOW);

function isAgentIncomplete(agent: Agent) {
  return (
    !agent.name.trim() ||
    !agent.role.trim() ||
    !agent.goal.trim() ||
    !agent.model.trim()
  );
}

function isTaskIncomplete(task: Task) {
  return (
    !task.name.trim() ||
    !task.description.trim() ||
    !task.assignedAgentId.trim()
  );
}

async function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function executionLevels(tasks: Task[], edges: WorkflowEdge[]) {
  const taskIds = new Set(tasks.map((task) => task.id));
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const task of tasks) {
    adjacency.set(task.id, []);
    indegree.set(task.id, 0);
  }

  for (const edge of edges) {
    if (!taskIds.has(edge.source) || !taskIds.has(edge.target)) {
      continue;
    }

    adjacency.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const levels: string[][] = [];
  const queue = Array.from(indegree.entries())
    .filter(([, count]) => count === 0)
    .map(([taskId]) => taskId);

  let processedCount = 0;

  while (queue.length > 0) {
    const currentLevel = [...queue];
    queue.length = 0;
    levels.push(currentLevel);

    for (const taskId of currentLevel) {
      processedCount += 1;
      for (const child of adjacency.get(taskId) ?? []) {
        const nextCount = (indegree.get(child) ?? 0) - 1;
        indegree.set(child, nextCount);
        if (nextCount === 0) {
          queue.push(child);
        }
      }
    }
  }

  return {
    levels,
    hasCycle: processedCount !== tasks.length,
  };
}

function statusBadgeVariant(
  status: ExecutionStatus,
): "outline" | "default" | "destructive" {
  if (status === "completed") {
    return "default";
  }
  if (status === "failed") {
    return "destructive";
  }
  return "outline";
}

function statusIcon(status: ExecutionStatus) {
  if (status === "running") {
    return <Loader2 className="size-3 animate-spin" />;
  }
  if (status === "completed") {
    return <CheckCircle2 className="size-3" />;
  }
  if (status === "failed") {
    return <XCircle className="size-3" />;
  }
  return null;
}

function AgentNodeCard({ id, data, selected }: NodeProps<AgentNode>) {
  const {
    openNodeEditor,
    updateAgentModel,
    updateAgentDescription,
    addToolToAgent,
    toolsById,
  } = useEditorContext();

  const [isToolDropActive, setIsToolDropActive] = useState(false);
  const incomplete = isAgentIncomplete(data.agent);

  return (
    <div
      className={cn(
        "w-[290px] rounded-2xl border bg-zinc-950/95 text-zinc-100 shadow-lg backdrop-blur-sm",
        selected ? "border-blue-400 ring-2 ring-blue-200" : "border-zinc-800",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="size-2.5 !bg-blue-500"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="size-2.5 !bg-blue-500"
      />
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-sm font-semibold">
              {data.agent.name || "Untitled Agent"}
            </p>
            <p className="line-clamp-1 text-xs text-zinc-400">
              {data.agent.role || "No role yet"}
            </p>
          </div>
          {incomplete ? (
            <AlertTriangle className="size-4 text-amber-500" />
          ) : (
            <CheckCircle2 className="size-4 text-emerald-600" />
          )}
        </div>
      </div>

      <div className="space-y-3 px-4 py-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-400">
          Model
          <select
            className="nodrag rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm"
            value={data.agent.model}
            onChange={(event) =>
              updateAgentModel(data.agent.id, event.target.value)
            }
          >
            {MODELS.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-400">
          Description
          <textarea
            className="nodrag min-h-16 rounded-md border border-zinc-800 px-2 py-1.5 text-xs"
            value={data.agent.description}
            onChange={(event) =>
              updateAgentDescription(data.agent.id, event.target.value)
            }
          />
        </label>

        <div
          className={cn(
            "rounded-lg border border-dashed px-3 py-2 transition-colors",
            isToolDropActive
              ? "border-blue-400 bg-blue-950/40"
              : "border-zinc-700 bg-zinc-900",
          )}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes(TOOL_MIME)) {
              event.preventDefault();
              setIsToolDropActive(true);
            }
          }}
          onDragLeave={() => setIsToolDropActive(false)}
          onDrop={(event) => {
            const toolId = event.dataTransfer.getData(TOOL_MIME);
            if (!toolId) {
              return;
            }
            event.preventDefault();
            addToolToAgent(data.agent.id, toolId);
            setIsToolDropActive(false);
          }}
        >
          <p className="text-center text-xs text-zinc-500">Drop tools here</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {data.agent.tools.length === 0 ? (
              <span className="text-[11px] text-zinc-500">
                No tools assigned
              </span>
            ) : (
              data.agent.tools.map((toolId) => (
                <Badge key={toolId} variant="outline" className="text-[11px]">
                  {toolsById[toolId]?.name ?? toolId}
                </Badge>
              ))
            )}
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="nodrag h-8 w-full"
          onClick={(event) => {
            event.stopPropagation();
            openNodeEditor(id);
          }}
        >
          <UserCog className="size-3.5" />
          Edit
        </Button>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="size-2.5 !bg-blue-500"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="size-2.5 !bg-blue-500"
      />
    </div>
  );
}

function TaskNodeCard({ id, data, selected }: NodeProps<TaskNode>) {
  const { agents, openNodeEditor, assignTaskAgent, updateTaskDescription } =
    useEditorContext();

  const incomplete = isTaskIncomplete(data.task);

  return (
    <div
      className={cn(
        "w-[300px] rounded-2xl border bg-zinc-950/95 text-zinc-100 shadow-lg backdrop-blur-sm",
        selected
          ? "border-violet-400 ring-2 ring-violet-200"
          : "border-zinc-800",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="size-2.5 !bg-violet-500"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="size-2.5 !bg-violet-500"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="size-2.5 !bg-violet-500"
      />

      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">
              {data.task.name || "Untitled Task"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {data.task.executionType} execution
            </p>
          </div>
          {incomplete ? (
            <AlertTriangle className="size-4 text-amber-500" />
          ) : (
            <CheckCircle2 className="size-4 text-emerald-600" />
          )}
        </div>
      </div>

      <div className="space-y-3 px-4 py-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-400">
          Description
          <textarea
            className="nodrag min-h-16 rounded-md border border-zinc-800 px-2 py-1.5 text-xs"
            value={data.task.description}
            onChange={(event) =>
              updateTaskDescription(data.task.id, event.target.value)
            }
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-400">
          Assigned agent
          <select
            className="nodrag rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm"
            value={data.task.assignedAgentId}
            onChange={(event) =>
              assignTaskAgent(data.task.id, event.target.value)
            }
          >
            <option value="">Unassigned</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="nodrag h-8 w-full"
          onClick={(event) => {
            event.stopPropagation();
            openNodeEditor(id);
          }}
        >
          <UserCog className="size-3.5" />
          Edit
        </Button>
      </div>
    </div>
  );
}

function AgentsWorkflowCanvas({ id }: { id?: string }) {
  const router = useRouter();
  const reactFlowWrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const simulationRunRef = useRef(0);
  const restoredKeyRef = useRef<string | null>(null);
  const storageKey = useMemo(() => `agents-workflow:${id ?? "default"}`, [id]);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(
    INITIAL_CANVAS.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkflowEdge>(
    INITIAL_CANVAS.edges,
  );
  const [activeTab, setActiveTab] = useState<EditorTab>("editor");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [editorNodeId, setEditorNodeId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [agentDraft, setAgentDraft] = useState<Agent | null>(null);
  const [taskDraft, setTaskDraft] = useState<Task | null>(null);
  const [toolQuery, setToolQuery] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);
  const [taskStatuses, setTaskStatuses] = useState<
    Record<string, ExecutionStatus>
  >({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [isPlanLoading, setIsPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [taskOutputs, setTaskOutputs] = useState<Record<string, string>>({});
  const [commitUrl, setCommitUrl] = useState<string | null>(null);
  const planFetchedRef = useRef(false);
  const [openCategories, setOpenCategories] = useState<
    Record<ToolCategory, boolean>
  >({
    "AI & Machine Learning": true,
    Automation: true,
    "Database & Data": true,
    "File & Document": true,
    Integrations: true,
    "Web Scraping": true,
    Uncategorized: true,
  });

  const reactFlow = useReactFlow<WorkflowNode, WorkflowEdge>();

  const agents = useMemo(() => {
    return nodes.filter(isAgentNode).map((node) => node.data.agent);
  }, [nodes]);

  const tasks = useMemo(() => {
    return nodes.filter(isTaskNode).map((node) => node.data.task);
  }, [nodes]);

  const toolsById = useMemo(() => {
    const map: Record<string, ToolDefinition> = {};
    for (const tool of TOOL_LIBRARY) {
      map[tool.id] = tool;
    }
    return map;
  }, []);

  const nodeTypes = useMemo(
    () => ({
      agentNode: AgentNodeCard,
      taskNode: TaskNodeCard,
    }),
    [],
  );

  const serializeCurrentWorkflow = useCallback(() => {
    return serializeWorkflow(nodes, edges);
  }, [edges, nodes]);

  const updateAgent = useCallback(
    (agentId: string, updater: (agent: Agent) => Agent) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (!isAgentNode(node) || node.data.agent.id !== agentId) {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              agent: updater(node.data.agent),
            },
          };
        }),
      );
    },
    [setNodes],
  );

  const updateTask = useCallback(
    (taskId: string, updater: (task: Task) => Task) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (!isTaskNode(node) || node.data.task.id !== taskId) {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              task: updater(node.data.task),
            },
          };
        }),
      );
    },
    [setNodes],
  );

  const openNodeEditor = useCallback(
    (nodeId: string) => {
      const selectedNode = nodes.find((node) => node.id === nodeId);
      if (!selectedNode) {
        return;
      }

      setEditorNodeId(nodeId);
      setIsEditorOpen(true);

      if (isAgentNode(selectedNode)) {
        setAgentDraft({ ...selectedNode.data.agent });
        setTaskDraft(null);
        return;
      }

      setTaskDraft({ ...selectedNode.data.task });
      setAgentDraft(null);
    },
    [nodes],
  );

  const updateAgentModel = useCallback(
    (agentId: string, model: string) => {
      updateAgent(agentId, (agent) => ({ ...agent, model }));
    },
    [updateAgent],
  );

  const updateAgentDescription = useCallback(
    (agentId: string, description: string) => {
      updateAgent(agentId, (agent) => ({ ...agent, description }));
    },
    [updateAgent],
  );

  const addToolToAgent = useCallback(
    (agentId: string, toolId: string) => {
      if (!toolsById[toolId]) {
        return;
      }

      updateAgent(agentId, (agent) => {
        if (agent.tools.includes(toolId)) {
          return agent;
        }
        return {
          ...agent,
          tools: [...agent.tools, toolId],
        };
      });
    },
    [toolsById, updateAgent],
  );

  const assignTaskAgent = useCallback(
    (taskId: string, agentId: string) => {
      updateTask(taskId, (task) => ({ ...task, assignedAgentId: agentId }));
    },
    [updateTask],
  );

  const updateTaskDescription = useCallback(
    (taskId: string, description: string) => {
      updateTask(taskId, (task) => ({ ...task, description }));
    },
    [updateTask],
  );

  const createDefaultAgent = useCallback((): Agent => {
    return {
      id: makeId("agent"),
      name: "AI Agent",
      role: "Role of the agent",
      goal: "Goal of the agent",
      backstory: "",
      model: MODELS[0],
      temperature: 0.3,
      max_tokens: 1024,
      tools: [],
      memoryEnabled: false,
      description: "",
    };
  }, []);

  const createCustomAgent = useCallback((): Agent => {
    return {
      id: makeId("agent"),
      name: "Custom Agent",
      role: "Custom role",
      goal: "Define custom goal",
      backstory: "",
      model: MODELS[0],
      temperature: 0.3,
      max_tokens: 1024,
      tools: [],
      memoryEnabled: false,
      description: "Custom agent added to this workflow.",
    };
  }, []);

  const createDefaultTask = useCallback((): Task => {
    return {
      id: makeId("task"),
      name: "New Task",
      description: "Task description",
      assignedAgentId: "",
      executionType: "sequential",
      expectedOutputFormat: "Markdown",
      retryPolicy: 1,
    };
  }, []);

  const addNodeAt = useCallback(
    (kind: NodeKind, position?: XYPosition) => {
      const fallbackPosition = position ?? { x: 180, y: 180 };

      if (kind === "agent") {
        const agent = createDefaultAgent();
        setNodes((currentNodes) => [
          ...currentNodes,
          buildAgentNode(agent, fallbackPosition),
        ]);
        return;
      }

      const task = createDefaultTask();
      setNodes((currentNodes) => [
        ...currentNodes,
        buildTaskNode(task, fallbackPosition),
      ]);
    },
    [createDefaultAgent, createDefaultTask, setNodes],
  );

  const addCustomAgentAt = useCallback(
    (position?: XYPosition) => {
      const fallbackPosition = position ?? { x: 180, y: 180 };
      const agent = createCustomAgent();
      setNodes((currentNodes) => [
        ...currentNodes,
        buildAgentNode(agent, fallbackPosition),
      ]);
    },
    [createCustomAgent, setNodes],
  );

  const addNodeFromSidebar = useCallback(
    (kind: NodeKind) => {
      const wrapper = reactFlowWrapperRef.current;
      if (!wrapper) {
        addNodeAt(kind);
        return;
      }

      const bounds = wrapper.getBoundingClientRect();
      const centerPoint = reactFlow.screenToFlowPosition({
        x: bounds.left + bounds.width * 0.35,
        y: bounds.top + bounds.height * 0.35,
      });

      addNodeAt(kind, centerPoint);
    },
    [addNodeAt, reactFlow],
  );

  const addCustomAgentFromSidebar = useCallback(() => {
    const wrapper = reactFlowWrapperRef.current;
    if (!wrapper) {
      addCustomAgentAt();
      return;
    }

    const bounds = wrapper.getBoundingClientRect();
    const centerPoint = reactFlow.screenToFlowPosition({
      x: bounds.left + bounds.width * 0.35,
      y: bounds.top + bounds.height * 0.35,
    });

    addCustomAgentAt(centerPoint);
  }, [addCustomAgentAt, reactFlow]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) =>
        addEdge(
          {
            ...connection,
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          currentEdges,
        ),
      );
    },
    [setEdges],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeKind = event.dataTransfer.getData(NODE_MIME) as NodeKind;
      if (nodeKind !== "agent" && nodeKind !== "task") {
        return;
      }

      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNodeAt(nodeKind, position);
    },
    [addNodeAt, reactFlow],
  );

  const deleteSelectedNodes = useCallback(() => {
    if (selectedNodeIds.length === 0) {
      return;
    }

    const idsToDelete = new Set(selectedNodeIds);

    setNodes((currentNodes) =>
      currentNodes.filter((node) => !idsToDelete.has(node.id)),
    );
    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) =>
          !idsToDelete.has(edge.source) && !idsToDelete.has(edge.target),
      ),
    );

    if (editorNodeId && idsToDelete.has(editorNodeId)) {
      setEditorNodeId(null);
      setIsEditorOpen(false);
    }
  }, [editorNodeId, selectedNodeIds, setEdges, setNodes]);

  const saveWorkflow = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const payload = serializeCurrentWorkflow();
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
    setLastSavedAt(new Date(payload.savedAt ?? Date.now()).toLocaleString());
  }, [serializeCurrentWorkflow, storageKey]);

  const exportWorkflow = useCallback(() => {
    const payload = serializeCurrentWorkflow();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const objectUrl = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `workflow-${id ?? "draft"}.json`;
    anchor.click();

    URL.revokeObjectURL(objectUrl);
  }, [id, serializeCurrentWorkflow]);

  const loadWorkflow = useCallback(
    (workflow: PersistedWorkflow) => {
      const { nodes: loadedNodes, edges: loadedEdges } =
        materializeCanvas(workflow);
      setNodes(loadedNodes);
      setEdges(loadedEdges);
      setExecutionLogs([]);
      setTaskStatuses({});
      setActiveTab("editor");
      setLoadError(null);
      setEditorNodeId(null);
      setIsEditorOpen(false);
      setAgentDraft(null);
      setTaskDraft(null);
      setLastSavedAt(new Date(workflow.savedAt ?? Date.now()).toLocaleString());
    },
    [setEdges, setNodes],
  );

  const onLoadFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      const payload = await file.text();
      const parsed = parseWorkflowJson(payload);

      if (!parsed) {
        setLoadError("Invalid JSON. Expected { agents, tasks, edges }.");
        event.target.value = "";
        return;
      }

      loadWorkflow(parsed);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, JSON.stringify(parsed));
      }
      event.target.value = "";
    },
    [loadWorkflow, storageKey],
  );

  const filteredToolsByCategory = useMemo(() => {
    const query = toolQuery.trim().toLowerCase();
    const grouped: Record<ToolCategory, ToolDefinition[]> = {
      "AI & Machine Learning": [],
      Automation: [],
      "Database & Data": [],
      "File & Document": [],
      Integrations: [],
      "Web Scraping": [],
      Uncategorized: [],
    };

    for (const tool of TOOL_LIBRARY) {
      if (
        query &&
        !tool.name.toLowerCase().includes(query) &&
        !tool.type.toLowerCase().includes(query)
      ) {
        continue;
      }
      grouped[tool.category].push(tool);
    }

    return grouped;
  }, [toolQuery]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (restoredKeyRef.current === storageKey) {
      return;
    }

    restoredKeyRef.current = storageKey;

    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return;
    }

    const parsed = parseWorkflowJson(raw);
    if (!parsed) {
      return;
    }

    if ((parsed.templateVersion ?? 1) < WORKFLOW_TEMPLATE_VERSION) {
      const migratedWorkflow = createInitialWorkflow();
      const frameId = window.requestAnimationFrame(() => {
        loadWorkflow(migratedWorkflow);
      });
      window.localStorage.setItem(storageKey, JSON.stringify(migratedWorkflow));
      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    const frameId = window.requestAnimationFrame(() => {
      loadWorkflow(parsed);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [loadWorkflow, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const payload = serializeCurrentWorkflow();
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [edges, nodes, serializeCurrentWorkflow, storageKey]);

  useEffect(() => {
    return () => {
      simulationRunRef.current += 1;
    };
  }, []);

  // Fetch a Gemini-generated plan when this is a fresh session (no localStorage state yet)
  useEffect(() => {
    if (!id) return;
    if (planFetchedRef.current) return;
    if (typeof window === "undefined") return;

    const existingRaw = window.localStorage.getItem(storageKey);
    if (existingRaw) return; // Already have a saved workflow for this session

    const contextRaw = window.sessionStorage.getItem("agent_plan_context");
    if (!contextRaw) return;

    let context: {
      project_name: string;
      description: string;
      pdf_url: string;
      session_id: string;
    };
    try {
      context = JSON.parse(contextRaw);
    } catch {
      return;
    }

    if (!context.project_name) return;

    planFetchedRef.current = true;
    setIsPlanLoading(true);
    setPlanError(null);

    fetch("/api/agents/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_name: context.project_name,
        description: context.description,
        pdf_url: context.pdf_url,
      }),
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((e) => {
            throw new Error(
              (e as { error?: string }).error ?? `HTTP ${res.status}`,
            );
          });
        }
        return res.json();
      })
      .then(
        (workflow: {
          agents: Agent[];
          tasks: Task[];
          edges: WorkflowEdge[];
          positions?: Record<string, { x: number; y: number }>;
          savedAt?: string;
          templateVersion?: number;
        }) => {
          loadWorkflow(workflow);
          window.localStorage.setItem(storageKey, JSON.stringify(workflow));
          setIsPlanLoading(false);
        },
      )
      .catch((err: unknown) => {
        console.error("[agents-workflow] plan fetch error:", err);
        setPlanError(
          err instanceof Error ? err.message : "Failed to generate plan",
        );
        setIsPlanLoading(false);
      });
  }, [id, loadWorkflow, storageKey]);

  const editorContextValue = useMemo<EditorContextType>(
    () => ({
      agents,
      toolsById,
      openNodeEditor,
      updateAgentModel,
      updateAgentDescription,
      assignTaskAgent,
      updateTaskDescription,
      addToolToAgent,
    }),
    [
      addToolToAgent,
      agents,
      assignTaskAgent,
      openNodeEditor,
      toolsById,
      updateAgentDescription,
      updateAgentModel,
      updateTaskDescription,
    ],
  );

  const executeWorkflow = useCallback(async () => {
    if (isExecuting) return;

    const workflow = serializeCurrentWorkflow();
    const { hasCycle } = executionLevels(workflow.tasks, workflow.edges);

    setActiveTab("execution");
    setExecutionLogs([]);
    setTaskOutputs({});
    setCommitUrl(null);

    setTaskStatuses(() => {
      const base: Record<string, ExecutionStatus> = {};
      for (const task of workflow.tasks) {
        base[task.id] = "queued";
      }
      return base;
    });

    if (hasCycle) {
      setExecutionLogs([
        "Cycle detected in task DAG. Fix task dependencies before executing.",
      ]);
      return;
    }

    if (workflow.tasks.length === 0) {
      setExecutionLogs([
        "No tasks to execute. Add tasks to the workflow first.",
      ]);
      return;
    }

    setIsExecuting(true);

    const pushLog = (message: string) => {
      setExecutionLogs((currentLogs) => [
        ...currentLogs,
        `${new Date().toLocaleTimeString()}  ${message}`,
      ]);
    };

    // Read project context
    let projectName = "this project";
    let description = "";
    try {
      const raw =
        typeof window !== "undefined"
          ? window.sessionStorage.getItem("agent_plan_context")
          : null;
      if (raw) {
        const ctx = JSON.parse(raw) as {
          project_name?: string;
          description?: string;
        };
        projectName = ctx.project_name ?? projectName;
        description = ctx.description ?? description;
      }
    } catch {
      /* ignore */
    }

    pushLog(
      `Starting AI execution for "${projectName}" with ${workflow.tasks.length} task(s)...`,
    );

    // Mark all tasks as running upfront (will be updated per-result)
    for (const task of workflow.tasks) {
      setTaskStatuses((s) => ({ ...s, [task.id]: "running" }));
    }

    try {
      const response = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agents: workflow.agents,
          tasks: workflow.tasks,
          project_name: projectName,
          description,
        }),
      });

      if (!response.ok) {
        const err = (await response
          .json()
          .catch(() => ({ error: "Unknown error" }))) as { error?: string };
        pushLog(`Error: ${err.error ?? response.statusText}`);
        for (const task of workflow.tasks) {
          setTaskStatuses((s) => ({ ...s, [task.id]: "failed" }));
        }
        setIsExecuting(false);
        return;
      }

      const data = (await response.json()) as {
        results: Array<{
          taskId: string;
          taskName: string;
          agentName: string;
          status: "completed" | "failed";
          output: string;
          error?: string;
        }>;
        commitUrl?: string | null;
      };

      for (const result of data.results) {
        setTaskStatuses((s) => ({ ...s, [result.taskId]: result.status }));

        if (result.status === "completed") {
          setTaskOutputs((prev) => ({
            ...prev,
            [result.taskId]: result.output,
          }));
          pushLog(`✓  ${result.taskName}  (${result.agentName}) — completed`);
        } else {
          pushLog(
            `✗  ${result.taskName}  (${result.agentName}) — failed: ${result.error ?? "unknown"}`,
          );
        }
      }

      if (data.commitUrl) {
        setCommitUrl(data.commitUrl);
        pushLog(`📦  Report committed to GitHub: ${data.commitUrl}`);
      }

      pushLog("Execution finished.");
    } catch (err) {
      pushLog(
        `Fatal error: ${err instanceof Error ? err.message : String(err)}`,
      );
      for (const task of workflow.tasks) {
        setTaskStatuses((s) => ({ ...s, [task.id]: "failed" }));
      }
    }

    setIsExecuting(false);
  }, [isExecuting, serializeCurrentWorkflow]);

  const saveNodeEdits = useCallback(() => {
    if (agentDraft) {
      updateAgent(agentDraft.id, () => ({ ...agentDraft }));
      setIsEditorOpen(false);
      return;
    }

    if (taskDraft) {
      updateTask(taskDraft.id, () => ({ ...taskDraft }));
      setIsEditorOpen(false);
    }
  }, [agentDraft, taskDraft, updateAgent, updateTask]);

  const currentWorkflow = useMemo(
    () => serializeCurrentWorkflow(),
    [serializeCurrentWorkflow],
  );

  return (
    <EditorContext.Provider value={editorContextValue}>
      <div className="dark mx-auto w-full px-6 pb-8 lg:px-8">
        <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-950 to-zinc-900 shadow-sm">
          <div className="border-b border-zinc-800 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center rounded-lg border border-zinc-800 bg-zinc-950 p-1">
                <button
                  type="button"
                  className={cn(
                    "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                    activeTab === "editor"
                      ? "bg-slate-900 text-white"
                      : "text-zinc-400 hover:bg-zinc-950",
                  )}
                  onClick={() => setActiveTab("editor")}
                >
                  Visual Editor
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                    activeTab === "execution"
                      ? "bg-slate-900 text-white"
                      : "text-zinc-400 hover:bg-zinc-950",
                  )}
                  onClick={() => setActiveTab("execution")}
                >
                  Execution
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={saveWorkflow}
                >
                  <Save className="size-3.5" />
                  Save Workflow
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={exportWorkflow}
                >
                  <Download className="size-3.5" />
                  Export JSON
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-3.5" />
                  Load JSON
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    router.push(`/dashboard/review${id ? `?id=${id}` : ""}`)
                  }
                >
                  Next
                </Button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
              <span>
                Autosave:{" "}
                <span className="font-medium text-zinc-300">Enabled</span>
              </span>
              <span>
                Last saved:{" "}
                <span className="font-medium text-zinc-300">
                  {lastSavedAt ?? "-"}
                </span>
              </span>
            </div>

            {loadError ? (
              <p className="mt-2 text-xs text-red-400">{loadError}</p>
            ) : null}

            {isPlanLoading ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-800/50 bg-blue-950/40 px-3 py-2 text-xs text-blue-300">
                <Loader2 className="size-3.5 animate-spin" />
                Generating AI agent plan for your project…
              </div>
            ) : null}

            {planError ? (
              <div className="mt-3 rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-xs text-red-300">
                <span className="font-medium">Plan generation failed:</span>{" "}
                {planError}
              </div>
            ) : null}
          </div>

          {activeTab === "editor" ? (
            <div className="grid h-[calc(100vh-18rem)] min-h-[640px] grid-cols-[1fr_320px] overflow-hidden rounded-b-2xl">
              <div
                ref={reactFlowWrapperRef}
                className="relative border-r border-zinc-800"
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }}
                onDrop={onDrop}
              >
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={(_, node) => openNodeEditor(node.id)}
                  onNodesDelete={(deletedNodes) => {
                    const deletedIds = new Set(
                      deletedNodes.map((node) => node.id),
                    );
                    if (editorNodeId && deletedIds.has(editorNodeId)) {
                      setEditorNodeId(null);
                      setIsEditorOpen(false);
                    }
                  }}
                  onSelectionChange={({ nodes: selected }) => {
                    const nextIds = selected.map((node) => node.id);
                    setSelectedNodeIds((currentIds) => {
                      if (
                        currentIds.length === nextIds.length &&
                        currentIds.every((id, index) => id === nextIds[index])
                      ) {
                        return currentIds;
                      }
                      return nextIds;
                    });
                  }}
                  fitView
                  deleteKeyCode={["Backspace", "Delete"]}
                  className="bg-zinc-950"
                >
                  <Background
                    variant={BackgroundVariant.Dots}
                    gap={24}
                    size={1}
                    color="#cbd5e1"
                  />
                  <MiniMap
                    pannable
                    zoomable
                    className="!h-28 !w-44 rounded-lg border border-zinc-800 bg-zinc-950"
                  />
                  <Controls className="rounded-lg border border-zinc-800 bg-zinc-950 shadow-sm" />
                </ReactFlow>

                <div className="absolute right-4 top-4 flex gap-2 rounded-xl border border-zinc-800 bg-zinc-950/95 p-2 shadow-sm">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const initial = createInitialWorkflow();
                      loadWorkflow(initial);
                    }}
                  >
                    Reset
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={deleteSelectedNodes}
                    disabled={selectedNodeIds.length === 0}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              <aside className="h-full overflow-y-auto bg-zinc-950">
                <div className="space-y-5 p-4">
                  <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-zinc-100">
                        Crew
                      </h3>
                    </div>
                    <div className="space-y-2">
                      <button
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData(NODE_MIME, "task");
                          event.dataTransfer.effectAllowed = "copy";
                        }}
                        onClick={() => addNodeFromSidebar("task")}
                        className="flex w-full items-center justify-start gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-300 shadow-sm transition-colors hover:bg-zinc-950"
                      >
                        <ClipboardList className="size-4" />
                        Task
                      </button>

                      <button
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData(NODE_MIME, "agent");
                          event.dataTransfer.effectAllowed = "copy";
                        }}
                        onClick={() => addNodeFromSidebar("agent")}
                        className="flex w-full items-center justify-start gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-300 shadow-sm transition-colors hover:bg-zinc-950"
                      >
                        <Bot className="size-4" />
                        Agent
                      </button>

                      <button
                        type="button"
                        onClick={addCustomAgentFromSidebar}
                        className="flex w-full items-center justify-start gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-300 shadow-sm transition-colors hover:bg-zinc-900"
                      >
                        <Plus className="size-4" />
                        Custom Agent
                      </button>
                    </div>
                  </section>

                  <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                    <h3 className="mb-3 text-sm font-semibold text-zinc-100">
                      Tools
                    </h3>
                    <Input
                      value={toolQuery}
                      onChange={(event) => setToolQuery(event.target.value)}
                      placeholder="Search tools"
                      className="h-8"
                    />

                    <div className="mt-3 space-y-2">
                      {CATEGORY_ORDER.map((category) => {
                        const tools = filteredToolsByCategory[category];

                        if (tools.length === 0) {
                          return null;
                        }

                        const isOpen = openCategories[category];

                        return (
                          <div
                            key={category}
                            className="rounded-lg border border-zinc-800"
                          >
                            <button
                              type="button"
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-zinc-300"
                              onClick={() =>
                                setOpenCategories((currentState) => ({
                                  ...currentState,
                                  [category]: !currentState[category],
                                }))
                              }
                            >
                              <span>{category}</span>
                              {isOpen ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                            </button>

                            {isOpen ? (
                              <div className="space-y-1 border-t border-zinc-800 px-2 py-2">
                                {tools.map((tool) => (
                                  <button
                                    key={tool.id}
                                    type="button"
                                    draggable
                                    onDragStart={(event) => {
                                      event.dataTransfer.setData(
                                        TOOL_MIME,
                                        tool.id,
                                      );
                                      event.dataTransfer.effectAllowed = "copy";
                                    }}
                                    className="block w-full rounded-md border border-transparent px-2 py-1.5 text-left text-xs transition-colors hover:border-zinc-800 hover:bg-zinc-900"
                                  >
                                    <p className="font-medium text-zinc-300">
                                      {tool.name}
                                    </p>
                                    <p className="text-[11px] text-zinc-500">
                                      {tool.type}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </aside>
            </div>
          ) : (
            <div className="grid h-[calc(100vh-18rem)] min-h-[640px] grid-cols-[320px_1fr] gap-0 rounded-b-2xl bg-zinc-900">
              <div className="border-r border-zinc-800 p-4">
                <h3 className="text-sm font-semibold text-zinc-100">
                  Execution Controls
                </h3>
                <p className="mt-1 text-xs text-zinc-400">
                  Run each agent&apos;s task with Gemini AI and stream live
                  logs.
                </p>

                <div className="mt-4 flex flex-col gap-2">
                  <Button
                    type="button"
                    onClick={executeWorkflow}
                    disabled={isExecuting}
                  >
                    {isExecuting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Play className="size-4" />
                    )}
                    {isExecuting ? "Running agents..." : "Run Agents"}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      simulationRunRef.current += 1;
                      setIsExecuting(false);
                      setTaskStatuses({});
                      setExecutionLogs([]);
                      setTaskOutputs({});
                      setCommitUrl(null);
                    }}
                  >
                    Reset Execution
                  </Button>
                </div>

                <div className="mt-4 space-y-2">
                  {tasks.length === 0 ? (
                    <p className="text-xs text-zinc-500">No tasks available.</p>
                  ) : (
                    tasks.map((task) => {
                      const status = taskStatuses[task.id] ?? "idle";
                      const assigned = agents.find(
                        (agent) => agent.id === task.assignedAgentId,
                      );
                      const output = taskOutputs[task.id];

                      return (
                        <div
                          key={task.id}
                          className="rounded-lg border border-zinc-800 bg-zinc-950 p-3"
                        >
                          <p className="text-sm font-medium text-zinc-200">
                            {task.name}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            Agent: {assigned?.name ?? "Unassigned"}
                          </p>
                          <Badge
                            variant={statusBadgeVariant(status)}
                            className={cn(
                              "mt-2 gap-1",
                              status === "completed" &&
                                "bg-emerald-600 text-white",
                              status === "running" &&
                                "border-blue-500 text-blue-300",
                            )}
                          >
                            {statusIcon(status)}
                            {status}
                          </Badge>
                          {output ? (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-[11px] text-zinc-400 hover:text-zinc-200">
                                View output
                              </summary>
                              <pre className="mt-1 max-h-40 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-900 p-2 text-[10px] text-zinc-300 whitespace-pre-wrap">
                                {output}
                              </pre>
                            </details>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="p-4">
                <div className="h-full rounded-xl border border-zinc-800 bg-zinc-950 p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-100">
                      Execution Logs
                    </h3>
                    {commitUrl ? (
                      <a
                        href={commitUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 underline hover:text-blue-300"
                      >
                        View GitHub commit
                      </a>
                    ) : null}
                  </div>
                  <div className="mt-3 h-[calc(100%-2rem)] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 p-3 font-mono text-xs">
                    {executionLogs.length === 0 ? (
                      <p className="text-zinc-500">
                        Click &ldquo;Run Agents&rdquo; to execute tasks with AI.
                      </p>
                    ) : (
                      executionLogs.map((log) => (
                        <p key={log} className="mb-1 text-zinc-300">
                          {log}
                        </p>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={onLoadFile}
        />

        <Sheet
          open={isEditorOpen && Boolean(editorNodeId)}
          onOpenChange={(open) => {
            setIsEditorOpen(open);
            if (!open) {
              setEditorNodeId(null);
            }
          }}
        >
          <SheetContent className="w-[460px] overflow-y-auto sm:max-w-[460px]">
            <SheetHeader>
              <SheetTitle>
                {agentDraft
                  ? "Edit Agent"
                  : taskDraft
                    ? "Edit Task"
                    : "Edit Node"}
              </SheetTitle>
              <SheetDescription>
                {agentDraft
                  ? "Configure your agent role, goal, model, and tool settings."
                  : "Configure task execution and assignment."}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 px-4 pb-4">
              {agentDraft ? (
                <>
                  <label className="space-y-1 text-sm">
                    <span className="text-zinc-400">Name</span>
                    <Input
                      value={agentDraft.name}
                      onChange={(event) =>
                        setAgentDraft((currentDraft) =>
                          currentDraft
                            ? { ...currentDraft, name: event.target.value }
                            : currentDraft,
                        )
                      }
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="text-zinc-400">Role</span>
                    <Input
                      value={agentDraft.role}
                      onChange={(event) =>
                        setAgentDraft((currentDraft) =>
                          currentDraft
                            ? { ...currentDraft, role: event.target.value }
                            : currentDraft,
                        )
                      }
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="text-zinc-400">Goal</span>
                    <Textarea
                      value={agentDraft.goal}
                      onChange={(event) =>
                        setAgentDraft((currentDraft) =>
                          currentDraft
                            ? { ...currentDraft, goal: event.target.value }
                            : currentDraft,
                        )
                      }
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="text-zinc-400">Backstory</span>
                    <Textarea
                      value={agentDraft.backstory}
                      onChange={(event) =>
                        setAgentDraft((currentDraft) =>
                          currentDraft
                            ? { ...currentDraft, backstory: event.target.value }
                            : currentDraft,
                        )
                      }
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="text-zinc-400">Description</span>
                    <Textarea
                      value={agentDraft.description}
                      onChange={(event) =>
                        setAgentDraft((currentDraft) =>
                          currentDraft
                            ? {
                                ...currentDraft,
                                description: event.target.value,
                              }
                            : currentDraft,
                        )
                      }
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="text-zinc-400">Model</span>
                    <select
                      className="w-full rounded-md border border-zinc-800 px-3 py-2 text-sm"
                      value={agentDraft.model}
                      onChange={(event) =>
                        setAgentDraft((currentDraft) =>
                          currentDraft
                            ? { ...currentDraft, model: event.target.value }
                            : currentDraft,
                        )
                      }
                    >
                      {MODELS.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1 text-sm">
                      <span className="text-zinc-400">Temperature</span>
                      <Input
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        value={agentDraft.temperature}
                        onChange={(event) =>
                          setAgentDraft((currentDraft) =>
                            currentDraft
                              ? {
                                  ...currentDraft,
                                  temperature: Number(event.target.value),
                                }
                              : currentDraft,
                          )
                        }
                      />
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="text-zinc-400">Max Tokens</span>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={agentDraft.max_tokens}
                        onChange={(event) =>
                          setAgentDraft((currentDraft) =>
                            currentDraft
                              ? {
                                  ...currentDraft,
                                  max_tokens: Math.max(
                                    1,
                                    Number(event.target.value),
                                  ),
                                }
                              : currentDraft,
                          )
                        }
                      />
                    </label>
                  </div>

                  <div className="rounded-md border border-zinc-800 p-3">
                    <p className="text-sm font-medium text-zinc-300">Tools</p>
                    <div className="mt-2 space-y-2">
                      {TOOL_LIBRARY.map((tool) => {
                        const checked = agentDraft.tools.includes(tool.id);

                        return (
                          <label
                            key={tool.id}
                            className="flex items-start gap-2 text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => {
                                const shouldInclude = value === true;
                                setAgentDraft((currentDraft) => {
                                  if (!currentDraft) {
                                    return currentDraft;
                                  }

                                  const currentTools = new Set(
                                    currentDraft.tools,
                                  );
                                  if (shouldInclude) {
                                    currentTools.add(tool.id);
                                  } else {
                                    currentTools.delete(tool.id);
                                  }

                                  return {
                                    ...currentDraft,
                                    tools: Array.from(currentTools),
                                  };
                                });
                              }}
                            />
                            <span>
                              <span className="font-medium text-zinc-300">
                                {tool.name}
                              </span>
                              <span className="block text-xs text-zinc-500">
                                {tool.configSchema}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={agentDraft.memoryEnabled}
                      onCheckedChange={(value) =>
                        setAgentDraft((currentDraft) =>
                          currentDraft
                            ? { ...currentDraft, memoryEnabled: value === true }
                            : currentDraft,
                        )
                      }
                    />
                    <span className="text-zinc-300">Enable memory</span>
                  </label>
                </>
              ) : null}

              {taskDraft ? (
                <>
                  <label className="space-y-1 text-sm">
                    <span className="text-zinc-400">Name</span>
                    <Input
                      value={taskDraft.name}
                      onChange={(event) =>
                        setTaskDraft((currentDraft) =>
                          currentDraft
                            ? { ...currentDraft, name: event.target.value }
                            : currentDraft,
                        )
                      }
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="text-zinc-400">Task Description</span>
                    <Textarea
                      value={taskDraft.description}
                      onChange={(event) =>
                        setTaskDraft((currentDraft) =>
                          currentDraft
                            ? {
                                ...currentDraft,
                                description: event.target.value,
                              }
                            : currentDraft,
                        )
                      }
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="text-zinc-400">Assign Agent</span>
                    <select
                      className="w-full rounded-md border border-zinc-800 px-3 py-2 text-sm"
                      value={taskDraft.assignedAgentId}
                      onChange={(event) =>
                        setTaskDraft((currentDraft) =>
                          currentDraft
                            ? {
                                ...currentDraft,
                                assignedAgentId: event.target.value,
                              }
                            : currentDraft,
                        )
                      }
                    >
                      <option value="">Unassigned</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="text-zinc-400">Execution Type</span>
                    <select
                      className="w-full rounded-md border border-zinc-800 px-3 py-2 text-sm"
                      value={taskDraft.executionType}
                      onChange={(event) =>
                        setTaskDraft((currentDraft) =>
                          currentDraft
                            ? {
                                ...currentDraft,
                                executionType:
                                  event.target.value === "parallel"
                                    ? "parallel"
                                    : "sequential",
                              }
                            : currentDraft,
                        )
                      }
                    >
                      <option value="sequential">Sequential</option>
                      <option value="parallel">Parallel</option>
                    </select>
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="text-zinc-400">
                      Expected Output Format
                    </span>
                    <Input
                      value={taskDraft.expectedOutputFormat}
                      onChange={(event) =>
                        setTaskDraft((currentDraft) =>
                          currentDraft
                            ? {
                                ...currentDraft,
                                expectedOutputFormat: event.target.value,
                              }
                            : currentDraft,
                        )
                      }
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="text-zinc-400">
                      Retry Policy (attempts)
                    </span>
                    <Input
                      type="number"
                      min={0}
                      value={taskDraft.retryPolicy}
                      onChange={(event) =>
                        setTaskDraft((currentDraft) =>
                          currentDraft
                            ? {
                                ...currentDraft,
                                retryPolicy: Math.max(
                                  0,
                                  Number(event.target.value),
                                ),
                              }
                            : currentDraft,
                        )
                      }
                    />
                  </label>
                </>
              ) : null}
            </div>

            <SheetFooter>
              <Button variant="outline" onClick={() => setIsEditorOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveNodeEdits}>Save</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-400">
          <p className="font-semibold text-zinc-300">Workflow JSON Structure</p>
          <pre className="mt-2 overflow-auto rounded-md border border-zinc-800 bg-zinc-900 p-3 text-[11px]">
            {JSON.stringify(
              {
                agents: currentWorkflow.agents,
                tasks: currentWorkflow.tasks,
                edges: currentWorkflow.edges,
              },
              null,
              2,
            )}
          </pre>
        </div>
      </div>
    </EditorContext.Provider>
  );
}

export default function AgentsWorkflowNext({ id }: { id?: string }) {
  return (
    <ReactFlowProvider>
      <AgentsWorkflowCanvas id={id} />
    </ReactFlowProvider>
  );
}
