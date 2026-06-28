"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  CalendarDays,
  Eye,
  FileImage,
  Globe2,
  Instagram,
  LayoutDashboard,
  Megaphone,
  PenTool,
  PieChart,
  Radio,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wand2,
} from "lucide-react";

const SECTIONS = [

  {
    title: "Marketing Overview",
    description:
      "Main marketing command center, live campaign visibility and growth performance.",
    icon: LayoutDashboard,
    items: [
      { name: "Overview", route: "/marketing/overview" },
      { name: "Live Runtime", route: "/marketing/live" },
      { name: "Growth Dashboard", route: "/marketing/growth" },
      { name: "Performance Center", route: "/marketing/performance" },
    ],
  },

  {
    title: "Campaign Management",
    description:
      "Campaign planning, execution, scheduling and publishing operations.",
    icon: Megaphone,
    items: [
      { name: "Campaigns", route: "/marketing/campaigns" },
      { name: "Campaign Queue", route: "/marketing/queue" },
      { name: "Publishing Calendar", route: "/marketing/calendar" },
      { name: "Scheduled Posts", route: "/marketing/scheduled" },
      { name: "Live Campaigns", route: "/marketing/live-campaigns" },
    ],
  },

  {
    title: "Content Studio",
    description:
      "Creative production, AI generation and media management runtime.",
    icon: PenTool,
    items: [
      { name: "AI Design Studio", route: "/marketing/design" },
      { name: "Content Workspace", route: "/marketing/content" },
      { name: "Creative Assets", route: "/marketing/assets" },
      { name: "Brand Library", route: "/marketing/brand" },
      { name: "Media Manager", route: "/marketing/media" },
    ],
  },

  {
    title: "Social & Publishing",
    description:
      "Social publishing, channel management and platform operations.",
    icon: Share2,
    items: [
      { name: "Social Runtime", route: "/marketing/social" },
      { name: "Instagram", route: "/marketing/instagram" },
      { name: "Facebook", route: "/marketing/facebook" },
      { name: "Multi-Platform", route: "/marketing/platforms" },
      { name: "Publishing Logs", route: "/marketing/publishing" },
    ],
  },

  {
    title: "Audience & Segmentation",
    description:
      "Customer targeting, segmentation and audience growth operations.",
    icon: Users,
    items: [
      { name: "Audience Segments", route: "/marketing/segments" },
      { name: "Target Groups", route: "/marketing/targets" },
      { name: "Personalization", route: "/marketing/personalization" },
      { name: "Customer Journeys", route: "/marketing/journeys" },
      { name: "Retargeting", route: "/marketing/retargeting" },
    ],
  },

  {
    title: "Analytics & Conversion",
    description:
      "Campaign analytics, conversion tracking and marketing measurement.",
    icon: BarChart3,
    items: [
      { name: "Campaign Analytics", route: "/marketing/analytics" },
      { name: "Conversion Tracking", route: "/marketing/conversions" },
      { name: "Engagement Metrics", route: "/marketing/engagement" },
      { name: "ROI Analytics", route: "/marketing/roi" },
      { name: "Traffic Analytics", route: "/marketing/traffic" },
    ],
  },

  {
    title: "AI Marketing Intelligence",
    description:
      "AI recommendations, automation and campaign optimization systems.",
    icon: Brain,
    items: [
      { name: "Marketing AI", route: "/marketing/ai" },
      { name: "AI Recommendations", route: "/marketing/recommendations" },
      { name: "Automation Runtime", route: "/marketing/automation" },
      { name: "Growth Forecasting", route: "/marketing/forecasting" },
      { name: "Optimization Center", route: "/marketing/optimization" },
    ],
  },

  {
    title: "Brand & Reputation",
    description:
      "Brand consistency, reviews, reputation and customer perception monitoring.",
    icon: Eye,
    items: [
      { name: "Brand Monitoring", route: "/marketing/monitoring" },
      { name: "Reputation Runtime", route: "/marketing/reputation" },
      { name: "Reviews", route: "/marketing/reviews" },
      { name: "Community Feedback", route: "/marketing/feedback" },
      { name: "Public Presence", route: "/marketing/presence" },
    ],
  },

];

const STATUS = [

  {
    label: "Campaign Runtime",
    value: "ACTIVE",
  },

  {
    label: "Publishing",
    value: "ONLINE",
  },

  {
    label: "AI Marketing",
    value: "ARMED",
  },

  {
    label: "Growth Engine",
    value: "RUNNING",
  },

];

const QUICK_ACTIONS = [

  "Generate campaign",
  "Schedule social posts",
  "Analyze campaign ROI",
  "Review engagement",
  "Optimize targeting",
  "Prepare weekend promotion",

];

export default function MarketingPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-pink-500/10">

            <Megaphone className="h-5 w-5 text-pink-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-pink-400">

            Churchill Platform

          </div>

        </div>

        <div className="flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Marketing

            </h1>

            <p className="max-w-5xl text-lg leading-relaxed text-white/50">

              Hospitality growth runtime for campaigns, social publishing,
              customer targeting, AI marketing and conversion analytics.

            </p>

          </div>

          <Link
            href="/marketing/live"
            className="rounded-2xl border border-pink-500/20 bg-pink-500/10 px-5 py-4 text-sm font-medium text-pink-300 hover:bg-pink-500/20"
          >

            Open Marketing Runtime

          </Link>

        </div>

      </div>

      <div className="mb-10 grid grid-cols-4 gap-6">

        {STATUS.map((item) => (

          <div
            key={item.label}
            className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6"
          >

            <div className="mb-5 h-8 w-8 rounded-2xl bg-pink-500/10" />

            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

              {item.label}

            </div>

            <div className="text-3xl font-light">

              {item.value}

            </div>

          </div>

        ))}

      </div>

      <div className="mb-10 rounded-[40px] border border-pink-500/20 bg-pink-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-pink-500/10">

              <Sparkles className="h-8 w-8 text-pink-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Marketing AI Command

              </div>

              <div className="text-white/40">

                Generate campaigns, optimize targeting and manage publishing operations.

              </div>

            </div>

          </div>

          <Link
            href="/marketing/ai"
            className="rounded-2xl border border-pink-500/20 bg-black/30 px-5 py-3 text-sm text-pink-300"
          >

            Open Marketing Intelligence

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-pink-400" />

          <input
            placeholder="Ask marketing AI to generate campaigns, optimize targeting or analyze conversions..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-pink-500 px-6 py-3 font-medium text-white">

            Run

          </button>

        </div>

        <div className="flex flex-wrap gap-3">

          {QUICK_ACTIONS.map((action) => (

            <button
              key={action}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 hover:border-pink-500/30 hover:bg-pink-500/10 hover:text-white"
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

                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-pink-500/10">

                    <Icon className="h-8 w-8 text-pink-400" />

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
                    className="group rounded-2xl border border-white/10 bg-black/30 p-4 hover:border-pink-500/40 hover:bg-pink-500/5"
                  >

                    <div className="flex items-center justify-between gap-3">

                      <div className="text-white/70">

                        {item.name}

                      </div>

                      <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-pink-400" />

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
