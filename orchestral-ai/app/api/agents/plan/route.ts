import { NextRequest, NextResponse } from "next/server";
import { extractPdfTextWithMistral } from "@/lib/mistralPdfOcr";
import {
  buildScopedProjectDescription,
  renderBaseProjectSystemPrompt,
} from "@/lib/projectScoping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLAN_TEMPLATE_VERSION = 7;
type LlmProvider = "mistral" | "grok";
type GenerationProfile = "simple" | "standard";
const DEFAULT_GROK_MODEL = process.env.GROK_MODEL?.trim() || "grok-3-mini";
const MISTRAL_OCR_PROVIDER = "mistral";

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

const OUTPUT_FILES = ["app.py", "requirements.txt", "README.md"];

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
    goal: "Define mathematical mapping and compact single-file architecture.",
    backstory:
      "Designs robust theory-to-code systems with explicit module boundaries.",
    model: "mistral-large-latest",
    temperature: 0.2,
    max_tokens: 1500,
    tools: [],
    memoryEnabled: true,
    description:
      "Owns equation interpretation and app.py execution blueprint.",
  },
  {
    id: "agent_developer",
    name: "AI Developer",
    role: "Implementation Engineer",
    goal: "Generate production-grade code in a single self-contained app.py.",
    backstory:
      "Builds modular Python systems, data simulations, and dashboard experiences.",
    model: "mistral-large-latest",
    temperature: 0.2,
    max_tokens: 1800,
    tools: [],
    memoryEnabled: true,
    description: "Owns end-to-end code generation with all runtime logic in app.py.",
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
      "Owns validation of app.py math, simulations, charts, and table outputs.",
  },
  {
    id: "agent_compliance",
    name: "AI Complaince Engineer",
    role: "Contract & Quality Gate",
    goal: "Enforce strict output contract and single-file completeness.",
    backstory:
      "Ensures generated outputs strictly satisfy mandatory file and quality rules.",
    model: "mistral-large-latest",
    temperature: 0.1,
    max_tokens: 1200,
    tools: [],
    memoryEnabled: false,
    description: "Owns output contract checks and standards compliance.",
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
    max_tokens: 2500,
    tools: [],
    memoryEnabled: false,
    description:
      "Owns GitHub publish flow, requirements compatibility, and deployment readiness. Ensures apps are short and concise, with clear run instructions and no extraneous code or files.",
  },
];

function resolveLlmProvider(value: unknown): LlmProvider {
  return value === "grok" ? "grok" : "mistral";
}

function resolveGenerationProfile(value: unknown): GenerationProfile {
  return value === "standard" ? "standard" : "simple";
}

function resolveMistralOcrApiKey(): string | null {
  const dedicated = process.env.MISTRAL_OCR_API_KEY?.trim();
  if (dedicated) return dedicated;
  const shared = process.env.MISTRAL_API_KEY?.trim();
  if (shared) return shared;
  return null;
}

function withProviderModel(provider: LlmProvider, model: string): string {
  if (provider === "grok") {
    return /^grok/i.test(model) ? model : DEFAULT_GROK_MODEL;
  }
  if (/^grok/i.test(model)) {
    return "mistral-large-latest";
  }
  return model;
}

