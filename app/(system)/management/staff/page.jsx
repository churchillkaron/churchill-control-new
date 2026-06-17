"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Award,
  BadgeAlert,
  BarChart3,
  Bot,
  Briefcase,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  DollarSign,
  GraduationCap,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Workflow,
} from "lucide-react";

const STAFF_SECTIONS = [

  {
    title: "Workforce Overview",
    description:
      "Enterprise workforce overview, staff runtime and human operational health.",
    icon: Users,
    items: [
      {
        name: "Staff Overview",
        route: "/staff/overview",
      },
      {
        name: "Live Workforce",
        route: "/staff/live",
      },
      {
        name: "Department Overview",
        route: "/staff/departments",
      },
      {
        name: "Workforce Analytics",
        route: "/staff/analytics",
      },
    ],
  },

  {
    title: "Attendance & Shifts",
    description:
      "Attendance runtime, lateness tracking, scheduling and workforce shift control.",
    icon: Clock3,
    items: [
      {
        name: "Attendance",
        route: "/attendance",
      },
      {
        name: "Shift Runtime",
        route: "/staff/shifts",
      },
      {
        name: "Scheduling",
        route: "/staff/scheduling",
      },
      {
        name: "Late Tracking",
        route: "/staff/lateness",
      },
      {
        name: "Absence Runtime",
        route: "/staff/absence",
      },
    ],
  },

  {
    title: "Performance & Accountability",
    description:
      "Performance scoring, accountability, penalties and operational evaluation.",
    icon: Target,
    items: [
      {
        name: "Performance",
        route: "/staff/performance",
      },
      {
        name: "Department Performance",
        route: "/performance/departments",
      },
      {
        name: "KPI Runtime",
        route: "/staff/kpis",
      },
      {
        name: "Warnings",
        route: "/staff/warnings",
      },
      {
        name: "Violations",
        route: "/staff/violations",
      },
      {
        name: "Penalty Engine",
        route: "/staff/penalties",
      },
    ],
  },

  {
    title: "Payroll & Compensation",
    description:
      "Salary runtime, payroll connection, service charge and payout governance.",
    icon: DollarSign,
    items: [
      {
        name: "Payroll",
        route: "/finance/payroll",
      },
      {
        name: "Service Charge",
        route: "/servicecharge/live",
      },
      {
        name: "Payout Runtime",
        route: "/payout",
      },
      {
        name: "Salary Review",
        route: "/staff/salary-review",
      },
      {
        name: "Labor Cost",
        route: "/staff/labor-cost",
      },
    ],
  },

  {
    title: "Tasks & Execution",
    description:
      "Task management, execution tracking and operational workforce coordination.",
    icon: ClipboardCheck,
    items: [
      {
        name: "Tasks",
        route: "/staff/tasks",
      },
      {
        name: "Execution Runtime",
        route: "/staff/execution",
      },
      {
        name: "Operational Tasks",
        route: "/staff/operations",
      },
      {
        name: "Assignments",
        route: "/staff/assignments",
      },
    ],
  },

  {
    title: "Training & Development",
    description:
      "Training runtime, certifications, onboarding and staff development.",
    icon: GraduationCap,
    items: [
      {
        name: "Training",
        route: "/staff/training",
      },
      {
        name: "Certifications",
        route: "/staff/certifications",
      },
      {
        name: "Onboarding",
        route: "/staff/onboarding",
      },
      {
        name: "Career Path",
        route: "/staff/career",
      },
    ],
  },

  {
    title: "Recruitment & Workforce Planning",
    description:
      "Recruitment pipeline, workforce planning and staffing optimization.",
    icon: Briefcase,
    items: [
      {
        name: "Recruitment",
        route: "/staff/recruitment",
      },
      {
        name: "Candidates",
        route: "/staff/candidates",
      },
      {
        name: "Workforce Planning",
        route: "/staff/planning",
      },
      {
        name: "Hiring Pipeline",
        route: "/staff/hiring",
      },
    ],
  },

  {
    title: "Human Governance",
    description:
      "Human governance, HR compliance, disputes and employee relations.",
    icon: ShieldCheck,
    items: [
      {
        name: "HR Governance",
        route: "/staff/governance",
      },
      {
        name: "Disputes",
        route: "/staff/disputes",
      },
      {
        name: "Compliance",
        route: "/staff/compliance",
      },
      {
        name: "Employee Relations",
        route: "/staff/relations",
      },
    ],
  },

  {
    title: "AI Workforce Intelligence",
    description:
      "AI staffing intelligence, workforce forecasting and human optimization.",
    icon: Bot,
    items: [
      {
        name: "Staff AI",
        route: "/staff/ai",
      },
      {
        name: "Staff Forecasting",
        route: "/staff/forecasting",
      },
      {
        name: "Retention Analysis",
        route: "/staff/retention",
      },
      {
        name: "Burnout Detection",
        route: "/staff/burnout",
      },
      {
        name: "AI Recommendations",
        route: "/staff/recommendations",
      },
    ],
  },

];

