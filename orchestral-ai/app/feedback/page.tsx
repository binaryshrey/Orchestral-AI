import { withAuth } from "@workos-inc/authkit-nextjs";
import FeedbackSessionClient from "@/components/FeedbackSessionClient";
import FeedbackConsoleClient from "@/components/FeedbackConsoleClient";

export default async function Feedback() {
  const { user } = await withAuth();

  if (!user) return null;

  return (
    <div className="relative min-h-screen">
      {/* Client component that logs the pitch conversation from sessionStorage */}
      <FeedbackConsoleClient />
      <FeedbackSessionClient autoStart={true} user={user} />
    </div>
  );
}
