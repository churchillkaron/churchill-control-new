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
    description: "Plan, review and operate governed campaigns across certified channels.",
    icon: Megaphone,
    items: [
      { name: "Campaigns", route: "campaigns" },
      { name: "Campaign Dashboard", route: "dashboard" },
      { name: "Paid Media Builder", route: "ads", featured: true },
      { name: "Campaign Queue", route: "queue" },
    ],
  },
  {
    title: "Creative & Brand",
    description: "Create and manage organization-owned campaign media and brand evidence.",
    icon: PenTool,
    items: [
      { name: "Creative Studio", route: "design" },
      { name: "Creative Assets", route: "assets" },
      { name: "Brand Library", route: "brand" },
    ],
  },
  {
    title: "Organic Social",
    description: "Plan certified social publishing through the governed Campaigns workflow.",
    icon: Share2,
    items: [
      { name: "Social Campaigns", route: "social" },
    ],
  },
];

const STATUS = [
  { label: "Campaign Runtime", value: "GOVERNED", icon: LayoutDashboard },
  { label: "Paid Media", value: "APPROVAL GATED", icon: Target },
  { label: "Publishing", value: "GOVERNED", icon: CalendarDays },
  { label: "Asset Scope", value: "ORGANIZATION", icon: Image },
];

export default function MarketingPage() {
  const params = useParams();
  const organizationId = params?.organizationId;
  const base = `/workspace/${organizationId}/commercial/marketing`;

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-8 text-[#191919] lg:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="mb-3 text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
              Commercial / Marketing
            </div>
            <h1 className="text-6xl font-light">Marketing</h1>
            <p className="mt-4 max-w-3xl text-lg text-[#746E66]">
              Campaign planning, exact creative asset control, connected publishing and paid media execution.
            </p>
          </div>

          <Link
            href={`${base}/ads`}
            className="flex items-center gap-3 rounded-2xl border border-[#D6A66A]/30 bg-[#FBF3E8] px-6 py-4 text-sm font-semibold text-[#6B4C2E] transition hover:bg-[#F4E7D5]"
          >
            <Megaphone className="h-5 w-5" />
            Open Paid Media Builder
          </Link>
        </div>

        <div className="mb-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STATUS.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-3xl border border-black/[0.08] bg-[#FBF8F3] p-6">
              <Icon className="mb-5 h-5 w-5 text-[#D6A66A]" />
              <div className="text-xs uppercase tracking-[0.2em] text-[#A19A92]">{label}</div>
              <div className="mt-2 text-2xl font-light">{value}</div>
            </div>
          ))}
        </div>

        <div className="mb-8 rounded-[36px] border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] p-8">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">Paid Media</div>
              <h2 className="mt-2 text-3xl font-light">Paid Media Builder</h2>
              <p className="mt-2 max-w-3xl text-[#746E66]">
                Build provider-ready paid campaigns from certified organization connections. Exact creative, no-spend preflight and owner approval remain mandatory before creation.
              </p>
            </div>
            <Link
              href={`${base}/ads`}
              className="flex items-center gap-2 rounded-2xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black"
            >
              Build paid campaign
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <section key={section.title} className="rounded-[32px] border border-black/[0.08] bg-[#FBF8F3] p-7">
                <div className="mb-6 flex gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#D6A66A]/10">
                    <Icon className="h-6 w-6 text-[#D6A66A]" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-light">{section.title}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-[#817A72]">{section.description}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {section.items.map((item) => (
                    <Link
                      key={item.route}
                      href={`${base}/${item.route}`}
                      className={`group flex items-center justify-between rounded-2xl border p-4 transition ${
                        item.featured
                          ? "border-[#D6A66A]/30 bg-[#FBF3E8] text-[#6B4C2E]"
                          : "border-black/[0.08] bg-white text-[#5F5A54] hover:border-[#D6A66A]/30 hover:text-[#191919]"
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
