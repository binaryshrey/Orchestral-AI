import { withAuth } from "@workos-inc/authkit-nextjs";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import FeedbackSessionClient from "@/components/FeedbackSessionClient";
import FeedbackConsoleClient from "@/components/FeedbackConsoleClient";
import { DashboardStepper } from "@/components/DashboardStepper";

export default async function DashboardFeedback({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  await searchParams; // consume — id is read from sessionStorage client-side
  const { user } = await withAuth();
  if (!user) return null;

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
          <DashboardStepper currentStep={3} />
        </div>

        {/* Feedback session fills remaining space */}
        <div className="flex-1 relative overflow-hidden min-h-0">
          <FeedbackConsoleClient />
          <FeedbackSessionClient autoStart={true} user={user} embedded />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
