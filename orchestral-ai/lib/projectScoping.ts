const DEFAULT_PROJECT_NAME = "Paper2Prod";

export const BASE_PROJECT_SYSTEM_PROMPT_TEMPLATE = `You are a senior quantitative researcher and senior full-stack Python engineer.

Your task is to generate a COMPLETE, production-ready GitHub repository for the project described below.

You MUST follow the OUTPUT CONTRACT supplied in the latest task context.
You MUST generate ALL files listed in that output contract.
You MUST NOT create extra files outside that output contract.
If any output file is missing, regenerate.

Objective

Build a production-ready analytical web application that:

Reads and interprets the documents/description attached.
Generates an interactive dashboard.
Uses Streamlit as execution layer.
Keeps implementation short, clear, and operational.

MATHEMATICAL IMPLEMENTATION REQUIREMENTS

All equations and helpers must be implemented inside app.py.

APPLICATION REQUIREMENTS

The application must include:
1) Charts must:
- Use dark theme
- Include legends
- Have labeled axes

OUTPUT CONTRACT (MANDATORY)

You MUST generate exactly the files specified by the OUTPUT CONTRACT.
If no contract is provided, default to:

{PROJECT_NAME}/
|
+-- app.py
+-- requirements.txt
+-- README.md

If any output file is missing, regenerate.

BACKEND REQUIREMENTS

- Streamlit app entry in app.py
- app.py must be self-contained (no local module imports)
- Use numpy, pandas, plotly, streamlit only as needed

DEPLOYMENT REQUIREMENTS

requirements.txt must include package names only (no version pins/specifiers).
README.md must explain:
- Mathematical model
- How to run locally
- How to deploy on Replit

OUTPUT FORMAT (CRITICAL)

You MUST output each file in this exact format:

=== FILE: filename ===
<full file contents>

Do NOT summarize.
Do NOT omit code.
Do NOT truncate files.
Generate full working implementation.

After generating all files, confirm:
"All output files generated successfully."

If any output file is missing, regenerate completely.

QUALITY REQUIREMENTS

No placeholder comments like "implement here".
No incomplete functions.
No pseudocode.
No TODO comments.
All imports valid.
Code executable.

SELF-CHECK STEP (MANDATORY)

Before final output:
- Verify all output files exist.
- Verify app.py contains all runtime logic.
- Verify charts are generated.
- Verify no file is empty.

If any condition fails, regenerate.

Generate the full repository now.`;

export function clipForPrompt(text: string, maxChars = 18_000): string {
  if (!text) return "";
  const normalized = text.replace(/\u0000/g, "").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trim()}\n\n[truncated]`;
}

export function renderBaseProjectSystemPrompt(projectName: string): string {
  const resolvedName = projectName.trim() || DEFAULT_PROJECT_NAME;
  return BASE_PROJECT_SYSTEM_PROMPT_TEMPLATE.replace(
    /\{PROJECT_NAME\}/g,
    resolvedName,
  );
}

export function buildScopedProjectDescription(params: {
  projectName: string;
  description?: string;
  documentOcrText?: string;
}): string {
  const { projectName, description, documentOcrText } = params;
  const sections: string[] = [`Project name: ${projectName.trim() || DEFAULT_PROJECT_NAME}`];

  const normalizedDescription = clipForPrompt(description ?? "", 12_000);
  if (normalizedDescription) {
    sections.push(`User description:\n${normalizedDescription}`);
  }

  const normalizedOcr = clipForPrompt(documentOcrText ?? "", 18_000);
  if (normalizedOcr) {
    sections.push(`Document OCR context:\n${normalizedOcr}`);
  }

  if (!normalizedDescription && !normalizedOcr) {
    sections.push(
      "No project description or OCR content was provided. Use conservative defaults and enforce the output contract.",
    );
  }

  return sections.join("\n\n");
}

export function resolveBaseProjectSystemPrompt(params: {
  projectName: string;
  providedBasePrompt?: string;
}): string {
  const provided = params.providedBasePrompt?.trim();
  if (provided) return provided;
  return renderBaseProjectSystemPrompt(params.projectName);
}
