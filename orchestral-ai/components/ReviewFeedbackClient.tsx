"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Lightbulb,
  MessageSquare,
  FileText,
  MapPin,
  ZoomIn,
  ZoomOut,
  Loader2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";

interface FeedbackData {
  overall_score: number;
  scores: {
    [key: string]: number;
  };
  top_strengths: string[];
  top_risks: string[];
  missing_info: string[];
  suggested_improvements: string[];
  rewritten_pitch: string;
  follow_up_questions: string[];
  tts_summary: string;
}

export type Region = "AMERS" | "EMEA" | "APAC";

export interface AcceleratorProgram {
  name: string;
  type: "Accelerator" | "VC" | "VC/Accelerator";
  location: string;
  coordinates: [number, number]; // [lng, lat]
  focus?: string;
  website?: string;
}

export const acceleratorsByRegion: Record<Region, AcceleratorProgram[]> = {
  AMERS: [
    {
      name: "Y Combinator",
      type: "Accelerator",
      location: "Mountain View, CA, USA",
      coordinates: [-122.0839, 37.3861],
      focus: "Seed funding, Demo Day",
      website: "https://www.ycombinator.com",
    },
    {
      name: "Techstars",
      type: "Accelerator",
      location: "New York City, USA",
      coordinates: [-73.981, 40.756],
      focus: "Mentorship-driven accelerator",
      website: "https://www.techstars.com",
    },
    {
      name: "500 Global",
      type: "VC",
      location: "San Francisco, CA, USA",
      coordinates: [-122.4194, 37.7749],
      focus: "Seed & Series A",
      website: "https://500.co",
    },
    {
      name: "Sequoia Capital",
      type: "VC",
      location: "Menlo Park, CA, USA",
      coordinates: [-122.1817, 37.4529],
      focus: "Seed to growth stage",
      website: "https://www.sequoiacap.com",
    },
    {
      name: "Andreessen Horowitz",
      type: "VC",
      location: "Menlo Park, CA, USA",
      coordinates: [-122.1817, 37.4529],
      focus: "Seed to late-stage",
      website: "https://a16z.com",
    },
  ],

  EMEA: [
    {
      name: "Y Combinator",
      type: "Accelerator",
      location: "San Francisco, USA (Global intake)",
      coordinates: [-122.38664, 37.76078],
      focus: "Global accelerator",
      website: "https://www.ycombinator.com",
    },
    {
      name: "Seedcamp",
      type: "VC/Accelerator",
      location: "London, UK",
      coordinates: [-0.1278, 51.5074],
      focus: "Pre-seed to Series A",
      website: "https://seedcamp.com",
    },
    {
      name: "Antler",
      type: "Accelerator",
      location: "London, UK (EMEA hub)",
      coordinates: [-0.1278, 51.5074],
      focus: "Day zero to Series A",
      website: "https://www.antler.co",
    },
    {
      name: "Flat6Labs",
      type: "Accelerator",
      location: "Cairo, Egypt",
      coordinates: [31.2357, 30.0444],
      focus: "MENA early-stage startups",
      website: "https://flat6labs.com",
    },
    {
      name: "Techstars Berlin",
      type: "Accelerator",
      location: "Berlin, Germany",
      coordinates: [13.405, 52.52],
      focus: "Early-stage startups",
      website: "https://www.techstars.com/accelerators/berlin",
    },
  ],

  APAC: [
    {
      name: "Y Combinator",
      type: "Accelerator",
      location: "San Francisco, USA (Global intake)",
      coordinates: [-122.38664, 37.76078],
      focus: "Global accelerator",
      website: "https://www.ycombinator.com",
    },
    {
      name: "Antler",
      type: "Accelerator",
      location: "Singapore",
      coordinates: [103.8198, 1.3521],
      focus: "Day zero to Series A",
      website: "https://www.antler.co",
    },
    {
      name: "SOSV / Chinaccelerator",
      type: "Accelerator",
      location: "Shanghai, China",
      coordinates: [121.4737, 31.2304],
      focus: "China-focused accelerator",
      website: "https://sosv.com/chinaccelerator",
    },
    {
      name: "JFDI Asia",
      type: "Accelerator",
      location: "Singapore",
      coordinates: [103.8198, 1.3521],
      focus: "Early-stage Southeast Asia startups",
      website: "https://jfdi.asia",
    },
    {
      name: "Sequoia India & SEA",
      type: "VC",
      location: "Bangalore, India",
      coordinates: [77.5946, 12.9716],
      focus: "Seed to growth stage",
      website: "https://www.sequoiacap.com/india",
    },
  ],
};