const RUNTIME_STATUS = [

  {
    label: "Workforce",
    value: "ACTIVE",
    icon: Users,
  },

  {
    label: "Attendance",
    value: "ONLINE",
    icon: Clock3,
  },

  {
    label: "Payroll",
    value: "CONNECTED",
    icon: DollarSign,
  },

  {
    label: "AI Workforce",
    value: "ARMED",
    icon: Bot,
  },

];

const AI_ACTIONS = [

  "Analyze workforce performance",
  "Forecast staffing shortages",
  "Review attendance risks",
  "Optimize scheduling",
  "Analyze labor cost",
  "Detect burnout indicators",

];

export default function StaffPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      {/* HERO */}

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-pink-500/10">

            <Users className="h-5 w-5 text-pink-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-pink-400">

            Churchill Workforce Runtime

          </div>

        </div>

        <div className="mb-5 flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Staff

            </h1>

            <p className="max-w-4xl text-lg leading-relaxed text-white/50">

              Enterprise workforce runtime for attendance, payroll,
              accountability, scheduling, performance and human governance.

            </p>

          </div>

          <Link
            href="/staff/live"
            className="rounded-2xl border border-pink-500/20 bg-pink-500/10 px-5 py-4 text-sm font-medium text-pink-300 transition-all hover:bg-pink-500/20"
          >

            Open Workforce Runtime

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

                <Icon className="mb-5 h-8 w-8 text-pink-400" />

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

      {/* AI COMMAND */}

      <div className="mb-10 rounded-[40px] border border-pink-500/20 bg-pink-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-pink-500/10">

              <Sparkles className="h-8 w-8 text-pink-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Workforce AI Command

              </div>

              <div className="text-white/40">

                Ask Churchill AI to analyze workforce health, scheduling or staffing risk.

              </div>

            </div>

          </div>

          <Link
            href="/staff/ai"
            className="rounded-2xl border border-pink-500/20 bg-black/30 px-5 py-3 text-sm text-pink-300 hover:bg-pink-500/10"
          >

            Open Workforce AI

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-pink-400" />

          <input
            placeholder="Ask AI to analyze staffing, attendance, performance or labor cost..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-pink-500 px-6 py-3 font-medium text-white transition-all hover:bg-pink-400">

            Execute

          </button>

        </div>

        <div className="flex flex-wrap gap-3">

          {AI_ACTIONS.map(
            action => (

              <button
                key={action}
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 transition-all hover:border-pink-500/30 hover:bg-pink-500/10 hover:text-white"
              >

                {action}

              </button>

            )
          )}

        </div>

      </div>

      {/* STAFF SECTIONS */}

      <div className="grid grid-cols-2 gap-6">

        {STAFF_SECTIONS.map(
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

                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-pink-500/10">

                      <Icon className="h-8 w-8 text-pink-400" />

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

                    Workforce

                  </div>

                </div>

                <div className="grid grid-cols-2 gap-3">

                  {section.items.map(
                    item => (

                      <Link
                        key={item.route}
                        href={item.route || "#"}
                        className="group rounded-2xl border border-white/10 bg-black/30 p-4 transition-all hover:border-pink-500/40 hover:bg-pink-500/5"
                      >

                        <div className="flex items-center justify-between gap-3">

                          <div className="text-white/70">

                            {item.name}

                          </div>

                          <ArrowRight className="h-4 w-4 text-white/20 transition-all group-hover:translate-x-1 group-hover:text-pink-400" />

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
          href="/attendance"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-pink-500/40 hover:bg-pink-500/5"
        >

          <Calendar className="mb-5 h-8 w-8 text-pink-400" />

          <div className="mb-2 text-2xl font-light">

            Attendance

          </div>

          <div className="text-sm text-white/40">

            Workforce attendance and lateness runtime.

          </div>

        </Link>

        <Link
          href="/staff/performance"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/5"
        >

          <Award className="mb-5 h-8 w-8 text-cyan-400" />

          <div className="mb-2 text-2xl font-light">

            Performance

          </div>

          <div className="text-sm text-white/40">

            Staff performance and KPI governance.

          </div>

        </Link>

        <Link
          href="/finance/payroll"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5"
        >

          <HeartHandshake className="mb-5 h-8 w-8 text-emerald-400" />

          <div className="mb-2 text-2xl font-light">

            Payroll

          </div>

          <div className="text-sm text-white/40">

            Payroll, service charge and compensation runtime.

          </div>

        </Link>

        <Link
          href="/staff/violations"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-red-500/40 hover:bg-red-500/5"
        >

          <BadgeAlert className="mb-5 h-8 w-8 text-red-400" />

          <div className="mb-2 text-2xl font-light">

            Violations

          </div>

          <div className="text-sm text-white/40">

            Violations, warnings and enforcement tracking.

          </div>

        </Link>

      </div>

    </main>

  );

}
