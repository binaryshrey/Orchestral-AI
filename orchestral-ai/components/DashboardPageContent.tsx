"use client";

import { useState } from "react";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { IconSearch, IconTrendingUp, IconCircleCheck, IconCurrencyDollar, IconClock } from "@tabler/icons-react";
import { PitchSessionsTable } from "@/components/PitchSessionsTable";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

interface SidebarUser {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}

function getFormattedDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function computeStats(sessions: Session[]) {
  const total = sessions.length;
  const completed = sessions.filter((s) => s.status && s.status !== "Pending");
  const completedCount = completed.length;
  const completedPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const scored = sessions.filter((s) => s.overall_score != null);
  const avgScore =
    scored.length > 0
      ? (scored.reduce((sum, s) => sum + (s.overall_score ?? 0), 0) / scored.length).toFixed(1)
      : null;

  const totalSeconds = sessions.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);

  return { total, completedCount, completedPct, avgScore, totalSeconds };
}

export function DashboardPageContent({
  sessions,
  user,
}: {
  sessions: Session[];
  user?: SidebarUser;
}) {
  const [query, setQuery] = useState("");

  const filtered = sessions.filter((s) =>
    !query.trim() || s.startup_name?.toLowerCase().includes(query.toLowerCase())
  );

  const stats = computeStats(sessions);
  const firstName = user?.firstName || user?.email?.split("@")[0] || "there";

  return (
    <>
      {/* Header */}
      <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        {/* Search */}
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5 max-w-sm">
          <IconSearch className="size-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your pitch sessions"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
        {/* New Pitch Session */}
        <a
          href="/dashboard/onboard"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#fc7249] px-4 py-2 text-sm font-medium text-white hover:bg-[#e5623e] transition-colors"
        >
          + New Pitch Session
        </a>
      </header>

      {/* Greeting */}
      <div className="px-6 lg:px-8 pt-6 pb-2">
        <p className="text-sm text-muted-foreground">{getFormattedDate()}</p>
        <h2 className="text-2xl font-bold text-foreground">
          {getGreeting()}, {firstName}!
        </h2>
      </div>

      {/* Stats Cards */}
      <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 py-4">
        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Total Pitch Sessions</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {stats.total}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                <IconTrendingUp />
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="text-muted-foreground">All time pitch sessions</div>
          </CardFooter>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Completed Sessions</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {stats.completedCount}{" "}
              <span className="text-base font-normal text-muted-foreground">
                ({stats.completedPct}%)
              </span>
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                <IconCircleCheck />
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="text-muted-foreground">Sessions with full feedback</div>
          </CardFooter>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Average Score</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {stats.avgScore != null ? `${stats.avgScore}/10` : "—"}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                <IconCurrencyDollar />
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="text-muted-foreground">Across all reviewed sessions</div>
          </CardFooter>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Time on Pitches</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {stats.totalSeconds > 0 ? formatTime(stats.totalSeconds) : "0m"}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                <IconClock />
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="text-muted-foreground">Total time across all sessions</div>
          </CardFooter>
        </Card>
      </div>

      {/* Table */}
      <PitchSessionsTable sessions={filtered} />
    </>
  );
}
