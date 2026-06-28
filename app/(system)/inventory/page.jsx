"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  Boxes,
  ClipboardList,
  DollarSign,
  Factory,
  FileBarChart,
  LayoutDashboard,
  Package,
  PackageCheck,
  PackageMinus,
  PackageOpen,
  PackagePlus,
  ShieldAlert,
  Sparkles,
  Store,
  Truck,
  Warehouse,
} from "lucide-react";

const SECTIONS = [

  {
    title: "Inventory Overview",
    description:
      "Main inventory command center, warehouse visibility and stock runtime.",
    icon: LayoutDashboard,
    items: [
      { name: "Overview", route: "/inventory/overview" },
      { name: "Live Runtime", route: "/inventory/live" },
      { name: "Inventory Dashboard", route: "/inventory/dashboard" },
      { name: "Stock Health", route: "/inventory/health" },
    ],
  },

  {
    title: "Stock Management",
    description:
      "Core stock operations, item management and inventory tracking.",
    icon: Package,
    items: [
      { name: "Stock Runtime", route: "/inventory/stock" },
      { name: "Inventory Items", route: "/inventory/items" },
      { name: "Stock Counts", route: "/inventory/counts" },
      { name: "Inventory Adjustments", route: "/inventory/adjustments" },
      { name: "Low Stock Alerts", route: "/inventory/low-stock" },
    ],
  },

  {
    title: "Warehouse Operations",
    description:
      "Warehouse control, internal transfers and storage coordination.",
    icon: Warehouse,
    items: [
      { name: "Warehouse Runtime", route: "/inventory/warehouse" },
      { name: "Stock Transfers", route: "/inventory/transfers" },
      { name: "Storage Locations", route: "/inventory/locations" },
      { name: "Receiving Runtime", route: "/inventory/receiving" },
      { name: "Dispatch Runtime", route: "/inventory/dispatch" },
    ],
  },

  {
    title: "Movement & Tracking",
    description:
      "Inventory movement logs, stock history and realtime tracking.",
    icon: Boxes,
    items: [
      { name: "Movement Logs", route: "/inventory/movements" },
      { name: "Batch Tracking", route: "/inventory/batches" },
      { name: "Usage Tracking", route: "/inventory/usage" },
      { name: "Consumption Logs", route: "/inventory/consumption" },
      { name: "Audit Trail", route: "/inventory/audit" },
    ],
  },

  {
    title: "Production Coordination",
    description:
      "Production usage, kitchen inventory and recipe stock coordination.",
    icon: Factory,
    items: [
      { name: "Production Runtime", route: "/operations/production" },
      { name: "Kitchen Inventory", route: "/inventory/kitchen" },
      { name: "Recipe Usage", route: "/inventory/recipes" },
      { name: "Prep Consumption", route: "/inventory/prep" },
      { name: "Ingredient Runtime", route: "/inventory/ingredients" },
    ],
  },

  {
    title: "Procurement Coordination",
    description:
      "Inventory replenishment, supplier coordination and receiving flow.",
    icon: Truck,
    items: [
      { name: "Replenishment", route: "/inventory/replenishment" },
      { name: "Procurement Runtime", route: "/procurement" },
      { name: "Supplier Deliveries", route: "/inventory/deliveries" },
      { name: "Receiving Queue", route: "/inventory/receiving-queue" },
      { name: "Restock Planning", route: "/inventory/restock" },
    ],
  },

  {
    title: "Costing & Valuation",
    description:
      "Inventory costing, stock valuation and financial inventory analytics.",
    icon: DollarSign,
    items: [
      { name: "Inventory Valuation", route: "/inventory/valuation" },
      { name: "Stock Costs", route: "/inventory/costs" },
      { name: "Cost Analytics", route: "/inventory/cost-analytics" },
      { name: "Variance Tracking", route: "/inventory/variance" },
      { name: "Waste Costing", route: "/inventory/waste-costs" },
    ],
  },

  {
    title: "Waste & Variance",
    description:
      "Waste monitoring, shrinkage tracking and inventory variance analysis.",
    icon: AlertTriangle,
    items: [
      { name: "Waste Runtime", route: "/inventory/waste" },
      { name: "Variance Analysis", route: "/inventory/variances" },
      { name: "Spoilage Tracking", route: "/inventory/spoilage" },
      { name: "Loss Prevention", route: "/inventory/loss" },
      { name: "Shrinkage Reports", route: "/inventory/shrinkage" },
    ],
  },

  {
    title: "Inventory Analytics",
    description:
      "Inventory intelligence, forecasting and stock performance analytics.",
    icon: BarChart3,
    items: [
      { name: "Inventory Analytics", route: "/inventory/analytics" },
      { name: "Stock Forecasting", route: "/inventory/forecasting" },
      { name: "Demand Analytics", route: "/inventory/demand" },
      { name: "Usage Trends", route: "/inventory/trends" },
      { name: "Inventory Reports", route: "/inventory/reports" },
    ],
  },

  {
    title: "AI Inventory Intelligence",
    description:
      "AI inventory optimization, forecasting and operational recommendations.",
    icon: Brain,
    items: [
      { name: "Inventory AI", route: "/inventory/ai" },
      { name: "AI Recommendations", route: "/inventory/recommendations" },
      { name: "Optimization Runtime", route: "/inventory/optimization" },
      { name: "Demand Prediction", route: "/inventory/predictions" },
      { name: "Automation Runtime", route: "/inventory/automation" },
    ],
  },

];

