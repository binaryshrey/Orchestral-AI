import { withAuth } from "@workos-inc/authkit-nextjs";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DashboardPageContent } from "@/components/DashboardPageContent";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ProjectSessionRow = {
  id?: string | number;
  session_id?: string | number;
  project_name?: string | null;
  startup_name?: string | null;
  duration_seconds?: number | null;
  duration?: number | null;
  status?: string | null;
  overall_score?: number | null;
  created_at?: string | null;
  score?: unknown;
  [key: string]: unknown;
};

type DashboardSession = {
  id: string;
  startup_name?: string;
  duration_seconds?: number;
  status?: string;
  overall_score?: number | null;
  created_at?: string;
  [key: string]: unknown;
};

function normalizeOverallScore(row: ProjectSessionRow): number | null {
  if (typeof row.overall_score === "number" && Number.isFinite(row.overall_score)) {
    return row.overall_score;
  }
  if (typeof row.score === "number" && Number.isFinite(row.score)) {
    return row.score;
  }
  if (row.score && typeof row.score === "object") {
    const maybeOverall = (row.score as Record<string, unknown>).overall_score;
    if (typeof maybeOverall === "number" && Number.isFinite(maybeOverall)) {
      return maybeOverall;
    }
  }
  return null;
}

function normalizeDurationSeconds(row: ProjectSessionRow): number | null {
  if (typeof row.duration_seconds === "number" && Number.isFinite(row.duration_seconds)) {
    return row.duration_seconds;
  }
  if (typeof row.duration === "number" && Number.isFinite(row.duration)) {
    return row.duration;
  }
  return null;
}

export default async function Page() {
  const { user } = await withAuth();

  let sessions: DashboardSession[] = [];
  try {
    const { data, error } = await supabaseAdmin
      .from("project_sessions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("Failed to fetch project sessions from Supabase:", error.message);
    } else {
      sessions = (data ?? []).map((row: ProjectSessionRow) => ({
        ...row,
        id: String(row.id ?? row.session_id ?? ""),
        startup_name: row.project_name ?? row.startup_name ?? "Untitled Project",
        duration_seconds: normalizeDurationSeconds(row) ?? undefined,
        status: typeof row.status === "string" ? row.status : "Pending",
        created_at:
          typeof row.created_at === "string" ? row.created_at : undefined,
        overall_score: normalizeOverallScore(row),
      }));
    }
  } catch (err) {
    console.error("Error fetching project sessions from Supabase:", err);
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" user={user ?? undefined} />
      <SidebarInset>
        <div className="@container/main flex flex-1 flex-col">
          <DashboardPageContent sessions={sessions} user={user ?? undefined} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
