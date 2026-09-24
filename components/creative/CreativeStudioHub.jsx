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
  image_studio: {
    label: "Image",
    icon: ImageIcon,
    discipline: "Art direction · composition · versions · finishing",
  },
  video_studio: {
    label: "Video",
    icon: Clapperboard,
    discipline: "Treatment · shots · edit · review · delivery",
  },
  voice_studio: {
    label: "Voice",
    icon: AudioLines,
    discipline: "Script · casting · takes · direction · master",
  },
  music_studio: {
    label: "Music",
    icon: Music2,
    discipline: "Composition · arrangement · stems · mix · master",
  },
  code_studio: {
    label: "Code",
    icon: Code2,
    discipline: "Experience · implementation · verification · release",
  },
  marketing: {
    label: "Marketing",
    icon: Megaphone,
    discipline: "Campaign · channel · creative · publish · learn",
  },
  web_builder: {
    label: "Web",
    icon: Globe2,
    discipline: "Structure · design · content · build · launch",
  },
});

const OPERATING_STAGES = Object.freeze([
  ["01", "Understand", "Business goal, audience, brand, evidence"],
  ["02", "Direct", "Brief, strategy, concept and production plan"],
  ["03", "Create", "Specialist studios work from one project context"],
  ["04", "Review", "Versions, quality, continuity and approvals"],
  ["05", "Deliver", "Publish, hand-off, variants and measurement"],
]);

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
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/[0.08] bg-[#FBF8F3] text-[#D6A66A]">
          <Icon className="h-4 w-4" strokeWidth={1.55} />
        </div>
        <span className={`rounded-full border px-2 py-1 text-[8px] font-medium uppercase tracking-[0.16em] ${unavailable ? "border-black/[0.07] text-[#A19A92]" : "border-[#D6A66A]/15 text-[#D6A66A]/65"}`}>
          {unavailable ? "Planned" : "Professional"}
        </span>
      </div>
      <div className={`mt-5 text-[17px] font-medium tracking-[-0.02em] ${unavailable ? "text-[#918B83]" : "text-[#2F2C28]"}`}>
        {item.name}
      </div>
      <p className={`mt-2 text-[10px] uppercase tracking-[0.13em] ${unavailable ? "text-[#A9A39C]" : "text-[#D6A66A]/42"}`}>
        {presentation.discipline}
      </p>
      <p className={`mt-3 min-h-[44px] text-[11px] leading-5 ${unavailable ? "text-[#918B83]" : "text-[#746E66]"}`}>
        {item.description}
      </p>
      <div className={`mt-5 flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.17em] ${unavailable ? "text-[#A19A92]" : "text-[#817A72] group-hover:text-[#D6A66A]/80"}`}>
        {unavailable ? "Reserved" : "Open professional studio"}
        {!unavailable ? <ArrowUpRight className="h-3 w-3" /> : null}
      </div>
    </>
  );

  const className = `group rounded-[22px] border p-5 transition ${unavailable ? "cursor-not-allowed border-black/[0.055] bg-[#FBF8F3] opacity-65" : "border-black/[0.075] bg-white hover:-translate-y-0.5 hover:border-[#D6A66A]/25 hover:bg-[#FBF3E8]"}`;

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
    <main className="min-h-screen bg-[#F7F6F3] px-5 py-7 text-[#191919] sm:px-6 lg:px-8 lg:py-9">
      <div className="mx-auto max-w-[1560px]">
        <header className="border-b border-black/[0.07] pb-7">
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.3em] text-[#D6A66A]/75">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
            Avantiqo Design & Creative
          </div>
          <div className="mt-3 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-5xl">
              <h1 className="text-4xl font-medium tracking-[-0.05em] text-[#191919] sm:text-5xl lg:text-[58px] lg:leading-[1.02]">
                All studios in one place. One project context across every medium.
              </h1>
              <p className="mt-4 max-w-4xl text-[13px] leading-6 text-[#746E66]">
                Start with the outcome, not a prompt. Creative Studio understands the business context, builds the brief and production plan, coordinates every medium, preserves approved work, routes specialist production, reviews quality and continuity, and carries the job through delivery. Professionals can open any specialist studio without losing project memory.
              </p>
            </div>
            <div className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-[#918B83]">
              {activeSpecialists} professional studios available
            </div>
          </div>
        </header>

        {automaticStudio ? (
          <section className="mt-7">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[#D6A66A]/60">
                Autonomous Creative Studio
              </div>
              <div className="text-[9px] uppercase tracking-[0.16em] text-[#918B83]">
                One project · one memory · one approval history
              </div>
            </div>
            <Link
              href={studioHref(organizationId, automaticStudio)}
              className="group relative block overflow-hidden rounded-[30px] border border-[#D6A66A]/22 bg-white p-6 transition hover:border-[#D6A66A]/40 sm:p-8 lg:p-10"
            >
              <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-[#D6A66A]/[0.075] blur-3xl" />
              <div className="relative grid gap-9 xl:grid-cols-[minmax(0,1fr)_520px] xl:items-end">
                <div>
                  <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]/78">
                    <Sparkles className="h-4 w-4" />
                    Creative Director + Agency Team
                  </div>
                  <h2 className="mt-4 max-w-4xl text-3xl font-medium tracking-[-0.045em] text-[#191919] sm:text-4xl lg:text-[42px] lg:leading-[1.08]">
                    Tell Avantiqo the goal. It builds and runs the production.
                  </h2>
                  <p className="mt-4 max-w-3xl text-[13px] leading-6 text-[#746E66]">
                    A campaign can become film, images, voice, music, web, code and channel assets from the same brief and brand truth. Avantiqo decides what work is needed, sends each job to the right specialist studio, returns only meaningful decisions for approval and continues from the approved state.
                  </p>
                  <div className="mt-7 flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.17em] text-[#D6A66A]/78">
                    Start with a business outcome
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </div>
                </div>

                <div className="overflow-hidden rounded-[22px] border border-black/[0.075] bg-[#FBF8F3]">
                  {OPERATING_STAGES.map(([number, label, detail], index) => (
                    <div
                      key={label}
                      className={`grid grid-cols-[34px_92px_minmax(0,1fr)] gap-3 px-4 py-3.5 ${index ? "border-t border-black/[0.055]" : ""}`}
                    >
                      <span className="text-[9px] font-medium tracking-[0.16em] text-[#D6A66A]/45">{number}</span>
                      <span className="text-[10px] font-medium text-[#5F5A54]">{label}</span>
                      <span className="text-[10px] leading-4 text-[#918B83]">{detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Link>
          </section>
        ) : null}

        <CreativeAgencyWorkQueue organizationId={organizationId} />

        <section className="mt-10">
          <div className="flex flex-col gap-2 border-b border-black/[0.06] pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[#918B83]">Professional control</div>
              <h2 className="mt-2 text-2xl font-medium tracking-[-0.035em] text-[#2F2C28]">Specialist Studios</h2>
            </div>
            <p className="max-w-2xl text-[11px] leading-5 text-[#918B83] sm:text-right">
              The same project, assets, references, versions, approvals and delivery state follow you into every specialist workspace. Go deep without rebuilding context or exposing provider complexity.
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
