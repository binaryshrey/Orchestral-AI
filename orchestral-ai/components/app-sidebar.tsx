"use client";

import * as React from "react";
import {
  IconDashboard,
  IconFolder,
  IconHelp,
  IconSettings,
} from "@tabler/icons-react";
import Image from "next/image";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export interface SidebarUser {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  profilePictureUrl?: string | null;
}

const navMain = [
  { title: "Dashboard", url: "/dashboard", icon: IconDashboard },
  { title: "Files", url: "/files", icon: IconFolder },
  { title: "Settings", url: "/settings", icon: IconSettings },
  {
    title: "Get Help",
    url: "https://github.com/binaryshrey/Demoday-AI-QuackHacks/issues",
    icon: IconHelp,
  },
];

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: SidebarUser;
}

export function AppSidebar({ user, ...props }: AppSidebarProps) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <a href="#">
                <Image src="/logo-light.svg" alt="DemoDay AI" width={20} height={20} className="size-5!" />
                <span className="text-base font-semibold">DemoDay AI</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
