"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Brain,
  Building2,
  CheckCircle2,
  Cpu,
  FileCheck2,
  Gavel,
  LayoutDashboard,
  Lock,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

const SECTIONS = [

  {
    title: "Control Overview",
    description:
      "Enterprise authority runtime and governance execution command center.",
    icon: LayoutDashboard,
    items: [
      { name: "Overview", route: "/control/overview" },
      { name: "Live Runtime", route: "/control/live" },
      { name: "Governance Dashboard", route: "/control/dashboard" },
      { name: "Authority Health", route: "/control/health" },
    ],
  },

  {
    title: "Governance Runtime",
    description:
      "Enterprise governance orchestration, policy runtime and authority management.",
    icon: Gavel,
    items: [
      { name: "Governance Runtime", route: "/control/governance" },
      { name: "Policy Runtime", route: "/control/policies" },
      { name: "Authority Mapping", route: "/control/authority" },
      { name: "Governance Rules", route: "/control/rules" },
      { name: "Enterprise Controls", route: "/control/enterprise" },
    ],
  },

  {
    title: "Approval Authority",
    description:
      "Approvals, escalation routing and enterprise execution authorization.",
    icon: CheckCircle2,
    items: [
      { name: "Approval Runtime", route: "/control/approvals" },
      { name: "Escalation Runtime", route: "/control/escalations" },
      { name: "Execution Authority", route: "/control/execution" },
      { name: "Decision Runtime", route: "/control/decisions" },
      { name: "Approval Intelligence", route: "/control/intelligence" },
    ],
  },

  {
    title: "Financial Controls",
    description:
      "Financial governance, spending controls and enterprise financial authority.",
    icon: FileCheck2,
    items: [
      { name: "Financial Controls", route: "/control/finance" },
      { name: "Budget Runtime", route: "/control/budgets" },
      { name: "Payment Controls", route: "/control/payments" },
      { name: "Procurement Governance", route: "/control/procurement" },
      { name: "Payroll Controls", route: "/control/payroll" },
    ],
  },

  {
    title: "AI Governance",
    description:
      "AI permissions, AI execution controls and enterprise AI governance.",
    icon: Brain,
    items: [
      { name: "AI Governance", route: "/control/ai" },
      { name: "AI Permissions", route: "/control/ai-permissions" },
      { name: "AI Runtime Controls", route: "/control/ai-runtime" },
      { name: "AI Decision Locks", route: "/control/ai-decisions" },
      { name: "AI Safety Runtime", route: "/control/ai-safety" },
    ],
  },

  {
    title: "Operational Controls",
    description:
      "Operational authority, workflow controls and runtime enforcement.",
    icon: Workflow,
    items: [
      { name: "Workflow Authority", route: "/control/workflows" },
      { name: "Operational Controls", route: "/control/operations" },
      { name: "Department Controls", route: "/control/departments" },
      { name: "Realtime Enforcement", route: "/control/enforcement" },
      { name: "Runtime Locks", route: "/control/locks" },
    ],
  },

  {
    title: "Risk & Compliance",
    description:
      "Compliance runtime, risk governance and operational protection.",
    icon: ShieldAlert,
    items: [
      { name: "Compliance Runtime", route: "/control/compliance" },
      { name: "Risk Controls", route: "/control/risk" },
      { name: "Audit Enforcement", route: "/control/audit" },
      { name: "Incident Governance", route: "/control/incidents" },
      { name: "Violation Runtime", route: "/control/violations" },
    ],
  },

  {
    title: "Cross-System Authority",
    description:
      "Cross-platform governance, orchestration authority and enterprise runtime control.",
    icon: Zap,
    items: [
      { name: "Cross-System Controls", route: "/control/cross-system" },
      { name: "Realtime Authority", route: "/control/realtime" },
      { name: "Runtime Orchestration", route: "/control/orchestration" },
      { name: "Signal Governance", route: "/control/signals" },
      { name: "Enterprise Runtime", route: "/control/runtime" },
    ],
  },

];

const STATUS = [

  {
    label: "Governance Runtime",
    value: "ACTIVE",
  },

  {
    label: "Execution Authority",
    value: "ONLINE",
  },

  {
    label: "AI Governance",
    value: "RUNNING",
  },

  {
    label: "Realtime Controls",
    value: "ARMED",
  },

];

export default function ControlPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10">

            <ShieldCheck className="h-5 w-5 text-amber-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-amber-400">

            Churchill Platform

          </div>

        </div>

        <h1 className="mb-4 text-7xl font-light">

          Control

        </h1>

        <p className="max-w-5xl text-lg leading-relaxed text-white/50">

          Enterprise governance runtime for approvals, authority,
          execution control and cross-system operational governance.

        </p>

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

      <div className="grid grid-cols-2 gap-6">

        {SECTIONS.map((section) => {

          const Icon = section.icon;

          return (

            <div
              key={section.title}
              className="rounded-[36px] border border-white/10 bg-white/[0.03] p-8"
            >

              <div className="mb-8 flex gap-5">

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

              <div className="grid grid-cols-2 gap-3">

                {section.items.map((item) => (

                  <Link
                    key={item.route}
                    href={item.route}
                    className="group rounded-2xl border border-white/10 bg-black/30 p-4 hover:border-amber-500/40 hover:bg-amber-500/5"
                  >

                    <div className="flex items-center justify-between">

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
