import { withAuth } from "@workos-inc/authkit-nextjs";
import ProfileMenu from "./ProfileMenu";

export default async function ProfileMenuWrapper() {
  const { user } = await withAuth();

  if (!user) return null;

  return <ProfileMenu user={user} />;
}
