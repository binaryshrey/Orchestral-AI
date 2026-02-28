"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";

export function UserBadge() {
  const { user, loading } = useAuth({ ensureSignedIn: false });

  if (loading) return <span>Loading…</span>;
  if (!user) return <span>Guest</span>;

  return <span>{user.email}</span>;
}
