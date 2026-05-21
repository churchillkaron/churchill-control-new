"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Brain,
  ChefHat,
  ClipboardCheck,
  ClipboardList,
  Factory,
  Package,
  Radio,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  Utensils,
  Workflow,
} from "lucide-react";

const OPERATION_SECTIONS = [

  {
    title: "Operational Overview",
    description:
      "Main operational runtime, realtime execution state and enterprise service flow.",
    icon: Activity,
    items: [
      {
        name: "Operations Overview",
        route: "/operations/overview",
      },
      {
        name: "Live Runtime",
        route: "/operations/live",
      },
      {
        name: "Operational Analytics",
        route: "/operations/analytics",
      },
      {
        name: "Realtime Monitoring",
        route: "/monitoring/live",
      },
    ],
  },

  {
    title: "POS & Orders",
    description:
      "Point of sale runtime, order lifecycle, table flow and realtime transactions.",
    icon: ShoppingCart,
    items: [
      {
        name: "POS",
        route: "/pos",
      },
      {
        name: "Orders",
        route: "/orders",
      },
      {
        name: "Floor Runtime",
        route: "/floor",
      },
      {
        name: "Waiter Runtime",
        route: "/waiter/live",
      },
    ],
  },

  {
    title: "Kitchen Runtime",
    description:
      "Kitchen execution, production timing, stations, expo and food workflow.",
    icon: ChefHat,
    items: [
      {
        name: "Kitchen",
        route: "/kitchen",
      },
      {
        name: "Kitchen Live",
        route: "/kitchen/live",
      },
      {
        name: "Expo",
        route: "/expo",
      },
      {
        name: "Kitchen Dashboard",
        route: "/kitchen/dashboard",
      },
      {
        name: "Kitchen Alerts",
        route: "/kitchen/alerts",
      },
      {
        name: "Mission Control",
        route: "/kitchen/mission-control",
      },
    ],
  },

  {
    title: "Production & Inventory",
    description:
      "Recipe runtime, inventory movement, production costing and stock control.",
    icon: Factory,
    items: [
      {
        name: "Production",
        route: "/production",
      },
      {
        name: "Production Performance",
        route: "/production/performance",
      },
      {
        name: "Production Usage",
        route: "/production/usage",
      },
      {
        name: "Inventory",
        route: "/inventory",
      },
      {
        name: "Inventory Analytics",
        route: "/inventory/analytics",
      },
    ],
  },

  {
    title: "Procurement & Supply",
    description:
      "Purchase orders, receiving, procurement execution and vendor supply runtime.",
    icon: Truck,
    items: [
      {
        name: "Procurement",
        route: "/procurement",
      },
      {
        name: "Purchase Orders",
        route: "/procurement/purchase-orders",
      },
      {
        name: "Goods Receipts",
        route: "/procurement/receipts",
      },
      {
        name: "Vendor Runtime",
        route: "/procurement/vendors",
      },
    ],
  },

  {
    title: "Staff Operations",
    description:
      "Realtime staff execution, shifts, attendance and operational performance.",
    icon: Users,
    items: [
      {
        name: "Staff",
        route: "/staff",
      },
      {
        name: "Attendance",
        route: "/attendance",
      },
      {
        name: "Performance",
        route: "/staff/performance",
      },
      {
        name: "Department Performance",
        route: "/performance/departments",
      },
    ],
  },

  {
    title: "Operational Intelligence",
    description:
      "AI operations intelligence, anomaly detection, optimization and orchestration.",
    icon: Brain,
    items: [
      {
        name: "AI Operations",
        route: "/operations/ai",
      },
      {
        name: "Predictive Runtime",
        route: "/predictive/live",
      },
      {
        name: "Decision Engine",
        route: "/decision/live",
      },
      {
        name: "Automation Runtime",
        route: "/automation/live",
      },
      {
        name: "Nerve Center",
        route: "/nervecenter/live",
      },
    ],
  },

  {
    title: "Realtime Control",
    description:
      "Alerts, incidents, service bottlenecks, monitoring and operational control.",
    icon: Radio,
    items: [
      {
        name: "Control Runtime",
        route: "/control/live",
      },
      {
        name: "Alerts",
        route: "/alerts/live",
      },
      {
        name: "System Runtime",
        route: "/system/live",
      },
      {
        name: "Service Runtime",
        route: "/service/live",
      },
      {
        name: "Customer Runtime",
        route: "/customer/live",
      },
    ],
  },

];

const RUNTIME_STATUS = [

  {
    label: "Operations",
    value: "ACTIVE",
    icon: Activity,
  },

  {
    label: "Kitchen",
    value: "ONLINE",
    icon: ChefHat,
  },

  {
    label: "Production",
    value: "READY",
    icon: Factory,
  },

  {
    label: "AI Runtime",
    value: "ARMED",
    icon: Bot,
  },

];

const AI_ACTIONS = [

  "Analyze kitchen bottlenecks",
  "Detect operational anomalies",
  "Forecast inventory shortages",
  "Optimize staffing",
  "Predict production delays",
  "Analyze service timing",

];