export function AcceleratorMap({ dark }: { dark?: boolean }) {
  const [selectedRegion, setSelectedRegion] = useState<Region>("AMERS");
  const [zoom, setZoom] = useState(1);
  const router = useRouter();

  const regionCenters = {
    EMEA: { center: [10, 50] as [number, number], scale: 800 },
    AMERS: { center: [-95, 40] as [number, number], scale: 600 },
    APAC: { center: [100, 20] as [number, number], scale: 700 },
  };

  const regionNames = {
    EMEA: "Europe, Middle East & Africa",
    AMERS: "Americas",
    APAC: "Asia Pacific",
  };

  const currentConfig = regionCenters[selectedRegion];

  const handleZoomIn = () => {
    if (zoom < 8) setZoom(zoom + 0.5);
  };

  const handleZoomOut = () => {
    if (zoom > 1) setZoom(zoom - 0.5);
  };

  return (
    <>
      <Card
        className={`p-4 border ${dark ? "bg-[#1a1a1a] border-gray-800" : "bg-[#fffaf9]"}`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#ff4000]" />
            <h2 className="text-sm uppercase tracking-wide font-semibold">
              Top Accelerators & VCs in your region -{" "}
              {regionNames[selectedRegion]}
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Map */}
          <div
            className={`rounded-lg border p-2 relative ${dark ? "bg-[#0d0d0d] border-gray-700" : "bg-white border-gray-200"}`}
          >
            {/* Zoom Controls */}
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
              <button
                onClick={handleZoomIn}
                disabled={zoom >= 8}
                className={`${dark ? "bg-[#1a1a1a] hover:bg-[#2a2a2a] border-gray-700 text-gray-300" : "bg-white hover:bg-gray-100 border-gray-300 text-gray-700"} disabled:opacity-50 disabled:cursor-not-allowed border rounded-lg p-2 shadow-md transition-all`}
                title="Zoom In"
              >
                <ZoomIn
                  className={`w-4 h-4 ${dark ? "text-gray-300" : "text-gray-700"}`}
                />
              </button>
              <button
                onClick={handleZoomOut}
                disabled={zoom <= 1}
                className={`${dark ? "bg-[#1a1a1a] hover:bg-[#2a2a2a] border-gray-700 text-gray-300" : "bg-white hover:bg-gray-100 border-gray-300 text-gray-700"} disabled:opacity-50 disabled:cursor-not-allowed border rounded-lg p-2 shadow-md transition-all`}
                title="Zoom Out"
              >
                <ZoomOut
                  className={`w-4 h-4 ${dark ? "text-gray-300" : "text-gray-700"}`}
                />
              </button>
            </div>

            <ComposableMap
              projection="geoMercator"
              projectionConfig={{
                center: currentConfig.center,
                scale: currentConfig.scale,
              }}
              style={{
                width: "100%",
                height: "500px",
                cursor: "pointer",
                background: dark ? "#0d0d0d" : "#f0f4f8",
              }}
            >
              <ZoomableGroup
                zoom={zoom}
                center={currentConfig.center}
                minZoom={1}
                maxZoom={8}
              >
                <Geographies geography="/world-110m.json">
                  {({ geographies }) =>
                    geographies.map((geo) => (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={dark ? "#1e2a35" : "#dce8f0"}
                        stroke={dark ? "#2d4a5e" : "#9bb8cc"}
                        strokeWidth={0.8}
                        style={{
                          default: {
                            outline: "none",
                            fill: dark ? "#1e2a35" : "#dce8f0",
                            stroke: dark ? "#2d4a5e" : "#9bb8cc",
                          },
                          hover: {
                            outline: "none",
                            fill: dark ? "#2a3f52" : "#ffd5cf",
                            stroke: "#ff4000",
                          },
                          pressed: { outline: "none" },
                        }}
                      />
                    ))
                  }
                </Geographies>
                {acceleratorsByRegion[selectedRegion].map((program, idx) => (
                  <Marker key={idx} coordinates={program.coordinates}>
                    <circle
                      r={5}
                      fill="#ff4000"
                      stroke="#fff"
                      strokeWidth={2}
                    />
                    <circle
                      r={8}
                      fill="none"
                      stroke="#ff4000"
                      strokeWidth={1}
                      opacity={0.3}
                    />
                    <title>{program.name}</title>
                  </Marker>
                ))}
              </ZoomableGroup>
            </ComposableMap>
          </div>

          {/* List */}
          <div
            className="space-y-2 overflow-y-auto"
            style={{ maxHeight: "500px" }}
          >
            {acceleratorsByRegion[selectedRegion].map((program, idx) => (
              <a
                key={idx}
                href={program.website}
                target="_blank"
                rel="noopener noreferrer"
                className={`block p-3 rounded-lg border hover:border-[#ff4000] hover:shadow-md transition-all cursor-pointer ${dark ? "bg-[#111] border-gray-700" : "bg-white border-gray-200"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm hover:text-[#ff4000] transition-colors">
                      {program.name}
                    </h3>
                    <p
                      className={`text-xs mt-0.5 ${dark ? "text-gray-400" : "text-gray-600"}`}
                    >
                      {program.location}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="border border-[#ff4000] text-[#ff4000] rounded-full px-2 py-0.5 text-xs shrink-0"
                  >
                    {program.type}
                  </Badge>
                </div>
                <p
                  className={`text-xs mt-2 ${dark ? "text-gray-500" : "text-muted-foreground"}`}
                >
                  {program.focus}
                </p>
              </a>
            ))}
          </div>
        </div>
      </Card>

    </>
  );
}

export function FeedbackDashboard({
  data,
  startupName,
  onContinueToExplore,
  isNavigating,
  dark,
}: {
  data: FeedbackData;
  startupName?: string;
  onContinueToExplore?: () => void;
  isNavigating?: boolean;
  dark?: boolean;
}) {
  // RAG thresholds for /10 scores: 0-3 Red, 4-7 Amber, 8-10 Green
  const getScoreColor = (score: number) => {
    if (score >= 8) return "text-emerald-500";
    if (score >= 4) return "text-amber-500";
    return "text-rose-500";
  };

  const getProgressColor = (score: number) => {
    if (score >= 8) return "bg-emerald-500";
    if (score >= 4) return "bg-amber-500";
    return "bg-rose-500";
  };

  // For overall score /100: scale proportionally
  const getStrokeColor = (score: number) => {
    if (score >= 80) return "stroke-emerald-500";
    if (score >= 40) return "stroke-amber-500";
    return "stroke-rose-500";
  };

  return (
    <div className={`min-h-screen ${dark ? "bg-[#0d0d0d]" : "bg-background"}`}>
      <div className="px-4 pb-6">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-3 ">
            <h1 className="text-lg font-bold mb-2 text-balance">
              {startupName
                ? `${startupName} Pitch Analysis`
                : "Pitch Analysis Feedback"}
            </h1>
          </div>

          <p className={`text-sm ${dark ? "text-gray-400" : "text-gray-600"}`}>
            Pitch analysis powered by Google Gemini with RAG-grounded investor
            insights
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mb-2">
          {/* Left: Overall Score - Circular */}
          <Card className={`p-4 ${dark ? "bg-[#1a1a1a]" : "bg-[#fffaf9]"}`}>
            <div className="mb-2">
              <p className="text-sm uppercase tracking-wide font-semibold">
                Overall Score
              </p>
            </div>

            {/* Circular Progress centered below header */}
            <div className="flex flex-col items-center justify-center py-2">
              <div className="relative w-56 h-56">
                <svg
                  className="w-56 h-56 transform -rotate-90"
                  viewBox="0 0 160 160"
                >
                  {/* Background circle */}
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    stroke={dark ? "#2a2a2a" : "white"}
                    strokeWidth="12"
                    fill="none"
                    className="text-muted"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    strokeWidth="12"
                    fill="none"
                    strokeLinecap="round"
                    className={getStrokeColor(data.overall_score)}
                    style={{
                      strokeDasharray: `${2 * Math.PI * 70}`,
                      strokeDashoffset: `${
                        2 * Math.PI * 70 * (1 - data.overall_score / 100)
                      }`,
                      transition: "stroke-dashoffset 1s ease",
                    }}
                  />
                  {/* Benchmark tick at 62/100 (avg. seed stage) */}
                  {(() => {
                    const a = (62 / 100) * 2 * Math.PI;
                    return (
                      <line
                        x1={80 + 76 * Math.cos(a)}
                        y1={80 + 76 * Math.sin(a)}
                        x2={80 + 62 * Math.cos(a)}
                        y2={80 + 62 * Math.sin(a)}
                        stroke="#94a3b8"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                      />
                    );
                  })()}
                </svg>
                {/* Score text overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div
                    className={`text-5xl font-bold ${getStrokeColor(data.overall_score).replace("stroke-", "text-")}`}
                  >
                    {data.overall_score}
                  </div>
                  <p className="text-sm text-muted-foreground">out of 100</p>
                </div>
              </div>
              {/* Benchmark legend */}
              <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-400">
                <span className="inline-block w-3 h-0.5 rounded bg-slate-400" />
                <span>Avg. Seed Stage: 62</span>
              </div>
            </div>
          </Card>

          {/* Center: Radar Chart */}
          <Card
            className={`p-4 border ${dark ? "bg-[#1a1a1a] border-gray-800" : "bg-[#fffaf9]"}`}
          >
            <p className="text-sm uppercase tracking-wide font-semibold mb-1">
              Score Radar
            </p>
            <ResponsiveContainer width="100%" height={320}>
              <RadarChart
                data={Object.entries(data.scores).map(([key, value]) => ({
                  subject: key
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase()),
                  score: value,
                }))}
                margin={{ top: 10, right: 30, bottom: 10, left: 30 }}
              >
                <PolarGrid stroke={dark ? "#2a2a2a" : "#e5e7eb"} />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: dark ? "#9ca3af" : "#6b7280", fontSize: 10 }}
                />
                <PolarRadiusAxis
                  domain={[0, 10]}
                  tick={false}
                  axisLine={false}
                />
                <Radar
                  dataKey="score"
                  stroke="#ff4000"
                  fill="#ff4000"
                  fillOpacity={0.2}
                  strokeWidth={2}
                  dot={{ fill: "#ff4000", r: 3 } as any}
                />
              </RadarChart>
            </ResponsiveContainer>
          </Card>

          {/* Right: Detailed Score Bars */}
          <Card
            className={`p-4 border ${dark ? "bg-[#1a1a1a] border-gray-800" : "bg-[#fffaf9]"}`}
          >
            <p className="text-sm uppercase tracking-wide font-semibold mb-1">
              Detailed Score
            </p>
            <div className="flex flex-col gap-3 mt-2">
              {Object.entries(data.scores).map(([key, value]) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span
                      className={`text-xs capitalize ${dark ? "text-gray-400" : "text-muted-foreground"}`}
                    >
                      {key.replace(/_/g, " ")}
                    </span>
                    <span
                      className={`text-xs font-bold ${getScoreColor(value)}`}
                    >
                      {value}/10
                    </span>
                  </div>
                  <div
                    className={`relative w-full h-1.5 rounded-full overflow-hidden border ${dark ? "bg-[#2a2a2a] border-gray-700" : "bg-white border-gray-200"}`}
                  >
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full transition-all ${getProgressColor(value)}`}
                      style={{ width: `${(value / 10) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Suggested Improvements */}
        <Card
          className={`p-4 mb-2 border ${dark ? "bg-[#1a1a1a] border-gray-800" : "bg-[#fffaf9]"}`}
        >
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-[#ff4000]" />
            <h2 className="text-sm uppercase tracking-wide font-semibold">
              Suggested Improvements
            </h2>
          </div>
          <ul className="space-y-2">
            {data.suggested_improvements.map((improvement, idx) => (
              <li key={idx} className="flex gap-3 text-sm leading-relaxed">
                <span className="text-muted-foreground">•</span>
                <span>{improvement}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Strengths and Risks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
          {/* Strengths */}
          <Card
            className={`p-4 border ${dark ? "bg-[#1a1a1a] border-gray-800" : "bg-[#fffaf9]"}`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <h2 className="text-sm uppercase tracking-wide font-semibold">
                Top Strengths
              </h2>
            </div>
            <ul className="space-y-1">
              {data.top_strengths.map((strength, idx) => (
                <li key={idx} className="flex gap-2 text-sm leading-relaxed">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-1 shrink-0" />
                  <span>{strength}</span>
                </li>
              ))}
            </ul>
          </Card>

          {/* Risks */}
          <Card
            className={`p-4 border ${dark ? "bg-[#1a1a1a] border-gray-800" : "bg-[#fffaf9]"}`}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500" />
              <h2 className="text-sm uppercase tracking-wide font-semibold">
                Top Risks
              </h2>
            </div>
            <ul className="space-y-1">
              {data.top_risks.map((risk, idx) => (
                <li key={idx} className="flex gap-2 text-sm leading-relaxed">
                  <AlertCircle className="w-4 h-4 text-rose-500 mt-1 shrink-0" />
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Missing Information */}
        <Card
          className={`p-4 mb-2 border ${dark ? "bg-[#1a1a1a] border-gray-800" : "bg-[#fffaf9]"}`}
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[#ff4000]" />
            <h2 className="text-sm uppercase tracking-wide font-semibold">
              Missing Information
            </h2>
          </div>
          <ul className="space-y-1">
            {data.missing_info.map((info, idx) => (
              <li key={idx} className="flex gap-2 text-sm leading-relaxed">
                <span className="text-muted-foreground mt-1">•</span>
                <span>{info}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Rewritten Pitch */}
        <Card
          className={`p-4 mb-2 border ${dark ? "bg-[#1a1a1a] border-gray-800" : "bg-[#fffaf9]"}`}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#ff4000]" />
            <h2 className="text-sm uppercase tracking-wide font-semibold">
              Rewritten Pitch
            </h2>
            <Badge
              variant="secondary"
              className="ml-2 border border-[#ff4000] text-[#ff4000] rounded-full px-2 py-0.5"
            >
              Improved Version
            </Badge>
          </div>
          <p className="text-sm leading-relaxed">{data.rewritten_pitch}</p>
        </Card>

        {/* Follow-up Questions */}
        <Card
          className={`p-4 border mb-2 ${dark ? "bg-[#1a1a1a] border-gray-800" : "bg-[#fffaf9]"}`}
        >
          <div className="flex items-center gap-2 ">
            <MessageSquare className="w-4 h-4 text-[#ff4000]" />
            <h2 className="text-sm uppercase tracking-wide font-semibold">
              Follow-up Questions
            </h2>
          </div>
          <ul className="space-y-2">
            {data.follow_up_questions.map((question, idx) => (
              <li key={idx} className="flex gap-3 text-sm leading-relaxed">
                <span className="text-primary font-semibold">{idx + 1}.</span>
                <span>{question}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Accelerator Map */}
        <AcceleratorMap dark={dark} />
      </div>
    </div>
  );
}

// Default export expected by pages that import this file.
// This component now fetches feedback for a pitch on mount.
export default function ReviewFeedbackClient({
  params,
  searchParams,
  user,
  dark,
}: any) {
  const paramsFromHook = useParams();
  const router = useRouter();
  const [data, setData] = useState<FeedbackData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [startupName, setStartupName] = useState<string | null>(null);
  const [pitchId, setPitchId] = useState<string | null>(null);
  const [markingReview, setMarkingReview] = useState<boolean>(false);

  useEffect(() => {
    // Priority order:
    // 1. client-side hook params (useParams) - works after hydration / client navigation
    // 2. server-provided `params` prop passed from the page
    // 3. searchParams.pitch_id
    // 4. sessionStorage fallback if the app previously stored the pitch id
    let pitchId =
      paramsFromHook?.pitch_id ??
      params?.pitch_id ??
      params?.id ??
      searchParams?.pitch_id;

    if (!pitchId && typeof window !== "undefined") {
      pitchId =
        sessionStorage.getItem("pitch_session_id") ||
        sessionStorage.getItem("pitch_id") ||
        null;
    }

    if (!pitchId) {
      setError("No pitch id provided in route params.");
      setLoading(false);
      return;
    }

    const apiBase = (
      process.env.NEXT_PUBLIC_DEMODAY_API_URI ||
      (process.env.DEMODAY_API_URI as string) ||
      ""
    ).replace(/\/$/, "");

    if (!apiBase) {
      setError("API base URL not configured (NEXT_PUBLIC_DEMODAY_API_URI).");
      setLoading(false);
      return;
    }

    const abortController = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `${apiBase}/pitch/${encodeURIComponent(String(pitchId))}`,
          {
            signal: abortController.signal,
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => res.statusText);
          throw new Error(`Failed to fetch pitch: ${res.status} ${text}`);
        }

        const json = await res.json();

        // Backend returns shape with `score` and `feedback` objects.
        const scoreObj = json.score ?? {};
        const fb = json.feedback ?? {};

        const mapped: FeedbackData = {
          overall_score: Number(scoreObj.overall_score ?? 0),
          scores: scoreObj.scores ?? (scoreObj as any) ?? {},
          top_strengths: fb.top_strengths ?? [],
          top_risks: fb.top_risks ?? [],
          missing_info: fb.missing_info ?? [],
          suggested_improvements: fb.suggested_improvements ?? [],
          rewritten_pitch: fb.rewritten_pitch ?? "",
          follow_up_questions: fb.follow_up_questions ?? [],
          tts_summary: fb.tts_summary ?? "",
        };

        // capture startup name from API (backend returns `startup_name`)
        const apiStartupName = json.startup_name ?? json.startupName ?? null;
        setStartupName(apiStartupName);

        // store resolved pitch id for later actions
        setPitchId(String(pitchId));
        setData(mapped);
      } catch (err: any) {
        if (err.name === "AbortError") return;
        console.error("[ReviewFeedbackClient] fetch error:", err);
        setError(err?.message ?? "Failed to load pitch feedback");
      } finally {
        setLoading(false);
      }
    })();

    return () => abortController.abort();
  }, [params, searchParams]);

  // Handler for marking review as completed
  const markReviewCompleted = async () => {
    if (!pitchId) {
      setError("No pitch id available to mark review completed.");
      return;
    }

    const apiBase = (
      process.env.NEXT_PUBLIC_DEMODAY_API_URI ||
      (process.env.DEMODAY_API_URI as string) ||
      ""
    ).replace(/\/$/, "");

    if (!apiBase) {
      setError("API base URL not configured (NEXT_PUBLIC_DEMODAY_API_URI).");
      return;
    }

    try {
      setMarkingReview(true);
      setError(null);
      const res = await fetch(
        `${apiBase}/pitch/${encodeURIComponent(
          String(pitchId),
        )}/review-completed`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(
          `Failed to mark review completed: ${res.status} ${text}`,
        );
      }

      // navigate to explore
      router.push(
        `/dashboard/explore?id=${encodeURIComponent(String(pitchId))}`,
      );
    } catch (err: any) {
      console.error("[ReviewFeedbackClient] markReviewCompleted error:", err);
      setError(err?.message ?? "Failed to mark review completed");
    } finally {
      setMarkingReview(false);
    }
  };

  if (loading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${dark ? "bg-[#0d0d0d]" : "bg-background"}`}
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-[#ff4000] animate-spin" />
          <p className="text-sm text-muted-foreground">Loading feedback</p>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-rose-600">Error: {error}</div>;
  }

  if (!data) {
    return <div className="p-6">No feedback available for this pitch.</div>;
  }

  return (
    <FeedbackDashboard
      data={data}
      startupName={startupName ?? undefined}
      onContinueToExplore={markReviewCompleted}
      isNavigating={markingReview}
      dark={dark}
    />
  );
}
