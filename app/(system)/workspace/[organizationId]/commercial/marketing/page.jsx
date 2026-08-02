"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Brain,
  CalendarDays,
  Eye,
  Image,
  LayoutDashboard,
  Megaphone,
  PenTool,
  Share2,
  Target,
  Users,
} from "lucide-react";

const SECTIONS = [
  {
    title: "Campaign Management",
    description: "Plan, prepare, approve and launch campaigns across connected channels.",
    icon: Megaphone,
    items: [
      { name: "Campaigns", route: "campaigns" },
      { name: "Meta Ads Manager", route: "ads", featured: true },
      { name: "Campaign Queue", route: "queue" },
      { name: "Publishing Calendar", route: "calendar" },
      { name: "Live Campaigns", route: "live-campaigns" },
    ],
  },
  {
    title: "Content Studio",
    description: "Create, approve and manage exact organization-owned campaign assets.",
    icon: PenTool,
    items: [
      { name: "AI Design Studio", route: "design" },
      { name: "Content Workspace", route: "content" },
      { name: "Creative Assets", route: "assets" },
      { name: "Brand Library", route: "brand" },
      { name: "Media Manager", route: "media" },
    ],
  },
  {
    title: "Social & Publishing",
    description: "Publish and monitor content through organization-connected channels.",
    icon: Share2,
    items: [
      { name: "Social Runtime", route: "social" },
      { name: "Instagram", route: "instagram" },
      { name: "Facebook", route: "facebook" },
      { name: "Multi-Platform", route: "platforms" },
      { name: "Publishing Logs", route: "publishing" },
    ],
  },
  {
    title: "Audience & Segmentation",
    description: "Build target groups, journeys and retargeting audiences.",
    icon: Users,
    items: [
      { name: "Audience Segments", route: "segments" },
      { name: "Target Groups", route: "targets" },
      { name: "Personalization", route: "personalization" },
      { name: "Customer Journeys", route: "journeys" },
      { name: "Retargeting", route: "retargeting" },
    ],
  },
  {
    title: "Analytics & Conversion",
    description: "Measure campaign performance, engagement, conversion and return.",
    icon: BarChart3,
    items: [
      { name: "Campaign Analytics", route: "analytics" },
      { name: "Conversion Tracking", route: "conversions" },
      { name: "Engagement Metrics", route: "engagement" },
      { name: "ROI Analytics", route: "roi" },
      { name: "Traffic Analytics", route: "traffic" },
    ],
  },
  {
    title: "AI Marketing Intelligence",
    description: "Generate recommendations and optimize campaigns from live performance.",
    icon: Brain,
    items: [
      { name: "Marketing AI", route: "ai" },
      { name: "Automation Runtime", route: "automation" },
      { name: "Growth Forecasting", route: "forecasting" },
      { name: "Optimization Center", route: "optimization" },
    ],
  },
  {
    title: "Brand & Reputation",
    description: "Protect brand consistency and monitor public customer perception.",
    icon: Eye,
    items: [
      { name: "Brand Monitoring", route: "monitoring" },
      { name: "Reputation Runtime", route: "reputation" },
      { name: "Reviews", route: "reviews" },
      { name: "Community Feedback", route: "feedback" },
      { name: "Public Presence", route: "presence" },
    ],
  },
];

const STATUS = [
  { label: "Campaign Runtime", value: "ACTIVE", icon: LayoutDashboard },
  { label: "Paid Media", value: "CONNECTED", icon: Target },
  { label: "Publishing", value: "ONLINE", icon: CalendarDays },
  { label: "Asset Protection", value: "EXACT", icon: Image },
];

export default function MarketingPage() {
  const params = useParams();
  const organizationId = params?.organizationId;
  const base = `/workspace/${organizationId}/commercial/marketing`;

  return (
    <main className="min-h-screen bg-black p-8 text-white lg:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="mb-3 text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
              Commercial / Marketing
            </div>
            <h1 className="text-6xl font-light">Marketing</h1>
            <p className="mt-4 max-w-3xl text-lg text-white/45">
              Campaign planning, exact creative asset control, connected publishing and paid media execution.
            </p>
          </div>

          <Link
            href={`${base}/ads`}
            className="flex items-center gap-3 rounded-2xl border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-6 py-4 text-sm font-medium text-[#E6C18C] transition hover:bg-[#D6A66A]/20"
          >
            <Megaphone className="h-5 w-5" />
            Open Meta Ads Manager
          </Link>
        </div>

        <div className="mb-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STATUS.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <Icon className="mb-5 h-5 w-5 text-[#D6A66A]" />
              <div className="text-xs uppercase tracking-[0.2em] text-white/30">{label}</div>
              <div className="mt-2 text-2xl font-light">{value}</div>
            </div>
          ))}
        </div>

        <div className="mb-8 rounded-[36px] border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] p-8">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">Paid Media</div>
              <h2 className="mt-2 text-3xl font-light">Meta Ads Manager</h2>
              <p className="mt-2 max-w-3xl text-white/45">
                Select an exact approved organization asset, preview it, confirm the logo and create the complete Meta campaign in paused status.
              </p>
            </div>
            <Link
              href={`${base}/ads`}
              className="flex items-center gap-2 rounded-2xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black"
            >
              Create Meta campaign
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <section key={section.title} className="rounded-[32px] border border-white/10 bg-white/[0.03] p-7">
                <div className="mb-6 flex gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#D6A66A]/10">
                    <Icon className="h-6 w-6 text-[#D6A66A]" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-light">{section.title}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-white/40">{section.description}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {section.items.map((item) => (
                    <Link
                      key={item.route}
                      href={`${base}/${item.route}`}
                      className={`group flex items-center justify-between rounded-2xl border p-4 transition ${
                        item.featured
                          ? "border-[#D6A66A]/30 bg-[#D6A66A]/10 text-[#E6C18C]"
                          : "border-white/10 bg-black/30 text-white/65 hover:border-[#D6A66A]/30 hover:text-white"
                      }`}
                    >
                      <span>{item.name}</span>
                      <ArrowRight className="h-4 w-4 opacity-40 transition group-hover:opacity-100" />
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
