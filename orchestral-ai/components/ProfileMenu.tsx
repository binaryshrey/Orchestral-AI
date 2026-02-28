/************************************************************ IMPORTS ************************************************************/

"use client";

import Link from "next/link";
import Image from "next/image";
import {
  RiHome6Line,
  RiUserSmileLine,
  RiLogoutCircleRLine,
} from "@remixicon/react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { handleSignOut } from "@/app/actions/auth";

/************************************************************ IMPORTS ************************************************************/

interface ProfileMenuProps {
  user: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    profilePictureUrl?: string | null;
  };
}

export default function ProfileMenu({ user }: ProfileMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Image
          className="h-8 w-8 rounded-full cursor-pointer"
          src={user?.profilePictureUrl || "/default-avatar.png"}
          alt="ProfilePic"
          width={32}
          height={32}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <div className="flex items-center gap-2 p-2">
          <Image
            className="h-8 w-8 rounded-full cursor-pointer"
            src={user?.profilePictureUrl || "/default-avatar.png"}
            alt="ProfilePic"
            width={32}
            height={32}
          />
          <div className="grid gap-0.5 leading-none">
            <div className="font-semibold">
              {user?.firstName} {user?.lastName}
            </div>
            <div className="text-sm text-muted-foreground">{user?.email}</div>
          </div>
        </div>

        <DropdownMenuSeparator />

        <Link href="/profile" className="flex items-center w-full">
          <DropdownMenuItem className="w-full cursor-pointer">
            <div className="flex gap-2 items-center">
              <RiUserSmileLine className="h-4 w-4" />
              <span>Profile</span>
            </div>
          </DropdownMenuItem>
        </Link>

        <Link href="/dashboard" className="flex items-center w-full">
          <DropdownMenuItem className="w-full cursor-pointer">
            <div className="flex gap-2 items-center">
              <RiHome6Line className="h-4 w-4" />
              <span>Dashboard</span>
            </div>
          </DropdownMenuItem>
        </Link>

        <DropdownMenuSeparator />

        <form action={handleSignOut}>
          <DropdownMenuItem asChild className="w-full cursor-pointer">
            <button type="submit" className="flex gap-2 items-center w-full">
              <RiLogoutCircleRLine className="h-4 w-4" />
              <span>Sign out</span>
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
