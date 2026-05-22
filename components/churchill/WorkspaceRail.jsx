"use client";

import Link from "next/link";

import { usePathname } from "next/navigation";

import {
  BarChart3,
  Brain,
  ClipboardList,
  Cpu,
  LayoutDashboard,
  Megaphone,
  Monitor,
  Package,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  ChefHat,
  Boxes,
  Table2,
  CreditCard,
} from "lucide-react";

const ICONS = {

  dashboard:
    LayoutDashboard,

  pos:
    ShoppingCart,

  tables:
    Table2,

  kitchen:
    ChefHat,

  expo:
    ClipboardList,

  payment:
    CreditCard,

  orders:
    ClipboardList,

  inventory:
    Package,

  production:
    Boxes,

  procurement:
    ClipboardList,

  finance:
    Wallet,

  accounting:
    Wallet,

  payroll:
    Wallet,

  staff:
    Users,

  analytics:
    BarChart3,

  monitoring:
    Monitor,

  intelligence:
    Brain,

  marketing:
    Megaphone,

  management:
    ClipboardList,

  settings:
    Settings,

};

const NAVIGATION = [

  {
    group: "OPERATIONS",

    items: [

      {
        id: "dashboard",
        title: "Dashboard",
        route: "/dashboard",
      },

      {
        id: "pos",
        title: "POS",
        route: "/pos",
      },

      {
        id: "tables",
        title: "Tables",
        route: "/tables",
      },

      {
        id: "kitchen",
        title: "Kitchen",
        route: "/kitchen",
      },

      {
        id: "expo",
        title: "Expo",
        route: "/kitchen/expo",
      },

      {
        id: "payment",
        title: "Payment",
        route: "/pos/payments",
      },

      {
        id: "orders",
        title: "Orders",
        route: "/history",
      },

    ],
  },

  {
    group: "BUSINESS",

    items: [

      {
        id: "inventory",
        title: "Inventory",
        route: "/inventory",
      },

      {
        id: "production",
        title: "Production",
        route: "/production",
      },

      {
        id: "procurement",
        title: "Procurement",
        route: "/procurement",
      },

      {
        id: "finance",
        title: "Finance",
        route: "/finance",
      },

      {
        id: "accounting",
        title: "Accounting",
        route: "/accounting",
      },

    ],
  },

  {
    group: "PEOPLE",

    items: [

      {
        id: "staff",
        title: "Staff",
        route: "/staff",
      },

      {
        id: "payroll",
        title: "Payroll",
        route: "/payroll",
      },

    ],
  },

  {
    group: "INTELLIGENCE",

    items: [

      {
        id: "analytics",
        title: "Analytics",
        route: "/analytics",
      },

      {
        id: "monitoring",
        title: "Monitoring",
        route: "/monitoring",
      },

      {
        id: "intelligence",
        title: "Intelligence",
        route: "/intelligence",
      },

    ],
  },

  {
    group: "CREATIVE",

    items: [

      {
        id: "marketing",
        title: "Marketing",
        route: "/marketing",
      },

    ],
  },

  {
    group: "MANAGEMENT",

    items: [

      {
        id: "management",
        title: "Management",
        route: "/management",
      },

      {
        id: "settings",
        title: "Settings",
        route: "/settings",
      },

    ],
  },

];

export default function WorkspaceRail() {

  const pathname =
    usePathname();

  return (

    <aside className="fixed left-0 top-0 z-50 flex h-screen w-[96px] flex-col border-r border-white/10 bg-black/90 backdrop-blur-2xl">

      <div className="flex h-[92px] items-center justify-center border-b border-white/10">

        <Link href="/dashboard">

          <img
            src="/branding/avantiqo-logo.png"
            alt="AVANTIQO"
            className="h-14 w-auto object-contain"
          />

        </Link>

      </div>

      <div className="flex-1 overflow-y-auto px-3 py-5">

        <div className="flex flex-col gap-7">

          {NAVIGATION.map(
            section => (

              <div
                key={section.group}
              >

                <div className="mb-3 px-2 text-[10px] font-medium tracking-[0.25em] text-white/30">

                  {section.group}

                </div>

                <div className="flex flex-col gap-2">

                  {section.items.map(
                    item => {

                      const Icon =
                        ICONS[item.id] ||
                        Cpu;

                      const active =

                        pathname ===
                        item.route ||

                        pathname.startsWith(
                          `${item.route}/`
                        );

                      return (

                        <Link
                          key={item.id}
                          href={item.route}
                          title={item.title}
                          className={`
                            group relative flex h-14 items-center justify-center rounded-2xl border transition-all

                            ${
                              active

                                ? "border-violet-500/40 bg-violet-500 text-white shadow-2xl shadow-violet-500/20"

                                : "border-white/5 bg-white/[0.02] text-white/45 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"
                            }
                          `}
                        >

                          <Icon className="h-5 w-5" />

                          <div className="pointer-events-none absolute left-[76px] z-50 whitespace-nowrap rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white opacity-0 shadow-2xl transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100">

                            {item.title}

                          </div>

                        </Link>

                      );

                    }
                  )}

                </div>

              </div>

            )
          )}

        </div>

      </div>

      <div className="border-t border-white/10 p-4">

        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] text-xs font-medium text-white/40">

          AV

        </div>

      </div>

    </aside>

  );

}
