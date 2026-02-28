import { withAuth } from "@workos-inc/authkit-nextjs";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DashboardPageContent } from "@/components/DashboardPageContent";

export default async function Page() {
  const { user } = await withAuth();

  let sessions: any[] = [];
  if (user) {
    const apiUrl = process.env.NEXT_PUBLIC_DEMODAY_API_URI;
    if (apiUrl) {
      try {
        const res = await fetch(
          `${apiUrl}/pitch-sessions?user_id=${encodeURIComponent(user.id)}&limit=100`,
          { cache: "no-store" }
        );
        if (res.ok) {
          sessions = await res.json();
        } else {
          console.error("Failed to fetch pitch sessions", res.statusText);
        }
      } catch (err) {
        console.error("Error fetching pitch sessions:", err);
      }
    }
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" user={user ?? undefined} />
      <SidebarInset>
        <div className="@container/main flex flex-1 flex-col">
          <DashboardPageContent sessions={sessions} user={user ?? undefined} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
