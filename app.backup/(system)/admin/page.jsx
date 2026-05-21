"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  ArrowRight,
  Bot,
  Brain,
  Building2,
  CheckCircle2,
  Cpu,
  Database,
  LayoutDashboard,
  Lock,
  Monitor,
  Network,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";

const SECTIONS = [

  {
    title: "Admin Overview",
    description:
      "Main enterprise administration command center and platform governance runtime.",
    icon: LayoutDashboard,
    items: [
      { name: "Overview", route: "/admin/overview" },
      { name: "Live Runtime", route: "/admin/live" },
      { name: "Admin Dashboard", route: "/admin/dashboard" },
      { name: "Platform Health", route: "/admin/health" },
    ],
  },

  {
    title: "Tenant & Organization",
    description:
      "Tenant management, organization governance and multi-tenant administration.",
    icon: Building2,
    items: [
      { name: "Tenant Runtime", route: "/admin/tenants" },
      { name: "Organizations", route: "/admin/organizations" },
      { name: "Tenant Configuration", route: "/admin/tenant-config" },
      { name: "Tenant Isolation", route: "/admin/isolation" },
      { name: "Organization Policies", route: "/admin/policies" },
    ],
  },

  {
    title: "Users & Roles",
    description:
      "User administration, permissions and enterprise role governance.",
    icon: Users,
    items: [
      { name: "User Administration", route: "/admin/users" },
      { name: "Role Management", route: "/admin/roles" },
      { name: "Department Runtime", route: "/admin/departments" },
      { name: "Permission Controls", route: "/admin/permissions" },
      { name: "Access Governance", route: "/admin/access" },
    ],
  },

  {
    title: "Platform Configuration",
    description:
      "Platform settings, environment controls and enterprise runtime configuration.",
    icon: Settings2,
    items: [
      { name: "Platform Settings", route: "/admin/settings" },
      { name: "Environment Controls", route: "/admin/environment" },
      { name: "Feature Flags", route: "/admin/features" },
      { name: "System Configuration", route: "/admin/configuration" },
      { name: "Runtime Controls", route: "/admin/runtime" },
    ],
  },

  {
    title: "Billing & Subscription",
    description:
      "Subscription governance, billing operations and platform licensing.",
    icon: Wallet,
    items: [
      { name: "Subscription Runtime", route: "/admin/subscriptions" },
      { name: "Billing Management", route: "/admin/billing" },
      { name: "License Runtime", route: "/admin/licenses" },
      { name: "Usage Tracking", route: "/admin/usage" },
      { name: "Plan Configuration", route: "/admin/plans" },
    ],
  },

  {
    title: "Infrastructure Runtime",
    description:
      "Infrastructure visibility, runtime monitoring and system operations.",
    icon: Server,
    items: [
      { name: "Infrastructure Runtime", route: "/admin/infrastructure" },
      { name: "System Monitoring", route: "/admin/monitoring" },
      { name: "Service Runtime", route: "/admin/services" },
      { name: "Server Health", route: "/admin/servers" },
      { name: "Runtime Metrics", route: "/admin/metrics" },
    ],
  },

  {
    title: "AI & Automation Controls",
    description:
      "AI governance, automation runtime and orchestration controls.",
    icon: Brain,
    items: [
      { name: "AI Configuration", route: "/admin/ai" },
      { name: "Automation Controls", route: "/admin/automation" },
      { name: "AI Runtime", route: "/admin/ai-runtime" },
      { name: "Decision Policies", route: "/admin/decisions" },
      { name: "AI Governance", route: "/admin/ai-governance" },
    ],
  },

  {
    title: "Integration Governance",
    description:
      "External integrations, APIs and connectivity administration.",
    icon: Network,
    items: [
      { name: "Integration Controls", route: "/admin/integrations" },
      { name: "API Runtime", route: "/admin/api" },
      { name: "OAuth Controls", route: "/admin/oauth" },
      { name: "Webhook Runtime", route: "/admin/webhooks" },
      { name: "Connection Governance", route: "/admin/connections" },
    ],
  },

  {
    title: "Data & Backup",
    description:
      "Database visibility, backup runtime and data governance.",
    icon: Database,
    items: [
      { name: "Database Runtime", route: "/admin/database" },
      { name: "Backup Runtime", route: "/admin/backups" },
      { name: "Data Governance", route: "/admin/data" },
      { name: "Storage Runtime", route: "/admin/storage" },
      { name: "Recovery Center", route: "/admin/recovery" },
    ],
  },

  {
    title: "Audit & Logs",
    description:
      "Platform observability, system logs and administrative governance.",
    icon: ShieldCheck,
    items: [
      { name: "System Logs", route: "/admin/logs" },
      { name: "Audit Runtime", route: "/admin/audit" },
      { name: "Activity Monitoring", route: "/admin/activity" },
      { name: "Operational Alerts", route: "/admin/alerts" },
      { name: "Governance Reports", route: "/admin/reports" },
    ],
  },

];

