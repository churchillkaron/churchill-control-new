"use client";

import Link from "next/link";

const modules = [
  {
    title: "Creative Studio",
    route: "/design/studio",
    description: "AI creative generation, posters, flyers, menus and visual production.",
  },
  {
    title: "Asset Library",
    route: "/design/assets",
    description: "Photos, videos, graphics, logos and reusable creative assets.",
  },
  {
    title: "Brand Kit",
    route: "/design/brand",
    description: "Brand rules, logos, typography, colors and identity management.",
  },
  {
    title: "Templates",
    route: "/design/templates",
    description: "Menus, social posts, business cards, presentations and layouts.",
  },
  {
    title: "Documents",
    route: "/design/documents",
    description: "SOPs, checklists, quotations, contracts and operational documents.",
  },
  {
    title: "Generation Jobs",
    route: "/design/jobs",
    description: "AI generation queue, processing history and creative runtime.",
  },
];

export default function DesignPage() {
  return (
    <div className="min-h-screen bg-black text-white p-10">
      <div className="max-w-7xl mx-auto">

        <div className="mb-12">
          <div className="text-[#D6B56D] uppercase tracking-[0.3em] text-xs mb-4">
            Avantiqo Creative OS
          </div>

          <h1 className="text-6xl font-light mb-4">
            Design Studio
          </h1>

          <p className="text-white/50 max-w-4xl text-lg">
            Creative production system for assets, branding, templates,
            documents and AI-generated content.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {modules.map((module) => (
            <Link
              key={module.route}
              href={module.route}
              className="rounded-[32px] border border-white/10 bg-white/[0.03] p-8 hover:border-[#D6B56D]/40 transition-all"
            >
              <h2 className="text-2xl font-semibold mb-4">
                {module.title}
              </h2>

              <p className="text-white/50 leading-relaxed">
                {module.description}
              </p>
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}
