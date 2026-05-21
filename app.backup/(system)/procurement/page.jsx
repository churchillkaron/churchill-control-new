"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  Building2,
  ClipboardCheck,
  DollarSign,
  Factory,
  FileCheck2,
  LayoutDashboard,
  Package,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Truck,
  Warehouse,
} from "lucide-react";

const SECTIONS = [

  {
    title: "Procurement Overview",
    description:
      "Main procurement command center, approvals and supply chain visibility.",
    icon: LayoutDashboard,
    items: [
      { name: "Overview", route: "/procurement/overview" },
      { name: "Live Runtime", route: "/procurement/live" },
      { name: "Procurement Dashboard", route: "/procurement/dashboard" },
      { name: "Supply Overview", route: "/procurement/supply" },
    ],
  },

  {
    title: "Purchase Requests",
    description:
      "Purchase request workflows, department requests and approval coordination.",
    icon: ClipboardCheck,
    items: [
      { name: "Purchase Requests", route: "/procurement/requests" },
      { name: "Approval Queue", route: "/procurement/approvals" },
      { name: "Department Requests", route: "/procurement/departments" },
      { name: "Request History", route: "/procurement/request-history" },
      { name: "Urgent Requests", route: "/procurement/urgent" },
    ],
  },

  {
    title: "Purchase Orders",
    description:
      "Purchase order lifecycle, vendor coordination and procurement execution.",
    icon: ShoppingCart,
    items: [
      { name: "Purchase Orders", route: "/procurement/purchase-orders" },
      { name: "Open Orders", route: "/procurement/open-orders" },
      { name: "PO Tracking", route: "/procurement/tracking" },
      { name: "Order History", route: "/procurement/order-history" },
      { name: "PO Analytics", route: "/procurement/order-analytics" },
    ],
  },

  {
    title: "Receiving & Warehouse",
    description:
      "Goods receiving, warehouse coordination and stock intake operations.",
    icon: Warehouse,
    items: [
      { name: "Goods Receiving", route: "/procurement/receipts" },
      { name: "Warehouse Runtime", route: "/procurement/warehouse" },
      { name: "Delivery Tracking", route: "/procurement/deliveries" },
      { name: "Receiving Logs", route: "/procurement/receiving-logs" },
      { name: "Stock Intake", route: "/procurement/intake" },
    ],
  },

  {
    title: "Vendor Management",
    description:
      "Supplier management, contracts and vendor relationship operations.",
    icon: Truck,
    items: [
      { name: "Vendor Runtime", route: "/procurement/vendors" },
      { name: "Supplier Directory", route: "/procurement/suppliers" },
      { name: "Vendor Contracts", route: "/procurement/contracts" },
      { name: "Vendor Performance", route: "/procurement/performance" },
      { name: "Supplier Risk", route: "/procurement/vendor-risk" },
    ],
  },

  {
    title: "Inventory Coordination",
    description:
      "Inventory replenishment, procurement coordination and stock planning.",
    icon: Package,
    items: [
      { name: "Inventory Runtime", route: "/inventory" },
      { name: "Replenishment", route: "/procurement/replenishment" },
      { name: "Low Stock Monitoring", route: "/procurement/low-stock" },
      { name: "Stock Planning", route: "/procurement/planning" },
      { name: "Inventory Analytics", route: "/procurement/inventory-analytics" },
    ],
  },

  {
    title: "Procurement Finance",
    description:
      "Invoice matching, supplier costs and procurement financial operations.",
    icon: DollarSign,
    items: [
      { name: "Invoice Matching", route: "/procurement/matching" },
      { name: "3-Way Match", route: "/procurement/3way-match" },
      { name: "Supplier Costs", route: "/procurement/costs" },
      { name: "Procurement Spend", route: "/procurement/spend" },
      { name: "Financial Approvals", route: "/procurement/financial-approvals" },
    ],
  },

  {
    title: "Analytics & Intelligence",
    description:
      "Procurement analytics, forecasting and supply chain intelligence.",
    icon: BarChart3,
    items: [
      { name: "Procurement Analytics", route: "/procurement/analytics" },
      { name: "Demand Forecasting", route: "/procurement/forecasting" },
      { name: "Cost Trends", route: "/procurement/trends" },
      { name: "Supply Analytics", route: "/procurement/supply-analytics" },
      { name: "Performance Metrics", route: "/procurement/metrics" },
    ],
  },

  {
    title: "AI Procurement Intelligence",
    description:
      "AI procurement optimization, supplier recommendations and operational forecasting.",
    icon: Brain,
    items: [
      { name: "Procurement AI", route: "/procurement/ai" },
      { name: "AI Recommendations", route: "/procurement/recommendations" },
      { name: "Supply Optimization", route: "/procurement/optimization" },
      { name: "Risk Detection", route: "/procurement/risk" },
      { name: "Automation Runtime", route: "/procurement/automation" },
    ],
  },

];

