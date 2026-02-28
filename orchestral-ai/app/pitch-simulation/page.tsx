import { withAuth } from "@workos-inc/authkit-nextjs";
import PitchSimulationClient from "@/components/PitchSimulationClient";

export default async function PitchSimulation({
  searchParams,
}: {
  searchParams: Promise<{ autoStart?: string; duration?: string }>;
}) {
  // In Next.js App Router, searchParams is a Promise in server components
  const resolvedSearchParams = await searchParams;

  const { user } = await withAuth();
  if (!user) return null;

  // Always auto-start unless explicitly disabled
  const autoStart = resolvedSearchParams?.autoStart !== "false";
  // The onboard form sends duration in seconds (30, 60, 120, 180).
  // Convert the incoming value to minutes which is what
  // `PitchSimulationClient` expects (e.g. 60 -> 1, 120 -> 2).
  let duration = 2; // Default 2 minutes
  if (resolvedSearchParams?.duration) {
    const raw = parseFloat(resolvedSearchParams.duration);
    // If the value looks like seconds (>= 30), convert to minutes.
    // Otherwise assume it's already minutes (1, 2, 3 etc.).
    duration = raw >= 30 ? raw / 60 : raw;
  }

  return (
    <div className="relative min-h-screen">
      <PitchSimulationClient
        autoStart={autoStart}
        duration={duration}
        user={user}
      />
    </div>
  );
}
