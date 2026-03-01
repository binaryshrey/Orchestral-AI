"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  TrendingUp,
  CheckCircle,
  DollarSign,
  Clock,
  Loader2,
} from "lucide-react";

interface DashboardClientProps {
  greeting: string;
  formattedDate: string;
  userName: string;
  userId?: string | null;
}

export default function DashboardClient({
  greeting,
  formattedDate,
  userName,
  userId,
}: DashboardClientProps) {
  const router = useRouter();

  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Helper: format duration seconds to friendly string
  const formatDuration = (secs: number) => {
    if (!secs) return "-";
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins} mins`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "Review Completed":
        return "px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800";
      case "Pending":
        return "px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800";
      case "Review Needed":
        return "px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800";
      default:
        return "px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800";
    }
  };

  useEffect(() => {
    // Fetch the user's pitch sessions from the external FastAPI endpoint
    const fetchSessions = async () => {
      setIsLoading(true);
      setError(null);
      try {
        if (!userId) {
          throw new Error("No user id available");
        }
        const limit = 20;
        const res = await fetch(
          `https://demoday-ai-backend-uvhm6z3sbq-ez.a.run.app/pitch-sessions?user_id=${encodeURIComponent(
            userId
          )}&limit=${limit}`
        );
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        const data = await res.json();
        // Expecting an array of pitch session objects
        setSessions(Array.isArray(data) ? data : []);
      } catch (err: any) {
        console.error(err);
        setError(err?.message || "Unknown error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSessions();
  }, [userId]);

  const handleRowClick = (session: any) => {
    try {
      const id =
        session?.id ?? session?.session_id ?? session?.pitch_session_id;
      if (!id) {
        console.warn("[Dashboard] clicked session has no id");
        return;
      }
      // Navigate to review-feedback using the pitch id
      router.push(`/review-feedback/${encodeURIComponent(String(id))}`);
    } catch (err) {
      console.error("[Dashboard] Failed to navigate to review-feedback:", err);
    }
  };

  const handleNewPitchClick = () => {
    router.push("/onboard");
  };

  // Computed metrics derived from fetched sessions
  const completedCount = sessions.filter(
    (s) => (s.status ?? "") === "Review Completed"
  ).length;
  const completedPct = sessions.length
    ? ((completedCount / sessions.length) * 100).toFixed(2)
    : "0.00";

  // Average score: support legacy numeric `score` or new structured `score.overall_score`.
  const scoredSessions = sessions
    .map((s) => {
      // If new structured score exists, use overall_score/10
      if (
        s?.score &&
        typeof s.score === "object" &&
        s.score.overall_score != null
      ) {
        const n = Number(s.score.overall_score);
        return isNaN(n) ? null : n / 10;
      }
      // Legacy numeric score assumed to be on 0-10 scale
      if (typeof s.score === "number") return s.score;
      return null;
    })
    .filter((v) => v != null) as number[];

  const avgScore = scoredSessions.length
    ? (
        scoredSessions.reduce((acc, cur) => acc + (cur ?? 0), 0) /
        scoredSessions.length
      ).toFixed(1)
    : "0.0";

  // Total time across sessions (in seconds -> convert to hours and minutes)
  const totalSeconds = sessions.reduce(
    (acc, s) => acc + (s.duration_seconds ?? s.duration ?? 0),
    0
  );
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalRemMins = totalMinutes % 60;

  // Client-side search: filter sessions by startup name, content or feedback
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const displayedSessions = normalizedQuery
    ? sessions.filter((s) => {
        const name = (s.startup_name || "").toString().toLowerCase();
        const content = (s.content || "").toString().toLowerCase();
        // If feedback is an object, stringify it for search
        const feedback =
          s.feedback && typeof s.feedback === "object"
            ? JSON.stringify(s.feedback).toLowerCase()
            : (s.feedback || "").toString().toLowerCase();
        return (
          name.includes(normalizedQuery) ||
          content.includes(normalizedQuery) ||
          feedback.includes(normalizedQuery)
        );
      })
    : sessions;

  return (
    <div>
      {/* Top bar with search and button */}
      <div className="flex items-center justify-between mb-4 mx-4">
        <div className="relative w-64 lg:w-120">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-3 h-3" />
          <Input
            type="text"
            placeholder="Search your projects"
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button
          onClick={handleNewPitchClick}
          className="bg-[#fc7249] hover:bg-[#fc7249] cursor-pointer text-white px-2 sm:px-4 text-xs sm:text-sm whitespace-nowrap"
        >
          <span className="hidden sm:inline">+ New Project</span>
          <span className="sm:hidden">+ New Project</span>
        </Button>
      </div>

      {/* Horizontal line */}
      <hr className="border-gray-300 mb-3" />

      {/* Date and Greeting */}
      <div className="mb-4 mx-4">
        <p className="text-sm text-gray-500">{formattedDate}</p>
        <h1 className="text-2xl font-medium text-gray-900">
          {greeting}, {userName}!
        </h1>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mx-4 mt-2">
        {/* Total Pitch Sessions */}
        <div className="bg-[#ffab91] rounded-xl p-6 shadow-lg cursor-pointer">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-gray-800 text-sm font-medium">
              Total Project Sessions
            </h3>
            <div className="bg-[#fc7249] p-2 rounded-lg">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
          </div>
          <p className="text-gray-900 text-3xl font-bold">
            {isLoading ? "..." : sessions.length === 0 ? "0" : sessions.length}
          </p>
        </div>

        {/* Completed Sessions */}
        <div className="bg-[#ffab91] rounded-xl p-6 shadow-lg cursor-pointer">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-gray-800 text-sm font-medium">
              Completed Sessions
            </h3>
            <div className="bg-[#fc7249] p-2 rounded-lg">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
          </div>
          <p className="text-gray-900 text-3xl font-bold">
            {isLoading ? "..." : sessions.length === 0 ? "0" : completedCount}{" "}
            <span className="text-lg text-gray-700 font-normal">
              (
              {isLoading
                ? "..."
                : sessions.length === 0
                ? "0.00%"
                : `${completedPct}%`}
              )
            </span>
          </p>
        </div>

        {/* Average Score */}
        <div className="bg-[#ffab91] rounded-xl p-6 shadow-lg cursor-pointer">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-gray-800 text-sm font-medium">Average Score</h3>
            <div className="bg-[#fc7249] p-2 rounded-lg">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
          </div>
          <p className="text-gray-900 text-3xl font-bold">
            {isLoading ? "..." : sessions.length === 0 ? "0" : `${avgScore}/10`}
          </p>
        </div>

        {/* Total Time on Pitches */}
        <div className="bg-[#ffab91] rounded-xl p-6 shadow-lg cursor-pointer">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-gray-800 text-sm font-medium">
              Time on Project Sessions
            </h3>
            <div className="bg-[#fc7249] p-2 rounded-lg">
              <Clock className="w-5 h-5 text-white" />
            </div>
          </div>
          <p className="text-gray-900 text-3xl font-bold">
            {isLoading ? (
              "..."
            ) : sessions.length === 0 ? (
              "0"
            ) : (
              <>
                {totalHours}h{" "}
                <span className="text-lg text-gray-700 font-normal">
                  {totalRemMins}m
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Pitch Sessions Table */}
      <div className="mt-6 bg-white rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Recent Projects
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Feedback
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Score
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-sm text-gray-500"
                  >
                    <div className="flex items-center justify-center gap-2 flex-col">
                      <Loader2 className="w-5 h-5 text-[#ff4000] animate-spin" />
                      <span>Loading pitch sessions</span>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-sm text-red-500"
                  >
                    Error: {error}
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-sm text-gray-500"
                  >
                    - No Record -
                  </td>
                </tr>
              ) : displayedSessions.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-sm text-gray-500"
                  >
                    No sessions match your search.
                  </td>
                </tr>
              ) : (
                displayedSessions.map((s, idx) => (
                  <tr
                    key={s.id || idx}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleRowClick(s)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {idx + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {s.startup_name || s.content || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDuration(s.duration_seconds ?? s.duration ?? 0)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                      {/**
                       * Show a friendly default when feedback is empty.
                       * If feedback is structured, prefer a short label in table.
                       */}
                      {(() => {
                        if (s.feedback == null)
                          return "Click to view detailed feedback";
                        if (typeof s.feedback === "object") {
                          // If there's a short summary field, try to use it
                          const summary =
                            s.feedback?.summary ||
                            s.feedback?.text ||
                            s.feedback?.brief;
                          if (summary) return summary;
                          // If object is empty, show default label
                          return Object.keys(s.feedback).length
                            ? "Click to view detailed feedback"
                            : "Click to view detailed feedback";
                        }
                        // string fallback
                        const fb = (s.feedback || "").toString().trim();
                        return fb.length
                          ? fb
                          : "Click to view detailed feedback";
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={getStatusBadgeClass(s.status ?? "")}>
                        {s.status ?? "-"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {(() => {
                        // Prefer structured overall_score -> divide by 10 and show 1 decimal
                        try {
                          if (
                            s?.score &&
                            typeof s.score === "object" &&
                            s.score.overall_score != null
                          ) {
                            const n = Number(s.score.overall_score);
                            if (!isNaN(n)) return `${(n / 10).toFixed(1)}/10`;
                          }
                          // Legacy numeric score handling: if >10 assume 0-100 scale
                          if (typeof s.score === "number") {
                            const num = s.score;
                            if (num > 10) return `${(num / 10).toFixed(1)}/10`;
                            return `${num.toFixed(1)}/10`;
                          }
                        } catch (e) {
                          // fallthrough
                        }
                        return "-";
                      })()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