const STATUS = [

  {
    label: "Admin Runtime",
    value: "ACTIVE",
  },

  {
    label: "Tenant Governance",
    value: "ONLINE",
  },

  {
    label: "Platform Control",
    value: "RUNNING",
  },

  {
    label: "AI Governance",
    value: "ARMED",
  },

];

const QUICK_ACTIONS = [

  "Review tenant runtime",
  "Analyze system health",
  "Review platform logs",
  "Check AI governance",
  "Monitor infrastructure",
  "Review feature flags",

];

export default function AdminPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-500/10">

            <UserCog className="h-5 w-5 text-purple-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-purple-400">

            Churchill Platform

          </div>

        </div>

        <div className="flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Admin

            </h1>

            <p className="max-w-5xl text-lg leading-relaxed text-white/50">

              Enterprise administration runtime for tenant governance,
              platform operations, configuration and enterprise control.

            </p>

          </div>

          <Link
            href="/admin/live"
            className="rounded-2xl border border-purple-500/20 bg-purple-500/10 px-5 py-4 text-sm font-medium text-purple-300 hover:bg-purple-500/20"
          >

            Open Admin Runtime

          </Link>

        </div>

      </div>

      <div className="mb-10 grid grid-cols-4 gap-6">

        {STATUS.map((item) => (

          <div
            key={item.label}
            className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6"
          >

            <div className="mb-5 h-8 w-8 rounded-2xl bg-purple-500/10" />

            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

              {item.label}

            </div>

            <div className="text-3xl font-light">

              {item.value}

            </div>

          </div>

        ))}

      </div>

      <div className="mb-10 rounded-[40px] border border-purple-500/20 bg-purple-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-purple-500/10">

              <Sparkles className="h-8 w-8 text-purple-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Admin AI Command

              </div>

              <div className="text-white/40">

                Govern tenants, monitor platform runtime and orchestrate enterprise control.

              </div>

            </div>

          </div>

          <Link
            href="/admin/ai"
            className="rounded-2xl border border-purple-500/20 bg-black/30 px-5 py-3 text-sm text-purple-300"
          >

            Open Admin Intelligence

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-purple-400" />

          <input
            placeholder="Ask admin AI to monitor tenants, platform health or enterprise governance..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-purple-500 px-6 py-3 font-medium text-white">

            Run

          </button>

        </div>

        <div className="flex flex-wrap gap-3">

          {QUICK_ACTIONS.map((action) => (

            <button
              key={action}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 hover:border-purple-500/30 hover:bg-purple-500/10 hover:text-white"
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

                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-purple-500/10">

                    <Icon className="h-8 w-8 text-purple-400" />

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
                    className="group rounded-2xl border border-white/10 bg-black/30 p-4 hover:border-purple-500/40 hover:bg-purple-500/5"
                  >

                    <div className="flex items-center justify-between gap-3">

                      <div className="text-white/70">

                        {item.name}

                      </div>

                      <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-purple-400" />

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
