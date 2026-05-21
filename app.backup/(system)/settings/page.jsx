"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  ArrowRight,
  BellRing,
  Bot,
 Brain,
  Building2,
  Calculator,
  ChefHat,
  CreditCard,
  Globe,
  LayoutDashboard,
  MonitorSmartphone,
  Palette,
  Printer,
  Receipt,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Wrench,
} from "lucide-react";

const SECTIONS = [

  {
    title: "Settings Overview",
    description:
      "Main operational configuration command center and business settings runtime.",
    icon: LayoutDashboard,
    items: [
      { name: "Overview", route: "/settings/overview" },
      { name: "Live Runtime", route: "/settings/live" },
      { name: "Settings Dashboard", route: "/settings/dashboard" },
      { name: "Configuration Health", route: "/settings/health" },
    ],
  },

  {
    title: "Business Configuration",
    description:
      "Business identity, operational preferences and organization settings.",
    icon: Building2,
    items: [
      { name: "Business Settings", route: "/settings/business" },
      { name: "Organization Runtime", route: "/settings/organization" },
      { name: "Branch Settings", route: "/settings/branches" },
      { name: "Operational Rules", route: "/settings/rules" },
      { name: "Business Preferences", route: "/settings/preferences" },
    ],
  },

  {
    title: "POS & Kitchen",
    description:
      "POS configuration, kitchen runtime and operational device settings.",
    icon: MonitorSmartphone,
    items: [
      { name: "POS Configuration", route: "/settings/pos" },
      { name: "Kitchen Configuration", route: "/settings/kitchen" },
      { name: "Printer Settings", route: "/settings/printers" },
      { name: "Table Configuration", route: "/settings/tables" },
      { name: "Order Runtime", route: "/settings/orders" },
    ],
  },

  {
    title: "Finance & Payroll",
    description:
      "Tax rules, payroll runtime and financial operational settings.",
    icon: Calculator,
    items: [
      { name: "Tax Configuration", route: "/settings/tax" },
      { name: "Service Charge Rules", route: "/settings/service-charge" },
      { name: "Payroll Rules", route: "/settings/payroll" },
      { name: "Payout Runtime", route: "/settings/payouts" },
      { name: "Financial Preferences", route: "/settings/finance" },
    ],
  },

  {
    title: "Staff & Scheduling",
    description:
      "Shift runtime, attendance configuration and staff operational settings.",
    icon: Users,
    items: [
      { name: "Shift Settings", route: "/settings/shifts" },
      { name: "Attendance Rules", route: "/settings/attendance" },
      { name: "Department Configuration", route: "/settings/departments" },
      { name: "Role Preferences", route: "/settings/roles" },
      { name: "Staff Runtime", route: "/settings/staff" },
    ],
  },

  {
    title: "Communication Runtime",
    description:
      "Messaging, notifications and operational communication settings.",
    icon: BellRing,
    items: [
      { name: "Notification Settings", route: "/settings/notifications" },
      { name: "Communication Runtime", route: "/settings/communications" },
      { name: "WhatsApp Settings", route: "/settings/whatsapp" },
      { name: "LINE Settings", route: "/settings/line" },
      { name: "Email Preferences", route: "/settings/email" },
    ],
  },

  {
    title: "Automation & Workflows",
    description:
      "Workflow preferences, automation rules and operational orchestration settings.",
    icon: Workflow,
    items: [
      { name: "Automation Preferences", route: "/settings/automation" },
      { name: "Workflow Settings", route: "/settings/workflows" },
      { name: "Approval Runtime", route: "/settings/approvals" },
      { name: "Trigger Configuration", route: "/settings/triggers" },
      { name: "Execution Rules", route: "/settings/execution" },
    ],
  },

  {
    title: "Branding & Templates",
    description:
      "Branding runtime, receipt templates and customer-facing configuration.",
    icon: Palette,
    items: [
      { name: "Branding Runtime", route: "/settings/branding" },
      { name: "Receipt Templates", route: "/settings/receipts" },
      { name: "Invoice Templates", route: "/settings/invoices" },
      { name: "Theme Preferences", route: "/settings/themes" },
      { name: "Document Templates", route: "/settings/templates" },
    ],
  },

  {
    title: "AI & Integrations",
    description:
      "AI preferences, integrations and enterprise connectivity settings.",
    icon: Brain,
    items: [
      { name: "AI Preferences", route: "/settings/ai" },
      { name: "Integration Preferences", route: "/settings/integrations" },
      { name: "API Preferences", route: "/settings/api" },
      { name: "OAuth Runtime", route: "/settings/oauth" },
      { name: "AI Runtime", route: "/settings/ai-runtime" },
    ],
  },

  {
    title: "Localization & Environment",
    description:
      "Localization runtime, language settings and environment configuration.",
    icon: Globe,
    items: [
      { name: "Localization", route: "/settings/localization" },
      { name: "Language Runtime", route: "/settings/language" },
      { name: "Timezone Settings", route: "/settings/timezone" },
      { name: "Environment Preferences", route: "/settings/environment" },
      { name: "Regional Runtime", route: "/settings/region" },
    ],
  },

];

