"use client";

import { Badge } from "@/components/ui/badge";

interface Session {
  id: string;
  startup_name?: string;
  duration_seconds?: number;
  status?: string;
  overall_score?: number | null;
  created_at?: string;
  [key: string]: any;
}

function formatDuration(seconds?: number) {
  if (!seconds) return "-";
  const mins = Math.round(seconds / 60);
  return `${mins} min${mins !== 1 ? "s" : ""}`;
}

function StatusBadge({ status }: { status?: string }) {
  if (!status || status === "Pending") {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-yellow-400/20 text-yellow-300">
        Pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-400/20 text-green-400">
      Review Completed
    </span>
  );
}

export function PitchSessionsTable({ sessions }: { sessions: Session[] }) {
  return (
    <div className="px-4 lg:px-6">
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Recent Projects</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                {["Number", "Title", "Time", "Feedback", "Status", "Score"].map((col) => (
                  <th
                    key={col}
                    className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sessions.length > 0 ? (
                sessions.map((session, idx) => (
                  <tr key={session.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4 text-sm text-muted-foreground">{idx + 1}</td>
                    <td className="px-6 py-4 text-sm font-medium text-foreground">
                      {session.startup_name || "-"}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {formatDuration(session.duration_seconds)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <a
                        href={`/review-feedback/${session.id}`}
                        className="text-[#fc7249] hover:underline"
                      >
                        Click to view detailed feedback
                      </a>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={session.status} />
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-foreground">
                      {session.overall_score != null
                        ? `${session.overall_score}/10`
                        : "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-muted-foreground">
                    No pitch sessions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
