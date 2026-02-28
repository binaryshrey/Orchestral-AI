import { withAuth } from "@workos-inc/authkit-nextjs";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import OnboardForm from "@/components/OnboardForm";
import { DashboardStepper } from "@/components/DashboardStepper";

export default async function DashboardOnboard() {
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
            <DashboardStepper currentStep={1} />

            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-5xl">
                DemoDay AI Investor Pitch Setup
              </h1>
              <p className="mt-2 text-md leading-4 text-gray-100">
                Tell us about your product so we can simulate real investor
                feedback tailored to you.
              </p>
            </div>
            <OnboardForm user={user} />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