const STATUS = [

  {
    label: "Settings Runtime",
    value: "ACTIVE",
  },

  {
    label: "Operational Config",
    value: "ONLINE",
  },

  {
    label: "Automation Rules",
    value: "RUNNING",
  },

  {
    label: "AI Preferences",
    value: "ARMED",
  },

];

const QUICK_ACTIONS = [

  "Review POS settings",
  "Analyze payroll rules",
  "Configure workflows",
  "Review AI preferences",
  "Update communication settings",
  "Check operational runtime",

];

export default function SettingsPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-500/10">

            <Settings2 className="h-5 w-5 text-zinc-300" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-zinc-300">

            Churchill Platform

          </div>

        </div>

        <div className="flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Settings

            </h1>

            <p className="max-w-5xl text-lg leading-relaxed text-white/50">

              Enterprise settings runtime for operational configuration,
              workflows, business preferences and tenant runtime management.

            </p>

          </div>

          <Link
            href="/settings/live"
            className="rounded-2xl border border-zinc-500/20 bg-zinc-500/10 px-5 py-4 text-sm font-medium text-zinc-200 hover:bg-zinc-500/20"
          >

            Open Settings Runtime

          </Link>

        </div>

      </div>

      <div className="mb-10 grid grid-cols-4 gap-6">

        {STATUS.map((item) => (

          <div
            key={item.label}
            className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6"
          >

            <div className="mb-5 h-8 w-8 rounded-2xl bg-zinc-500/10" />

            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

              {item.label}

            </div>

            <div className="text-3xl font-light">

              {item.value}

            </div>

          </div>

        ))}

      </div>

      <div className="mb-10 rounded-[40px] border border-zinc-500/20 bg-zinc-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-zinc-500/10">

              <Sparkles className="h-8 w-8 text-zinc-300" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Settings AI Command

              </div>

              <div className="text-white/40">

                Configure operational runtime, workflows and enterprise preferences.

              </div>

            </div>

          </div>

          <Link
            href="/settings/ai"
            className="rounded-2xl border border-zinc-500/20 bg-black/30 px-5 py-3 text-sm text-zinc-200"
          >

            Open Settings Intelligence

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-zinc-300" />

          <input
            placeholder="Ask settings AI to configure workflows, payroll, AI behavior or operational preferences..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-zinc-600 px-6 py-3 font-medium text-white">

            Run

          </button>

        </div>

        <div className="flex flex-wrap gap-3">

          {QUICK_ACTIONS.map((action) => (

            <button
              key={action}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 hover:border-zinc-400/30 hover:bg-zinc-500/10 hover:text-white"
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

                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-zinc-500/10">

                    <Icon className="h-8 w-8 text-zinc-300" />

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
                    className="group rounded-2xl border border-white/10 bg-black/30 p-4 hover:border-zinc-400/40 hover:bg-zinc-500/5"
                  >

                    <div className="flex items-center justify-between gap-3">

                      <div className="text-white/70">

                        {item.name}

                      </div>

                      <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-zinc-200" />

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
