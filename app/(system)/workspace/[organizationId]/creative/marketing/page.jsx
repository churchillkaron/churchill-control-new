export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  FolderOpen,
  LayoutDashboard,
  Megaphone,
  Palette,
  Share2,
  Target,
} from "lucide-react";

const CAPABILITIES = [
  {
    name: "Campaigns",
    description: "Plan and run marketing campaigns.",
    path: "campaigns",
    icon: Megaphone,
  },
  {
    name: "Marketing Dashboard",
    description: "Review campaign and growth performance.",
    path: "dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Meta Ads Manager",
    description: "Create and manage approved Meta advertising campaigns.",
    path: "ads",
    icon: Target,
  },
  {
    name: "Brand DNA",
    description: "Manage brand identity, voice, audience and campaign preferences.",
    path: "brand",
    icon: Palette,
  },
  {
    name: "Creative Assets",
    description: "Work with approved organization-owned campaign assets.",
    path: "assets",
    icon: FolderOpen,
  },
  {
    name: "Social & Publishing",
    description: "Publish and monitor content across connected channels.",
    path: "social",
    icon: Share2,
  },
  {
    name: "Campaign Queue",
    description: "Review queued and scheduled campaign execution.",
    path: "queue",
    icon: BarChart3,
  },
];

export default async function CreativeMarketingPage({ params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();
  const legacyBase = `/workspace/${organizationId}/commercial/marketing`;

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#D6A66A]">
            Creative / Marketing
          </div>
          <h1 className="mt-3 text-5xl font-light tracking-[-0.03em]">Marketing</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/45">
            Campaign planning, paid media, publishing, audiences, brand and growth execution.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {CAPABILITIES.map(({ name, description, path, icon: Icon }) => (
            <Link
              key={path}
              href={`${legacyBase}/${path}`}
              className="group rounded-[28px] border border-white/10 bg-white/[0.025] p-5 transition hover:border-[#D6A66A]/35 hover:bg-[#D6A66A]/[0.06]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-2.5 text-[#D6A66A]">
                  <Icon size={19} />
                </div>
                <ArrowRight size={17} className="mt-2 text-white/25 transition group-hover:translate-x-1 group-hover:text-[#D6A66A]" />
              </div>
              <div className="mt-5 text-base font-medium text-white">{name}</div>
              <div className="mt-2 text-xs leading-5 text-white/40">{description}</div>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-xs leading-5 text-white/25">
          Marketing data and execution contracts remain unchanged while product ownership moves to Creative.
        </p>
      </div>
    </main>
  );
}
