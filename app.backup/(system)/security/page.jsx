"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Brain,
  Building2,
  Eye,
  Fingerprint,
  KeyRound,
  LayoutDashboard,
  Lock,
  Monitor,
  Network,
  ScanSearch,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";

const SECTIONS = [

  {
    title: "Security Overview",
    description:
      "Main enterprise security command center and governance visibility.",
    icon: LayoutDashboard,
    items: [
      { name: "Overview", route: "/security/overview" },
      { name: "Live Runtime", route: "/security/live" },
      { name: "Security Dashboard", route: "/security/dashboard" },
      { name: "Threat Overview", route: "/security/threats" },
    ],
  },

  {
    title: "Identity & Access",
    description:
      "Authentication, identity management and enterprise access control.",
    icon: Fingerprint,
    items: [
      { name: "Identity Runtime", route: "/security/identity" },
      { name: "Access Control", route: "/security/access" },
      { name: "Role Permissions", route: "/security/roles" },
      { name: "Session Runtime", route: "/security/sessions" },
      { name: "User Access Logs", route: "/security/access-logs" },
    ],
  },

  {
    title: "Tenant Security",
    description:
      "Tenant isolation, multi-tenant governance and organization security.",
    icon: Building2,
    items: [
      { name: "Tenant Security", route: "/security/tenant" },
      { name: "Tenant Isolation", route: "/security/isolation" },
      { name: "Organization Policies", route: "/security/policies" },
      { name: "Permission Runtime", route: "/security/permissions" },
      { name: "Tenant Monitoring", route: "/security/tenant-monitoring" },
    ],
  },

  {
    title: "Threat Monitoring",
    description:
      "Threat detection, incident visibility and enterprise monitoring.",
    icon: ShieldAlert,
    items: [
      { name: "Threat Monitoring", route: "/security/monitoring" },
      { name: "Security Alerts", route: "/security/alerts" },
      { name: "Incident Response", route: "/security/incidents" },
      { name: "Threat Detection", route: "/security/detection" },
      { name: "Risk Runtime", route: "/security/risk" },
    ],
  },

  {
    title: "API & Integration Security",
    description:
      "API governance, OAuth security and integration protection.",
    icon: Network,
    items: [
      { name: "API Security", route: "/security/api" },
      { name: "OAuth Security", route: "/security/oauth" },
      { name: "Webhook Security", route: "/security/webhooks" },
      { name: "Integration Protection", route: "/security/integrations" },
      { name: "Token Runtime", route: "/security/tokens" },
    ],
  },

  {
    title: "Infrastructure Security",
    description:
      "Infrastructure protection, device monitoring and system security.",
    icon: Server,
    items: [
      { name: "Infrastructure Runtime", route: "/security/infrastructure" },
      { name: "Device Security", route: "/security/devices" },
      { name: "Server Monitoring", route: "/security/servers" },
      { name: "Network Runtime", route: "/security/network" },
      { name: "Connection Security", route: "/security/connections" },
    ],
  },

  {
    title: "Compliance & Audit",
    description:
      "Audit runtime, compliance visibility and enterprise governance.",
    icon: ShieldCheck,
    items: [
      { name: "Compliance Runtime", route: "/security/compliance" },
      { name: "Audit Logs", route: "/security/audit" },
      { name: "Security Reports", route: "/security/reports" },
      { name: "Governance Runtime", route: "/security/governance" },
      { name: "Control Policies", route: "/security/controls" },
    ],
  },

  {
    title: "Data Protection",
    description:
      "Encryption, data governance and enterprise protection runtime.",
    icon: Lock,
    items: [
      { name: "Encryption Runtime", route: "/security/encryption" },
      { name: "Data Protection", route: "/security/data" },
      { name: "Backup Security", route: "/security/backups" },
      { name: "Data Governance", route: "/security/governance-data" },
      { name: "Privacy Runtime", route: "/security/privacy" },
    ],
  },

  {
    title: "AI Security",
    description:
      "AI governance, AI runtime protection and automation safeguards.",
    icon: Brain,
    items: [
      { name: "AI Security", route: "/security/ai" },
      { name: "AI Governance", route: "/security/ai-governance" },
      { name: "Automation Security", route: "/security/automation" },
      { name: "AI Runtime Monitoring", route: "/security/ai-monitoring" },
      { name: "Decision Protection", route: "/security/decisions" },
    ],
  },

  {
    title: "Security Operations",
    description:
      "Security observability, runtime logs and operational protection.",
    icon: Eye,
    items: [
      { name: "Security Logs", route: "/security/logs" },
      { name: "Realtime Monitoring", route: "/security/realtime" },
      { name: "Failure Tracking", route: "/security/failures" },
      { name: "Security Analytics", route: "/security/analytics" },
      { name: "Security Runtime", route: "/security/runtime" },
    ],
  },

];

const STATUS = [

  {
    label: "Security Runtime",
    value: "ACTIVE",
  },

  {
    label: "Threat Monitoring",
    value: "ONLINE",
  },

  {
    label: "Tenant Protection",
    value: "RUNNING",
  },

  {
    label: "AI Governance",
    value: "ARMED",
  },

];

const QUICK_ACTIONS = [

  "Review security alerts",
  "Analyze access logs",
  "Check tenant isolation",
  "Review API security",
  "Analyze audit logs",
  "Monitor AI runtime",

];

export default function SecurityPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500/10">

            <Shield className="h-5 w-5 text-red-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-red-400">

            Churchill Platform

          </div>

        </div>

        <div className="flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Security

            </h1>

            <p className="max-w-5xl text-lg leading-relaxed text-white/50">

              Enterprise security runtime for governance, identity protection,
              threat monitoring, compliance and operational security.

            </p>

          </div>

          <Link
            href="/security/live"
            className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm font-medium text-red-300 hover:bg-red-500/20"
          >

            Open Security Runtime

          </Link>

        </div>

      </div>

      <div className="mb-10 grid grid-cols-4 gap-6">

        {STATUS.map((item) => (

          <div
            key={item.label}
            className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6"
          >

            <div className="mb-5 h-8 w-8 rounded-2xl bg-red-500/10" />

            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

              {item.label}

            </div>

            <div className="text-3xl font-light">

              {item.value}

            </div>

          </div>

        ))}

      </div>

      <div className="mb-10 rounded-[40px] border border-red-500/20 bg-red-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-red-500/10">

              <Sparkles className="h-8 w-8 text-red-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Security AI Command

              </div>

              <div className="text-white/40">

                Monitor threats, tenant security, API protection and enterprise governance.

              </div>

            </div>

          </div>

          <Link
            href="/security/ai"
            className="rounded-2xl border border-red-500/20 bg-black/30 px-5 py-3 text-sm text-red-300"
          >

            Open Security Intelligence

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-red-400" />

          <input
            placeholder="Ask security AI to analyze threats, permissions, APIs or tenant protection..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-red-500 px-6 py-3 font-medium text-white">

            Run

          </button>

        </div>

        <div className="flex flex-wrap gap-3">

          {QUICK_ACTIONS.map((action) => (

            <button
              key={action}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 hover:border-red-500/30 hover:bg-red-500/10 hover:text-white"
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

                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-red-500/10">

                    <Icon className="h-8 w-8 text-red-400" />

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
                    className="group rounded-2xl border border-white/10 bg-black/30 p-4 hover:border-red-500/40 hover:bg-red-500/5"
                  >

                    <div className="flex items-center justify-between gap-3">

                      <div className="text-white/70">

                        {item.name}

                      </div>

                      <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-red-400" />

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
