import { withAuth } from "@workos-inc/authkit-nextjs";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import ReviewFeedbackClient from "@/components/ReviewFeedbackClient";
import { DashboardStepper } from "@/components/DashboardStepper";

export default async function DashboardAnalysis({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { user } = await withAuth();
  if (!user) return null;

  const { id } = await searchParams;

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
      <SidebarInset className="flex flex-col overflow-hidden bg-[#0d0d0d]" style={{ height: "100dvh" }}>
        <SiteHeader />
        <div className="mx-auto w-full max-w-6xl px-6 lg:px-8 shrink-0">
          <DashboardStepper currentStep={4} />
        </div>
        <div className="flex-1 overflow-y-auto bg-[#0d0d0d]">
          <ReviewFeedbackClient params={{ id }} user={user} dark={true} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
