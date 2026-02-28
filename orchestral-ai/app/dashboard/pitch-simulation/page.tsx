import { withAuth } from "@workos-inc/authkit-nextjs";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import PitchSimulationClient from "@/components/PitchSimulationClient";
import { DashboardStepper } from "@/components/DashboardStepper";

export default async function DashboardPitchSimulation({
  searchParams,
}: {
  searchParams: Promise<{
    autoStart?: string;
    duration?: string;
    id?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const { user } = await withAuth();
  if (!user) return null;

  const autoStart = resolvedSearchParams?.autoStart !== "false";
  let duration = 2;
  if (resolvedSearchParams?.duration) {
    const raw = parseFloat(resolvedSearchParams.duration);
    duration = raw >= 30 ? raw / 60 : raw;
  }

  return (
    <SidebarProvider
      defaultOpen={false}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" user={user} />
      <SidebarInset
        className="flex flex-col overflow-hidden"
        style={{ height: "100dvh" }}
      >
        <SiteHeader />
        <div className="mx-auto w-full max-w-6xl px-6 lg:px-8 shrink-0">
          <DashboardStepper currentStep={2} />
        </div>

        {/* Pitch simulation fills remaining space */}
        <div className="flex-1 relative overflow-hidden min-h-0">
          <PitchSimulationClient
            autoStart={autoStart}
            duration={duration}
            user={user}
            embedded
            pitchSessionId={resolvedSearchParams.id}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