function truncate(text: string, max = 520): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).trim()}...`;
}

function extractObjective(description: string): string {
  const compact = description.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "Build a production-ready analytical app that converts a research paper into a deployable Streamlit implementation.";
  }
  return truncate(compact, 260);
}

function buildWorkflowPlan(
  description: string,
  llmProvider: LlmProvider,
) {
  const objective = extractObjective(description);
  const outputFiles = OUTPUT_FILES;

  const equationChecklist = [
    "Extract all equations directly from the provided description and OCR context",
    "List symbol definitions, assumptions, and dimensional constraints",
    "Implement equations as clear reusable functions inside app.py",
    "Map derived/optimization equations into app.py helper functions with explicit inputs/outputs",
    "Validate simulation and dashboard outputs against extracted equations in app.py",
  ];

  const tasks: PlannedTask[] = [
    {
      id: "task_requirements",
      name: "Requirements & Scope Breakdown",
      assignedAgentId: "agent_product_manager",
      description: truncate(
        `Objective: ${objective}\nCreate a concrete execution brief from the provided description and OCR context. Define acceptance criteria for math correctness, app behavior, deployment readiness, and concise implementation. Confirm deliverables include: ${outputFiles.join(", ")} with ALL runtime logic in app.py. The auto-included base system prompt is mandatory for all downstream outputs.`,
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
        `Translate the uploaded document and current description into a compact implementation plan. Keep scope tight to files: ${outputFiles.join(", ")}. Enforce that app.py is fully self-contained with no local module imports. Equation checklist: ${equationChecklist.join("; ")}.`,
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
        `Generate ONLY these repository files: ${outputFiles.join(", ")}. Build a short but executable Streamlit app in app.py with clearly labeled chart axes and dark theme defaults. Put all equations, simulation logic, and utility helpers in app.py. Do not import local modules. requirements.txt must be unpinned package names only. README.md must stay concise with clear run/deploy steps.`,
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
      name: "Output Quality Gate",
      assignedAgentId: "agent_compliance",
      description: truncate(
        `Run strict output validation before delivery: app.py, requirements.txt, README.md exist and are non-empty; app.py is self-contained; requirements.txt has no version pins; charts/tables requirements are covered; imports and structure are production-ready.`,
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
        `Prepare deployable output for GitHub, Replit, and Streamlit. Ensure requirements.txt has unpinned package names only, README has concise run/deploy steps, and repository runs with app.py as the sole runtime module.`,
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
    agents: AGENTS.map((agent) => ({
      ...agent,
      model: withProviderModel(llmProvider, agent.model),
    })),
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
      pdf_url,
      llm_provider,
      generation_profile,
    }: {
      project_name: string;
      description?: string;
      pdf_url?: string;
      llm_provider?: LlmProvider;
      generation_profile?: GenerationProfile;
    } = body;

    if (!project_name || !project_name.trim()) {
      return NextResponse.json(
        { error: "project_name is required" },
        { status: 400 },
      );
    }

    const resolvedProjectName = project_name.trim();
    const resolvedDescription = description ?? "";
    const resolvedPdfUrl = typeof pdf_url === "string" ? pdf_url.trim() : "";
    const resolvedLlmProvider = resolveLlmProvider(llm_provider);
    const resolvedGenerationProfile =
      resolveGenerationProfile(generation_profile);

    const baseSystemPrompt = renderBaseProjectSystemPrompt(resolvedProjectName);

    let documentExcerpt = "";
    let ocrPageCount = 0;
    let ocrError: string | null = null;

    if (resolvedPdfUrl) {
      const apiKey = resolveMistralOcrApiKey();
      if (!apiKey) {
        ocrError =
          "Mistral OCR is not configured (set MISTRAL_OCR_API_KEY or MISTRAL_API_KEY), skipping OCR.";
      } else {
        try {
          const ocrResult = await extractPdfTextWithMistral({
            pdfUrl: resolvedPdfUrl,
            apiKey,
          });
          documentExcerpt = ocrResult.extractedText;
          ocrPageCount = ocrResult.pageCount;
        } catch (error) {
          const rawMessage =
            error instanceof Error ? error.message : String(error);
          if (/401|unauthorized/i.test(rawMessage)) {
            ocrError =
              "Mistral OCR authorization failed (401). Check MISTRAL_OCR_API_KEY/MISTRAL_API_KEY.";
          } else {
            ocrError = rawMessage;
          }
          console.error("[agents/plan] OCR failed:", error);
        }
      }
    }

    const scopedDescription = buildScopedProjectDescription({
      projectName: resolvedProjectName,
      description: resolvedDescription,
      documentOcrText: documentExcerpt,
    });

    const workflow = buildWorkflowPlan(
      scopedDescription,
      resolvedLlmProvider,
    );
    return NextResponse.json({
      ...workflow,
      project_context: {
        base_system_prompt: baseSystemPrompt,
        scoped_description: scopedDescription,
        document_excerpt: documentExcerpt || null,
        pdf_url: resolvedPdfUrl || null,
        llm_provider: resolvedLlmProvider,
        generation_profile: resolvedGenerationProfile,
        ocr: {
          provider: MISTRAL_OCR_PROVIDER,
          used: Boolean(documentExcerpt),
          page_count: ocrPageCount,
          error: ocrError,
        },
      },
    });
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
