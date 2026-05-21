"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  Activity,
  ArrowRight,
  BarChart3,
  BellRing,
  Bot,
  Brain,
  CalendarDays,
  Crown,
  Eye,
  HeartHandshake,
  LayoutDashboard,
  LineChart,
  MessageCircle,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";

const SECTIONS = [

  {
    title: "Customer Overview",
    description:
      "Main customer command center, CRM visibility and guest relationship runtime.",
    icon: LayoutDashboard,
    items: [
      { name: "Overview", route: "/customer/overview" },
      { name: "Live Runtime", route: "/customer/live" },
      { name: "CRM Runtime", route: "/customer/crm" },
      { name: "Guest Dashboard", route: "/customer/dashboard" },
    ],
  },

  {
    title: "Guest Profiles",
    description:
      "Guest profiles, customer history and relationship management operations.",
    icon: UserRound,
    items: [
      { name: "Guest Profiles", route: "/customer/guests" },
      { name: "Customer Timeline", route: "/customer/timeline" },
      { name: "Guest History", route: "/customer/history" },
      { name: "Customer Notes", route: "/customer/notes" },
      { name: "Visit Activity", route: "/customer/activity" },
    ],
  },

  {
    title: "Reservations & Journey",
    description:
      "Reservation operations, customer journey and visit coordination.",
    icon: CalendarDays,
    items: [
      { name: "Reservations", route: "/customer/reservations" },
      { name: "Guest Journey", route: "/customer/journey" },
      { name: "Arrival Tracking", route: "/customer/arrivals" },
      { name: "Table Preferences", route: "/customer/preferences" },
      { name: "Visit Planning", route: "/customer/planning" },
    ],
  },

  {
    title: "Loyalty & VIP",
    description:
      "Loyalty programs, VIP customers and retention operations.",
    icon: Crown,
    items: [
      { name: "Loyalty Runtime", route: "/customer/loyalty" },
      { name: "VIP Guests", route: "/customer/vip" },
      { name: "Rewards", route: "/customer/rewards" },
      { name: "Customer Wallet", route: "/customer/wallet" },
      { name: "Retention Center", route: "/customer/retention" },
    ],
  },

  {
    title: "Customer Experience",
    description:
      "Guest satisfaction, reviews, complaints and service recovery runtime.",
    icon: Star,
    items: [
      { name: "Satisfaction Monitoring", route: "/customer/satisfaction" },
      { name: "Reviews", route: "/customer/reviews" },
      { name: "Complaints", route: "/customer/complaints" },
      { name: "Service Recovery", route: "/customer/recovery" },
      { name: "Guest Feedback", route: "/customer/feedback" },
    ],
  },

  {
    title: "Communication Runtime",
    description:
      "Customer communication, messaging and guest engagement systems.",
    icon: MessageCircle,
    items: [
      { name: "Messaging", route: "/customer/messages" },
      { name: "Email Campaigns", route: "/customer/emails" },
      { name: "Guest Notifications", route: "/customer/notifications" },
      { name: "Communication History", route: "/customer/communications" },
      { name: "Engagement Runtime", route: "/customer/engagement" },
    ],
  },

  {
    title: "Customer Analytics",
    description:
      "Customer behavior, segmentation and guest intelligence analytics.",
    icon: BarChart3,
    items: [
      { name: "Customer Analytics", route: "/customer/analytics" },
      { name: "Behavior Analytics", route: "/customer/behavior" },
      { name: "Segmentation", route: "/customer/segments" },
      { name: "Lifetime Value", route: "/customer/ltv" },
      { name: "Visit Trends", route: "/customer/trends" },
    ],
  },

  {
    title: "AI Customer Intelligence",
    description:
      "AI recommendations, personalization and customer intelligence runtime.",
    icon: Brain,
    items: [
      { name: "Customer AI", route: "/customer/ai" },
      { name: "Personalization", route: "/customer/personalization" },
      { name: "AI Recommendations", route: "/customer/recommendations" },
      { name: "Guest Insights", route: "/customer/insights" },
      { name: "Prediction Center", route: "/customer/predictions" },
    ],
  },

];

const STATUS = [

  {
    label: "CRM Runtime",
    value: "ACTIVE",
  },

  {
    label: "Guest Intelligence",
    value: "ONLINE",
  },

  {
    label: "Loyalty Engine",
    value: "RUNNING",
  },

  {
    label: "Customer AI",
    value: "ARMED",
  },

];

const QUICK_ACTIONS = [

  "Find VIP guests",
  "Review complaints",
  "Analyze guest retention",
  "Check customer satisfaction",
  "Review reservations",
  "Generate customer insights",

];

export default function CustomerPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10">

            <Users className="h-5 w-5 text-emerald-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-emerald-400">

            Churchill Platform

          </div>

        </div>

        <div className="flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Customer

            </h1>

            <p className="max-w-5xl text-lg leading-relaxed text-white/50">

              Customer relationship runtime for CRM, loyalty, reservations,
              guest intelligence, satisfaction and retention operations.

            </p>

          </div>

          <Link
            href="/customer/live"
            className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20"
          >

            Open Customer Runtime

          </Link>

        </div>

      </div>

      <div className="mb-10 grid grid-cols-4 gap-6">

        {STATUS.map((item) => (

          <div
            key={item.label}
            className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6"
          >

            <div className="mb-5 h-8 w-8 rounded-2xl bg-emerald-500/10" />

            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

              {item.label}

            </div>

            <div className="text-3xl font-light">

              {item.value}

            </div>

          </div>

        ))}

      </div>

      <div className="mb-10 rounded-[40px] border border-emerald-500/20 bg-emerald-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/10">

              <Sparkles className="h-8 w-8 text-emerald-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Customer AI Command

              </div>

              <div className="text-white/40">

                Analyze guest behavior, loyalty, complaints and customer satisfaction.

              </div>

            </div>

          </div>

          <Link
            href="/customer/ai"
            className="rounded-2xl border border-emerald-500/20 bg-black/30 px-5 py-3 text-sm text-emerald-300"
          >

            Open Customer Intelligence

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-emerald-400" />

          <input
            placeholder="Ask customer AI to analyze loyalty, guest behavior or customer satisfaction..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-emerald-500 px-6 py-3 font-medium text-white">

            Run

          </button>

        </div>

        <div className="flex flex-wrap gap-3">

          {QUICK_ACTIONS.map((action) => (

            <button
              key={action}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-white"
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

                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/10">

                    <Icon className="h-8 w-8 text-emerald-400" />

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
                    className="group rounded-2xl border border-white/10 bg-black/30 p-4 hover:border-emerald-500/40 hover:bg-emerald-500/5"
                  >

                    <div className="flex items-center justify-between gap-3">

                      <div className="text-white/70">

                        {item.name}

                      </div>

                      <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-emerald-400" />

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
