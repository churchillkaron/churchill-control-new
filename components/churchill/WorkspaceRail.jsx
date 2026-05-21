"use client";

import Link from "next/link";

import { usePathname } from "next/navigation";

import {
  Activity,
  BarChart3,
  Brain,
  BriefcaseBusiness,
  Cpu,
  LayoutDashboard,
  Megaphone,
  Monitor,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wallet,
  ChefHat,
  Boxes,
  Package,
  ClipboardList,
} from "lucide-react";

import {
  usePlatformNavigation,
} from "@/lib/platform/hooks/usePlatformNavigation";

const ICONS = {

  dashboard:
    LayoutDashboard,

  monitoring:
    Monitor,

  intelligence:
    Brain,

  automation:
    Cpu,

  governance:
    ShieldCheck,

  management:
    ClipboardList,

  pos:
    ShoppingCart,

  kitchen:
    ChefHat,

  production:
    Boxes,

  inventory:
    Package,

  procurement:
    ClipboardList,

  finance:
    Wallet,

  payroll:
    Wallet,

  analytics:
    BarChart3,

  history:
    Activity,

  staff:
    Users,

  marketing:
    Megaphone,

  settings:
    Settings,

};

export default function WorkspaceRail() {

  const pathname =
    usePathname();

  const navigation =
    usePlatformNavigation();

  const PLATFORM_ITEMS = [

    {
      id: "dashboard",
      title: "Dashboard",
      route: "/dashboard",
      icon: LayoutDashboard,
    },

    ...navigation.flatMap(
      group =>
        group.domains.map(
          domain => ({

            id:
              domain.name,

            title:
              domain.name
                .replaceAll("-", " ")
                .replace(
                  /\b\w/g,
                  l => l.toUpperCase()
                ),

            route:
              `/${domain.name}`,

            icon:
              ICONS[
                domain.name
              ] || Cpu,

          })
        )
    ),

  ];

  const uniqueItems =
    PLATFORM_ITEMS.filter(
      (
        item,
        index,
        self
      ) =>

        index ===
        self.findIndex(
          i =>
            i.route ===
            item.route
        )
    );

  return (

    <aside className="fixed left-0 top-0 z-50 flex h-screen w-[84px] flex-col items-center border-r border-white/10 bg-black/80 backdrop-blur-xl">

      {/* LOGO */}

      <div className="flex h-[90px] w-full items-center justify-center border-b border-white/10">

        <Link href="/dashboard">

          <img
            src="/branding/avantiqo-logo.png"
            alt="AVANTIQO"
            className="h-12 w-auto object-contain"
          />

        </Link>

      </div>

      {/* NAVIGATION */}

      <div className="flex flex-1 flex-col items-center gap-3 py-6 overflow-y-auto">

        {uniqueItems.map(
          item => {

            const Icon =
              item.icon;

            const active =

              pathname ===
              item.route ||

              pathname.startsWith(
                `${item.route}/`
              );

            return (

              <Link
                key={
                  item.id
                }
                href={
                  item.route
                }
                className={`
                  group relative flex h-14 w-14 items-center justify-center rounded-2xl transition-all

                  ${
                    active

                      ? "bg-violet-500 text-white shadow-2xl shadow-violet-500/20"

                      : "text-white/50 hover:bg-white/10 hover:text-white"
                  }
                `}
              >

                <Icon className="h-5 w-5" />

                <div className="pointer-events-none absolute left-[74px] whitespace-nowrap rounded-xl border border-white/10 bg-black px-3 py-2 text-sm opacity-0 shadow-2xl transition-all group-hover:opacity-100">

                  {
                    item.title
                  }

                </div>

              </Link>

            );

          }
        )}

      </div>

      {/* FOOTER */}

      <div className="border-t border-white/10 p-4">

        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-xs font-medium text-white/60">

          AV

        </div>

      </div>

    </aside>

  );

}
