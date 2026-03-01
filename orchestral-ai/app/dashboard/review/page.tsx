import { withAuth } from "@workos-inc/authkit-nextjs";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DashboardStepper } from "@/components/DashboardStepper";
import ReviewNext from "./ReviewNext";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  void id;
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
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="mx-auto w-full max-w-6xl px-6 lg:px-8">
            <DashboardStepper currentStep={4} />
          </div>
        </div>
        <ReviewNext />
      </SidebarInset>
    </SidebarProvider>
  );
}
