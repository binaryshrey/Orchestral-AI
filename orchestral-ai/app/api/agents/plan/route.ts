import { NextRequest, NextResponse } from "next/server";

const PLAN_TEMPLATE_VERSION = 6;

type PlannedAgent = {
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

type PlannedTask = {
  id: string;
  name: string;
  description: string;
  assignedAgentId: string;
  executionType: "sequential" | "parallel";
  expectedOutputFormat: string;
  retryPolicy: number;
};

const DEFAULT_REQUIRED_FILES = [
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
];

const DEFAULT_CHARTS = [
  "Spread simulation chart",
  "Dual-axis chart (spread + optimal position)",
  "Wealth trajectory chart",
  "Sensitivity analysis chart",
];

const DEFAULT_TABLES = [
  "Parameter summary table",
  "Derived metrics table",
  "Simulation statistics table",
];

const AGENTS: PlannedAgent[] = [
  {
    id: "agent_product_manager",
    name: "AI Product Manager",
    role: "Product & Requirements Lead",
    goal: "Translate the project description into executable product requirements.",
    backstory:
      "Specializes in converting complex briefs into clear acceptance criteria and milestones.",
    model: "mistral-large-latest",
    temperature: 0.2,
    max_tokens: 1400,
    tools: [],
    memoryEnabled: true,
    description: "Owns scope clarity, constraints, and final acceptance checklist.",
  },
  {
    id: "agent_architect",
    name: "AI Architect",
    role: "Math & System Architect",
    goal: "Define mathematical mapping and repository/module architecture.",
    backstory:
      "Designs robust theory-to-code systems with explicit module boundaries.",
    model: "mistral-large-latest",
    temperature: 0.2,
    max_tokens: 1500,
    tools: [],
    memoryEnabled: true,
    description:
      "Owns equation interpretation, architecture decisions, and technical blueprint.",
  },
  {
    id: "agent_developer",
    name: "AI Developer",
    role: "Implementation Engineer",
    goal: "Generate production-grade code and templates matching the file contract.",
    backstory:
      "Builds modular Python systems, data simulations, and dashboard experiences.",
    model: "mistral-large-latest",
    temperature: 0.2,
    max_tokens: 1800,
    tools: [],
    memoryEnabled: true,
    description: "Owns end-to-end code generation and integration.",
  },
  {
    id: "agent_qa",
    name: "AI QA Engineer",
    role: "Verification Engineer",
    goal: "Validate numerical correctness, data flow, and UI completeness.",
    backstory:
      "Focuses on deterministic checks, regressions, and completeness validation.",
    model: "mistral-large-latest",
    temperature: 0.1,
    max_tokens: 1200,
    tools: [],
    memoryEnabled: false,
    description:
      "Owns validation of formulas, simulations, charts, and table outputs.",
  },
  {
    id: "agent_compliance",
    name: "AI Complaince Engineer",
    role: "Contract & Quality Gate",
    goal: "Enforce strict output contract and repository completeness.",
    backstory:
      "Ensures generated outputs strictly satisfy mandatory file and quality rules.",
    model: "mistral-large-latest",
    temperature: 0.1,
    max_tokens: 1200,
    tools: [],
    memoryEnabled: false,
    description: "Owns file contract checks and standards compliance.",
  },
  {
    id: "agent_devops",
    name: "AI DevOps",
    role: "Delivery & Deployment Engineer",
    goal: "Make the generated project deployable and reproducible in target environments.",
    backstory:
      "Operates CI/deployment workflows and dependency/runtime compatibility checks.",
    model: "mistral-large-latest",
    temperature: 0.15,
    max_tokens: 1300,
    tools: [],
    memoryEnabled: false,
    description:
      "Owns GitHub publish flow, requirements compatibility, and deployment readiness.",
  },
];

function truncate(text: string, max = 520): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).trim()}...`;
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function extractRequiredFiles(description: string): string[] {
  const matches = description.match(
    /[A-Za-z0-9_\-/]+\.(?:py|txt|md|html)/g,
  );
  if (!matches) return DEFAULT_REQUIRED_FILES;
  const merged = dedupe([...DEFAULT_REQUIRED_FILES, ...matches]);
  return merged;
}

function contains(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function extractObjective(description: string): string {
  const compact = description.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "Build a production-ready analytical app that converts a research paper into a deployable Streamlit implementation.";
  }
  return truncate(compact, 260);
}

function extractCharts(description: string): string[] {
  const found: string[] = [];
  if (contains(description, /spread simulation/i)) {
    found.push("Spread simulation chart");
  }
  if (contains(description, /dual-axis/i)) {
    found.push("Dual-axis chart (spread + optimal position)");
  }
  if (contains(description, /wealth trajectory/i)) {
    found.push("Wealth trajectory chart");
  }
  if (contains(description, /sensitivity analysis/i)) {
    found.push("Sensitivity analysis chart");
  }
  return found.length ? found : DEFAULT_CHARTS;
}

function extractTables(description: string): string[] {
  const found: string[] = [];
  if (contains(description, /parameter summary table/i)) {
    found.push("Parameter summary table");
  }
  if (contains(description, /derived metrics table/i)) {
    found.push("Derived metrics table");
  }
  if (contains(description, /simulation statistics table/i)) {
    found.push("Simulation statistics table");
  }
  return found.length ? found : DEFAULT_TABLES;
}

function buildWorkflowPlan(projectName: string, description: string) {
  const objective = extractObjective(description);
  const requiredFiles = extractRequiredFiles(description);
  const charts = extractCharts(description);
  const tables = extractTables(description);

  const equationChecklist = [
    "Ornstein-Uhlenbeck process with Euler-Maruyama discretization",
    "Power utility U(W_T) = (1/γ) W_T^γ",
    "Optimal control α*_t = -W_t X_t D(τ)",
    "C(τ), C'(τ), D(τ), τ = T - t, ν = 1/sqrt(1-γ)",
    "Wealth dynamics dW_t = α_t dX_t",
  ];

  const tasks: PlannedTask[] = [
    {
      id: "task_requirements",
      name: "Requirements & Scope Breakdown",
      assignedAgentId: "agent_product_manager",
      description: truncate(
        `Objective: ${objective}\nCreate a concrete execution brief from the provided description. Define acceptance criteria for math correctness, file completeness, dashboard behavior, and deployment readiness. Confirm that required artifacts include: ${requiredFiles.join(", ")}.`,
      ),
      executionType: "sequential",
      expectedOutputFormat: "Structured implementation brief",
      retryPolicy: 1,
    },
    {
      id: "task_math_architecture",
      name: "Math Mapping & Architecture Design",
      assignedAgentId: "agent_architect",
      description: truncate(
        `Translate paper math into implementation design. Map equations to reusable functions in formulas.py and optimizer.py, define module responsibilities, and document data flow in architecture.md. Equation checklist: ${equationChecklist.join("; ")}.`,
      ),
      executionType: "sequential",
      expectedOutputFormat: "Equation-to-code mapping + architecture plan",
      retryPolicy: 1,
    },
    {
      id: "task_implementation",
      name: "Code & Template Generation",
      assignedAgentId: "agent_developer",
      description: truncate(
        `Generate repository files exactly as required: ${requiredFiles.join(", ")}. Implement Streamlit app entry, simulation engine, formulas, optimizer, utils, and Jinja2 templates with block inheritance and component includes. Implement charts (${charts.join(", ")}) and tables (${tables.join(", ")}) with dark-themed, labeled dashboard outputs.`,
      ),
      executionType: "sequential",
      expectedOutputFormat: "Complete repository code",
      retryPolicy: 2,
    },
    {
      id: "task_validation",
      name: "Validation & Testing",
      assignedAgentId: "agent_qa",
      description: truncate(
        `Verify formula correctness, simulation behavior, and dashboard output integrity. Validate chart rendering, table completeness, and data consistency. Confirm no placeholder implementations, no TODO stubs, and executable code paths for all core modules.`,
      ),
      executionType: "sequential",
      expectedOutputFormat: "Validation report with pass/fail checks",
      retryPolicy: 1,
    },
    {
      id: "task_contract_gate",
      name: "File Contract & Quality Gate",
      assignedAgentId: "agent_compliance",
      description: truncate(
        `Run strict contract validation before delivery: every mandatory file exists and is non-empty; Jinja templates are present and modular; formulas are implemented and reusable; charts/tables requirements are covered; imports and structure are production-ready.`,
      ),
      executionType: "sequential",
      expectedOutputFormat: "Contract compliance checklist",
      retryPolicy: 1,
    },
    {
      id: "task_deployment",
      name: "Deployment Packaging",
      assignedAgentId: "agent_devops",
      description: truncate(
        `Prepare deployable output for GitHub, Replit, and Streamlit. Ensure requirements.txt is runtime-compatible, README has run/deploy steps, and repository can be cloned and executed with app.py as entrypoint.`,
      ),
      executionType: "sequential",
      expectedOutputFormat: "Deployment-ready package + instructions",
      retryPolicy: 2,
    },
  ];

  const edges: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    markerEnd: { type: string };
  }> = [];

  for (const task of tasks) {
    edges.push({
      id: `edge_${task.assignedAgentId}_${task.id}`,
      source: task.assignedAgentId,
      target: task.id,
      type: "smoothstep",
      markerEnd: { type: "arrowclosed" },
    });
  }

  for (let i = 0; i < tasks.length - 1; i += 1) {
    edges.push({
      id: `edge_seq_${tasks[i].id}_${tasks[i + 1].id}`,
      source: tasks[i].id,
      target: tasks[i + 1].id,
      type: "smoothstep",
      markerEnd: { type: "arrowclosed" },
    });
  }

  const positions: Record<string, { x: number; y: number }> = {
    agent_product_manager: { x: 80, y: 80 },
    agent_architect: { x: 440, y: 80 },
    agent_developer: { x: 800, y: 80 },
    agent_qa: { x: 80, y: 330 },
    agent_compliance: { x: 440, y: 330 },
    agent_devops: { x: 800, y: 330 },
    task_requirements: { x: 80, y: 650 },
    task_math_architecture: { x: 440, y: 650 },
    task_implementation: { x: 800, y: 650 },
    task_validation: { x: 80, y: 930 },
    task_contract_gate: { x: 440, y: 930 },
    task_deployment: { x: 800, y: 930 },
  };

  return {
    agents: AGENTS,
    tasks,
    edges,
    positions,
    savedAt: new Date().toISOString(),
    templateVersion: PLAN_TEMPLATE_VERSION,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      project_name,
      description,
    }: { project_name: string; description?: string; pdf_url?: string } = body;

    if (!project_name || !project_name.trim()) {
      return NextResponse.json(
        { error: "project_name is required" },
        { status: 400 },
      );
    }

    const workflow = buildWorkflowPlan(project_name.trim(), description ?? "");
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