const STATUS = [

  {
    label: "Inventory Runtime",
    value: "ACTIVE",
  },

  {
    label: "Warehouse",
    value: "ONLINE",
  },

  {
    label: "Stock Tracking",
    value: "RUNNING",
  },

  {
    label: "Inventory AI",
    value: "ARMED",
  },

];

const QUICK_ACTIONS = [

  "Review low stock items",
  "Analyze stock variance",
  "Check warehouse transfers",
  "Review waste analytics",
  "Forecast inventory demand",
  "Analyze inventory valuation",

];

export default function InventoryPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/10">

            <Package className="h-5 w-5 text-cyan-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-cyan-400">

            Churchill Platform

          </div>

        </div>

        <div className="flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Inventory

            </h1>

            <p className="max-w-5xl text-lg leading-relaxed text-white/50">

              Enterprise inventory runtime for stock control, warehouse operations,
              valuation, movement tracking and inventory intelligence.

            </p>

          </div>

          <Link
            href="/inventory/live"
            className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-5 py-4 text-sm font-medium text-cyan-300 hover:bg-cyan-500/20"
          >

            Open Inventory Runtime

          </Link>

        </div>

      </div>

      <div className="mb-10 grid grid-cols-4 gap-6">

        {STATUS.map((item) => (

          <div
            key={item.label}
            className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6"
          >

            <div className="mb-5 h-8 w-8 rounded-2xl bg-cyan-500/10" />

            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

              {item.label}

            </div>

            <div className="text-3xl font-light">

              {item.value}

            </div>

          </div>

        ))}

      </div>

      <div className="mb-10 rounded-[40px] border border-cyan-500/20 bg-cyan-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-500/10">

              <Sparkles className="h-8 w-8 text-cyan-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Inventory AI Command

              </div>

              <div className="text-white/40">

                Analyze stock movement, warehouse operations and inventory demand.

              </div>

            </div>

          </div>

          <Link
            href="/inventory/ai"
            className="rounded-2xl border border-cyan-500/20 bg-black/30 px-5 py-3 text-sm text-cyan-300"
          >

            Open Inventory Intelligence

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-cyan-400" />

          <input
            placeholder="Ask inventory AI to analyze stock levels, warehouse activity or inventory risks..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-cyan-500 px-6 py-3 font-medium text-white">

            Run

          </button>

        </div>

        <div className="flex flex-wrap gap-3">

          {QUICK_ACTIONS.map((action) => (

            <button
              key={action}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-white"
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

                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-500/10">

                    <Icon className="h-8 w-8 text-cyan-400" />

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
                    href={item.route || "#"}
                    className="group rounded-2xl border border-white/10 bg-black/30 p-4 hover:border-cyan-500/40 hover:bg-cyan-500/5"
                  >

                    <div className="flex items-center justify-between gap-3">

                      <div className="text-white/70">

                        {item.name}

                      </div>

                      <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-cyan-400" />

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
