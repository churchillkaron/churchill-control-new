export const dynamic = "force-dynamic";

import Link from "next/link";

const platformAreas = [
  {
    title: "Workspace",
    description: "Open the enterprise workspace and domain modules.",
    href: "/workspace",
  },
  {
    title: "Finance",
    description: "Review accounting, treasury, revenue and control flows.",
    href: "/workspace/demo/finance",
  },
  {
    title: "POS",
    description: "Run table control, open checks and payment workflows.",
    href: "/workspace/demo/operations/pos",
  },
  {
    title: "Services",
    description: "Manage integrations, usage, wallet and platform services.",
    href: "/workspace/demo/services",
  },
];

export default function PlatformPage() {
  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-8">
      <div className="border-b border-white/10 pb-8">
        <p className="text-xs uppercase tracking-[0.32em] text-emerald-300">
          Avantiqo Runtime
        </p>
        <h1 className="mt-4 text-4xl font-semibold text-white">
          Platform Command
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
          Your operating system is online. Choose a workspace area to verify
          core workflows and continue building from the live runtime.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {platformAreas.map((area) => (
          <Link
            key={area.href}
            href={area.href}
            className="rounded-lg border border-white/10 bg-white/[0.035] p-5 transition hover:border-emerald-400/50 hover:bg-emerald-400/10"
          >
            <div className="text-lg font-medium text-white">{area.title}</div>
            <div className="mt-2 text-sm leading-6 text-white/50">
              {area.description}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
