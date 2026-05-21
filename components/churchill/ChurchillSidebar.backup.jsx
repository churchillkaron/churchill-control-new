"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Home,
  ShieldCheck,
  Database,
} from "lucide-react";

import { buildPlatformNavigation } from "@/lib/navigation/buildPlatformNavigation";

export default function ChurchillSidebar() {

  const pathname = usePathname();

  const groupedModules =
    useMemo(
      () =>
        buildPlatformNavigation(),
      []
    );

  const normalizedGroups = {

    Workspace: [
      {
        module_id: "dashboard",
        module_name: "Command Center",
        route: "/dashboard",
        icon: Home,
      },

      {
        module_id: "knowledge-core",
        module_name: "Knowledge Core",
        route: "/knowledge-core",
        icon: ShieldCheck,
      },
    ],

    Modules:
      Array.isArray(groupedModules)
        ? groupedModules
        : Object.values(groupedModules || {})
            .flat()
            .map((item) => ({

              module_id:
                item.name,

              module_name:
                item.name
                  ?.replaceAll("-", " ")
                  ?.replace(/\b\w/g, (l) =>
                    l.toUpperCase()
                  ),

              route:
                item.name?.startsWith("/")
                  ? item.name
                  : `/${item.name}`,

              icon:
                Database,

            })),

  };

  return (

    <aside className="fixed left-0 top-0 z-40 h-screen w-[290px] border-r border-white/10 bg-black/80 backdrop-blur-xl">

      <div className="p-6 border-b border-white/10">

        <div className="text-xs uppercase tracking-[0.3em] text-violet-400 mb-2">
          Avantiqo
        </div>

        <div className="text-3xl font-light text-white">
          Churchill
        </div>

        <div className="text-sm text-white/40 mt-2">
          Enterprise Workspace
        </div>

      </div>

      <div className="p-4 space-y-6 overflow-y-auto h-[calc(100vh-130px)]">

        {Object.entries(normalizedGroups).map(
          ([group, items]) => (

            <div key={group}>

              <div className="text-[11px] uppercase tracking-[0.22em] text-white/30 px-3 mb-3">
                {group}
              </div>

              <div className="space-y-1">

                {items.map((item) => {

                  const Icon =
                    item.icon || Database;

                  const active =
                    pathname === item.route ||
                    pathname.startsWith(
                      `${item.route}/`
                    );

                  return (

                    <Link
                      key={item.module_id}
                      href={item.route}
                      className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all ${
                        active
                          ? "bg-violet-500 text-white"
                          : "text-white/60 hover:bg-white/10 hover:text-white"
                      }`}
                    >

                      <Icon className="w-5 h-5" />

                      <div className="flex-1">

                        <div className="text-sm font-medium">
                          {item.module_name}
                        </div>

                        {item.module_id !== "dashboard" &&
                          item.module_id !== "knowledge-core" && (

                            <div className="text-[11px] opacity-60 uppercase">
                              {item.module_id}
                            </div>

                          )}

                      </div>

                    </Link>

                  );

                })}

              </div>

            </div>

          )
        )}

      </div>

    </aside>

  );

}