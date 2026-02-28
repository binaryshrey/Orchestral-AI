// app/files/page.tsx
import { withAuth } from "@workos-inc/authkit-nextjs";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import FilesUploader from "@/components/FilesUploader";
import FilesTableClient from "@/components/FilesTableClient";

export default async function FilesPage() {
  const { user } = await withAuth();

  if (!user) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Not signed in</h1>
        <p>You should have been redirected. Try going back to the homepage.</p>
      </main>
    );
  }

  const apiUrl = process.env.NEXT_PUBLIC_DEMODAY_API_URI;
  let sessions: any[] = [];
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
  } else {
    console.warn("NEXT_PUBLIC_DEMODAY_API_URI not configured");
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
      <AppSidebar variant="inset" user={user} />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col px-4 pb-6 pt-4 md:px-6">
          {/* Upload Section */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Upload Files
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Add documents to your pitch files.
            </p>
            <FilesUploader />
          </div>

          {/* Files List Section */}
          <div className="rounded-lg border border-border bg-card">
            {/* Toolbar */}
            <div className="px-6 py-4 border-b border-border">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">
                  Pitch Files
                </h2>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-muted-foreground">
                    Sort by:{" "}
                    <select className="border-0 bg-transparent text-[#fc7249] font-medium focus:ring-0 cursor-pointer">
                      <option>Date: Most Recent</option>
                      <option>Name</option>
                      <option>Size</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <FilesTableClient sessions={sessions} />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