export default function OperationsPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      {/* HERO */}

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10">

            <Workflow className="h-5 w-5 text-emerald-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-emerald-400">

            Churchill Operational Runtime

          </div>

        </div>

        <div className="mb-5 flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Operations

            </h1>

            <p className="max-w-4xl text-lg leading-relaxed text-white/50">

              Enterprise operational runtime for POS, kitchen, production,
              inventory, procurement, staffing and realtime execution control.

            </p>

          </div>

          <Link
            href="/operations/live"
            className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm font-medium text-emerald-300 transition-all hover:bg-emerald-500/20"
          >

            Open Live Runtime

          </Link>

        </div>

      </div>

      {/* STATUS */}

      <div className="mb-10 grid grid-cols-4 gap-6">

        {RUNTIME_STATUS.map(
          stat => {

            const Icon =
              stat.icon;

            return (

              <div
                key={stat.label}
                className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6"
              >

                <Icon className="mb-5 h-8 w-8 text-emerald-400" />

                <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

                  {stat.label}

                </div>

                <div className="text-3xl font-light">

                  {stat.value}

                </div>

              </div>

            );

          }
        )}

      </div>

      {/* AI OPERATIONS COMMAND */}

      <div className="mb-10 rounded-[40px] border border-emerald-500/20 bg-emerald-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/10">

              <Sparkles className="h-8 w-8 text-emerald-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Operations AI Command

              </div>

              <div className="text-white/40">

                Ask Churchill to analyze execution, detect bottlenecks or optimize operations.

              </div>

            </div>

          </div>

          <Link
            href="/command/live"
            className="rounded-2xl border border-emerald-500/20 bg-black/30 px-5 py-3 text-sm text-emerald-300 hover:bg-emerald-500/10"
          >

            Open Operational Command

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-emerald-400" />

          <input
            placeholder="Ask AI about kitchen flow, staffing, bottlenecks, production or service..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-emerald-500 px-6 py-3 font-medium text-white transition-all hover:bg-emerald-400">

            Execute

          </button>

        </div>

        <div className="flex flex-wrap gap-3">

          {AI_ACTIONS.map(
            action => (

              <button
                key={action}
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 transition-all hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-white"
              >

                {action}

              </button>

            )
          )}

        </div>

      </div>

      {/* OPERATIONAL SECTIONS */}

      <div className="grid grid-cols-2 gap-6">

        {OPERATION_SECTIONS.map(
          section => {

            const Icon =
              section.icon;

            return (

              <div
                key={section.title}
                className="rounded-[36px] border border-white/10 bg-white/[0.03] p-8"
              >

                <div className="mb-8 flex items-start justify-between gap-6">

                  <div className="flex items-start gap-5">

                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-emerald-500/10">

                      <Icon className="h-8 w-8 text-emerald-400" />

                    </div>

                    <div>

                      <div className="mb-2 text-3xl font-light">

                        {section.title}

                      </div>

                      <div className="max-w-xl leading-relaxed text-white/45">

                        {section.description}

                      </div>

                    </div>

                  </div>

                  <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/40">

                    Runtime

                  </div>

                </div>

                <div className="grid grid-cols-2 gap-3">

                  {section.items.map(
                    item => (

                      <Link
                        key={item.route}
                        href={item.route}
                        className="group rounded-2xl border border-white/10 bg-black/30 p-4 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5"
                      >

                        <div className="flex items-center justify-between gap-3">

                          <div className="text-white/70">

                            {item.name}

                          </div>

                          <ArrowRight className="h-4 w-4 text-white/20 transition-all group-hover:translate-x-1 group-hover:text-emerald-400" />

                        </div>

                      </Link>

                    )
                  )}

                </div>

              </div>

            );

          }
        )}

      </div>

      {/* LOWER STRIP */}

      <div className="mt-10 grid grid-cols-4 gap-6">

        <Link
          href="/kitchen"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5"
        >

          <Utensils className="mb-5 h-8 w-8 text-emerald-400" />

          <div className="mb-2 text-2xl font-light">

            Kitchen

          </div>

          <div className="text-sm text-white/40">

            Realtime kitchen execution runtime.

          </div>

        </Link>

        <Link
          href="/inventory"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/5"
        >

          <Package className="mb-5 h-8 w-8 text-cyan-400" />

          <div className="mb-2 text-2xl font-light">

            Inventory

          </div>

          <div className="text-sm text-white/40">

            Inventory control and stock runtime.

          </div>

        </Link>

        <Link
          href="/production"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-amber-500/40 hover:bg-amber-500/5"
        >

          <Factory className="mb-5 h-8 w-8 text-amber-400" />

          <div className="mb-2 text-2xl font-light">

            Production

          </div>

          <div className="text-sm text-white/40">

            Production, recipes and costing runtime.

          </div>

        </Link>

        <Link
          href="/alerts/live"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-red-500/40 hover:bg-red-500/5"
        >

          <AlertTriangle className="mb-5 h-8 w-8 text-red-400" />

          <div className="mb-2 text-2xl font-light">

            Alerts

          </div>

          <div className="text-sm text-white/40">

            Operational alerts and anomaly detection.

          </div>

        </Link>

      </div>

    </main>

  );

}
