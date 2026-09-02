import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Clapperboard,
  Code2,
  Globe2,
  Image as ImageIcon,
  Megaphone,
  Music2,
  Sparkles,
} from "lucide-react";

import CreativeAgencyWorkQueue from "@/components/creative/CreativeAgencyWorkQueue";
import { getWorkspaceGroups } from "@/lib/platform/registry/erpRegistry";
import { resolveWorkspaceRoute } from "@/lib/platform/routing/resolveWorkspaceRoute";

const SPECIALIST_PRESENTATION = Object.freeze({
  image_studio: { label: "Image", icon: ImageIcon },
  video_studio: { label: "Video", icon: Clapperboard },
  voice_studio: { label: "Voice", icon: AudioLines },
  music_studio: { label: "Music", icon: Music2 },
  code_studio: { label: "Code", icon: Code2 },
  marketing: { label: "Marketing", icon: Megaphone },
  web_builder: { label: "Web", icon: Globe2 },
});

const DISABLED_STATUSES = new Set([
  "planned",
  "blocked",
  "partial",
  "unproven",
  "disabled",
  "unavailable",
  "coming-soon",
  "coming_soon",
]);

function statusOf(item) {
  return String(item?.status || "active").trim().toLowerCase();
}

function disabled(item) {
  return DISABLED_STATUSES.has(statusOf(item));
}

function studioHref(organizationId, item) {
  return resolveWorkspaceRoute({
    organizationId,
    moduleId: item.id,
    workspaceId: "creative",
    route: item.route,
  });
}

function SpecialistCard({ organizationId, item }) {
  const presentation = SPECIALIST_PRESENTATION[item.id] || {};
  const Icon = presentation.icon || Sparkles;
  const unavailable = disabled(item);

  const body = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.025] text-[#D6A66A]">
          <Icon className="h-4 w-4" strokeWidth={1.55} />
        </div>
        <span className={`rounded-full border px-2 py-1 text-[8px] font-medium uppercase tracking-[0.16em] ${unavailable ? "border-white/[0.07] text-white/25" : "border-[#D6A66A]/15 text-[#D6A66A]/65"}`}>
          {unavailable ? "Planned" : "Specialist"}
        </span>
      </div>
      <div className={`mt-5 text-[17px] font-medium tracking-[-0.02em] ${unavailable ? "text-white/35" : "text-white/88"}`}>
        {item.name}
      </div>
      <p className={`mt-2 min-h-[44px] text-[11px] leading-5 ${unavailable ? "text-white/20" : "text-white/38"}`}>
        {item.description}
      </p>
      <div className={`mt-5 flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.17em] ${unavailable ? "text-white/18" : "text-white/26 group-hover:text-[#D6A66A]/80"}`}>
        {unavailable ? "Reserved" : "Open specialist studio"}
        {!unavailable ? <ArrowUpRight className="h-3 w-3" /> : null}
      </div>
    </>
  );

  const className = `group rounded-[22px] border p-5 transition ${unavailable ? "cursor-not-allowed border-white/[0.055] bg-white/[0.012] opacity-65" : "border-white/[0.075] bg-white/[0.02] hover:-translate-y-0.5 hover:border-[#D6A66A]/25 hover:bg-[#D6A66A]/[0.035]"}`;

  if (unavailable) return <article className={className}>{body}</article>;
  return <Link href={studioHref(organizationId, item)} className={className}>{body}</Link>;
}

export default function CreativeStudioHub({ organizationId }) {
  const groups = getWorkspaceGroups("creative");
  const items = groups.flatMap((group) => group?.items || []).filter((item) => !item?.hidden);
  const automaticStudio = items.find((item) => item?.id === "creative_studio") || null;
  const specialists = items.filter((item) => SPECIALIST_PRESENTATION[item?.id]);
  const activeSpecialists = specialists.filter((item) => !disabled(item)).length;

  return (
    <main className="min-h-screen bg-[#050505] px-5 py-7 text-white sm:px-6 lg:px-8 lg:py-9">
      <div className="mx-auto max-w-[1500px]">
        <header className="border-b border-white/[0.07] pb-7">
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.3em] text-[#D6A66A]/75">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
            Avantiqo Creative
          </div>
          <div className="mt-3 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <h1 className="text-4xl font-medium tracking-[-0.045em] text-white/92 sm:text-5xl">
                Tell us what you want to achieve.
              </h1>
              <p className="mt-4 max-w-3xl text-[13px] leading-6 text-white/38">
                Use Creative Studio when you want Avantiqo to run the whole agency job automatically. Open a specialist studio when you want direct control of a specific medium.
              </p>
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/24">
              {activeSpecialists} specialist studios available
            </div>
          </div>
        </header>

        {automaticStudio ? (
          <section className="mt-7">
            <div className="mb-3 text-[9px] font-semibold uppercase tracking-[0.28em] text-[#D6A66A]/60">
              Automatic agency
            </div>
            <Link
              href={studioHref(organizationId, automaticStudio)}
              className="group relative block overflow-hidden rounded-[28px] border border-[#D6A66A]/20 bg-[#0A0908] p-6 transition hover:border-[#D6A66A]/38 sm:p-8 lg:p-10"
            >
              <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-[#D6A66A]/[0.075] blur-3xl" />
              <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
                <div>
                  <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]/75">
                    <Sparkles className="h-4 w-4" />
                    Creative Studio
                  </div>
                  <h2 className="mt-4 max-w-3xl text-3xl font-medium tracking-[-0.04em] text-white/94 sm:text-4xl">
                    Say it normally. Avantiqo handles the creative job.
                  </h2>
                  <p className="mt-4 max-w-3xl text-[13px] leading-6 text-white/42">
                    “Make a launch campaign.” “Create a film from these photos.” “Build the website and social assets.” Creative Studio turns the goal into a brief, chooses the specialist engines, produces versions, brings work back for review and continues through approval, publishing and measurement.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/[0.075] bg-white/[0.025] p-5">
                  <div className="text-[9px] uppercase tracking-[0.18em] text-white/28">Automatic workflow</div>
                  <div className="mt-3 text-[12px] leading-6 text-white/58">
                    Goal → Brief → Strategy → Production → Review → Approval → Publish → Measure
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-white/[0.065] pt-4 text-[10px] font-medium uppercase tracking-[0.17em] text-[#D6A66A]/75">
                    Start creative work
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </div>
                </div>
              </div>
            </Link>
          </section>
        ) : null}

        <CreativeAgencyWorkQueue organizationId={organizationId} />

        <section className="mt-10">
          <div className="flex flex-col gap-2 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.28em] text-white/28">Expert mode</div>
              <h2 className="mt-2 text-2xl font-medium tracking-[-0.03em] text-white/86">Specialist Studios</h2>
            </div>
            <p className="max-w-xl text-[11px] leading-5 text-white/28 sm:text-right">
              Direct access when a designer, editor, producer, developer or marketer wants to control the medium themselves.
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {specialists.map((item) => (
              <SpecialistCard key={item.id} organizationId={organizationId} item={item} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
