"use client";

import * as React from "react";
import { useLocation } from "react-router-dom";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutGridIcon,
  FolderIcon,
  FileTextIcon,
  BarChartIcon,
  HelpCircleIcon,
  EyeIcon,
  PanelLeftIcon,
  FileIcon,
  SparklesIcon,
} from "lucide-react";
import { Separator } from "./ui/separator";
import { useUser } from "@clerk/clerk-react";

const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutGridIcon,
    },
    {
      title: "Sessions",
      url: "/sessions",
      icon: FolderIcon,
    },
    {
      title: "Resume",
      url: "/resume",
      icon: FileTextIcon,
      isActive: false,
      items: [
        {
          title: "Upload",
          url: "/resume/all",
        },
        {
          title: "Resume Studio",
          url: "/resume/build",
        },
        {
          title: "Cover Letter",
          url: "/resume/cover-letter",
        },
      ],
    },
    {
      title: "AI Projects",
      url: "/ai-projects",
      icon: FileTextIcon,
    },
    {
      title: "Analytics",
      url: "/analytics",
      icon: BarChartIcon,
    },
    {
      title: "Document",
      url: "/document",
      icon: FileIcon,
    },
    {
      title: "Assistant",
      url: "/assistant",
      icon: SparklesIcon,
    },
    {
      title: "Question Bank",
      url: "/questions",
      icon: HelpCircleIcon,
      isActive: false,
      items: [
        {
          title: "Explore",
          url: "/questions/all",
        },
        {
          title: "My Questions",
          url: "/questions/user",
        },
      ],
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { setOpen, state, toggleSidebar } = useSidebar();
  const { user } = useUser();
  console.log(user?.id);

  const handleLogoClick = () => {
    if (state === "collapsed") {
      setOpen(true);
    }
  };

  const location = useLocation();

  // Dynamically calculate isActive for each item and its sub-items
  const navMainWithActive = data.navMain.map((item) => {
    const isParentActive =
      location.pathname === item.url ||
      (item.items?.some((subItem) => location.pathname === subItem.url) ??
        false);

    return {
      ...item,
      isActive: isParentActive,
      items: item.items?.map((subItem) => ({
        ...subItem,
        isActive: location.pathname === subItem.url,
      })),
    };
  });

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="h-16 flex justify-center">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-3 px-2 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
              <button
                onClick={handleLogoClick}
                className="flex aspect-square size-10 group-data-[collapsible=icon]:size-8 items-center justify-center rounded-lg bg-brand text-white shadow-md transition-all hover:opacity-90 active:scale-95 group-data-[collapsible=icon]:cursor-pointer"
              >
                <EyeIcon className="size-6 group-data-[collapsible=icon]:size-5" />
              </button>
              <div className="flex flex-1 items-center justify-between group-data-[collapsible=icon]:hidden">
                <span className="text-xl font-bold tracking-tight text-gray-900">
                  ScribeShade
                </span>
                <button
                  onClick={toggleSidebar}
                  className="rounded-md p-1 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <PanelLeftIcon className="size-5 text-gray-500" />
                </button>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <Separator className="my-2" />
      <SidebarContent>
        <NavMain items={navMainWithActive} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
