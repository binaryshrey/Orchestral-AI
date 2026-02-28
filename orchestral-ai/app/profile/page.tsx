// app/profile/page.tsx
import { withAuth, signOut } from "@workos-inc/authkit-nextjs";
import Image from "next/image";
import DashboardLayout from "@/components/DashboardLayout";
import { Camera } from "lucide-react";

export default async function ProfilePage() {
  const { user } = await withAuth();

  if (!user) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Not signed in</h1>
        <p>You should have been redirected. Try going back to the homepage.</p>
      </main>
    );
  }

  return (
    <DashboardLayout user={user} currentPage="profile">
      <div className="bg-white shadow -m-1 -mx-1 sm:-mx-1 md:-mx-1 -my-3 overflow-x-hidden">
        {/* Header Background */}
        <div className="relative h-64 bg-[#ffab91]"></div>

        {/* Profile Content */}
        <div className="relative px-8 pb-8 max-w-7xl mx-auto min-h-screen">
          {/* Profile Image */}
          <div className="absolute -top-40 left-8">
            <div className="relative">
              <Image
                className="rounded-full border-4 border-white shadow-lg"
                src={user?.profilePictureUrl || "/default-avatar.png"}
                alt="Profile"
                width={128}
                height={128}
              />
            </div>
          </div>

          {/* Account Details Section */}
          <div className="mt-20">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Account Details
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-3  border-b border-gray-200">
                <span className="text-sm text-gray-600"> Name</span>
                <span className="text-sm font-medium text-gray-900">
                  {user.firstName || "N/A"} {user.lastName || "N/A"}
                </span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-gray-200">
                <span className="text-sm text-gray-600">Email</span>
                <span className="text-sm font-medium text-gray-900">
                  {user.email}
                </span>
              </div>

              <div className="flex justify-between items-center py-3">
                <span className="text-sm text-gray-600">Email Verified</span>
                <span className="text-sm font-medium text-gray-900">
                  {user.emailVerified ? "Yes" : "No"}
                </span>
              </div>
            </div>
          </div>

          {/* Sign Out Button */}
          <div className="mt-8 pt-6 border-t border-gray-200 ">
            <form
              action={async () => {
                "use server";
                await signOut();
              }}
            >
              <button
                type="submit"
                className="w-full px-4 py-3 bg-[#fc7249] text-white rounded-md hover:bg-[#fc7249]/90 transition-colors font-medium cursor-pointer"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