const STATUS = [

  {
    label: "Procurement Runtime",
    value: "ACTIVE",
  },

  {
    label: "Supply Chain",
    value: "ONLINE",
  },

  {
    label: "Warehouse",
    value: "RUNNING",
  },

  {
    label: "Procurement AI",
    value: "ARMED",
  },

];

const QUICK_ACTIONS = [

  "Review urgent requests",
  "Analyze supplier costs",
  "Check low stock items",
  "Review pending approvals",
  "Forecast demand",
  "Analyze procurement spend",

];

export default function ProcurementPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10">

            <ShoppingCart className="h-5 w-5 text-amber-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-amber-400">

            Churchill Platform

          </div>

        </div>

        <div className="flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Procurement

            </h1>

            <p className="max-w-5xl text-lg leading-relaxed text-white/50">

              Enterprise procurement runtime for purchasing, warehouse coordination,
              vendor management, receiving and supply chain intelligence.

            </p>

          </div>

          <Link
            href="/procurement/live"
            className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm font-medium text-amber-300 hover:bg-amber-500/20"
          >

            Open Procurement Runtime

          </Link>

        </div>

      </div>

      <div className="mb-10 grid grid-cols-4 gap-6">

        {STATUS.map((item) => (

          <div
            key={item.label}
            className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6"
          >

            <div className="mb-5 h-8 w-8 rounded-2xl bg-amber-500/10" />

            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

              {item.label}

            </div>

            <div className="text-3xl font-light">

              {item.value}

            </div>

          </div>

        ))}

      </div>

      <div className="mb-10 rounded-[40px] border border-amber-500/20 bg-amber-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-500/10">

              <Sparkles className="h-8 w-8 text-amber-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Procurement AI Command

              </div>

              <div className="text-white/40">

                Analyze procurement risk, supplier costs and warehouse operations.

              </div>

            </div>

          </div>

          <Link
            href="/procurement/ai"
            className="rounded-2xl border border-amber-500/20 bg-black/30 px-5 py-3 text-sm text-amber-300"
          >

            Open Procurement Intelligence

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-amber-400" />

          <input
            placeholder="Ask procurement AI to analyze vendors, inventory demand or procurement costs..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-amber-500 px-6 py-3 font-medium text-white">

            Run

          </button>

        </div>

        <div className="flex flex-wrap gap-3">

          {QUICK_ACTIONS.map((action) => (

            <button
              key={action}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 hover:border-amber-500/30 hover:bg-amber-500/10 hover:text-white"
            >

              {action}

            </button>

          ))}

        </div>

      </div>

      <div className="grid grid-cols-2 gap-6">

        {SECTIONS.map((section) => {

          const Icon = section.icon;

          return (

            <div
              key={section.title}
              className="rounded-[36px] border border-white/10 bg-white/[0.03] p-8"
            >

              <div className="mb-8 flex items-start justify-between gap-6">

                <div className="flex gap-5">

                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-500/10">

                    <Icon className="h-8 w-8 text-amber-400" />

                  </div>

                  <div>

                    <div className="mb-2 text-3xl font-light">

                      {section.title}

                    </div>

                    <div className="max-w-xl text-white/45">

                      {section.description}

                    </div>

                  </div>

                </div>

                <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/40">

                  Runtime

                </div>

              </div>

              <div className="grid grid-cols-2 gap-3">

                {section.items.map((item) => (

                  <Link
                    key={item.route}
                    href={item.route}
                    className="group rounded-2xl border border-white/10 bg-black/30 p-4 hover:border-amber-500/40 hover:bg-amber-500/5"
                  >

                    <div className="flex items-center justify-between gap-3">

                      <div className="text-white/70">

                        {item.name}

                      </div>

                      <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-amber-400" />

                    </div>

                  </Link>

                ))}

              </div>

            </div>

          );

        })}

      </div>

    </main>

  );

}
