import { withAuth } from "@workos-inc/authkit-nextjs";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import ReviewFeedbackClient from "@/components/ReviewFeedbackClient";
import ChatBar from "@/components/ChatBar";

interface Params {
  params: { pitch_id?: string };
  searchParams?: Record<string, string | string[] | undefined>;
}

export default async function ReviewFeedbackPage({
  params,
  searchParams,
}: Params) {
  const { user } = await withAuth();

  if (!user) return null;

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" user={user} />
      <SidebarInset className="flex flex-col overflow-hidden" style={{ height: "100dvh" }}>
        <SiteHeader />
        <div className="flex-1 overflow-auto">
          <ReviewFeedbackClient
            params={params}
            searchParams={searchParams}
            user={user}
            dark={true}
          />
        </div>
        <ChatBar />
      </SidebarInset>
    </SidebarProvider>
  );
}
