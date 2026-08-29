import Link from "next/link";
import {
  ArrowUpRight,
  AudioLines,
  Clapperboard,
  Code2,
  Globe2,
  Image as ImageIcon,
  Megaphone,
  Music2,
  Palette,
  Sparkles,
} from "lucide-react";

import { getWorkspaceGroups } from "@/lib/platform/registry/erpRegistry";
import { resolveWorkspaceRoute } from "@/lib/platform/routing/resolveWorkspaceRoute";

const PRESENTATION = Object.freeze({
  design_studio: {
    section: "make",
    label: "Creative OS",
    icon: Palette,
    featured: true,
  },
  image_studio: {
    section: "make",
    label: "Still image",
    icon: ImageIcon,
  },
  video_studio: {
    section: "make",
    label: "Film & motion",
    icon: Clapperboard,
  },
  voice_studio: {
    section: "make",
    label: "Speech & audio",
    icon: AudioLines,
  },
  music_studio: {
    section: "make",
    label: "Music production",
    icon: Music2,
  },
  code_studio: {
    section: "build",
    label: "Software creation",
    icon: Code2,
  },
  web_builder: {
    section: "build",
    label: "Web experiences",
    icon: Globe2,
  },
  marketing: {
    section: "grow",
    label: "Campaigns & growth",
    icon: Megaphone,
    featured: true,
  },
});

const SECTIONS = Object.freeze([
  {
    id: "make",
    eyebrow: "Make",
    title: "Create",
    description: "Design, image, video, voice and music from one creative family.",
  },
  {
    id: "build",
    eyebrow: "Build",
    title: "Build",
    description: "Turn ideas into software and governed digital experiences.",
  },
  {
    id: "grow",
    eyebrow: "Grow",
    title: "Market",
    description: "Take finished creative work into campaigns, publishing and growth execution.",
  },
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

function statusLabel(item) {
  const status = statusOf(item);
  if (status === "planned" || status === "coming-soon" || status === "coming_soon") {
    return "Planned";
  }
  if (DISABLED_STATUSES.has(status)) return "Unavailable";
  return "Active";
}

function studioHref(organizationId, item) {
  return resolveWorkspaceRoute({
    organizationId,
    moduleId: item.id,
    workspaceId: "creative",
    route: item.route,
  });
}

function StudioCard({ item, organizationId, presentation }) {
  const Icon = presentation?.icon || Sparkles;
  const disabled = DISABLED_STATUSES.has(statusOf(item));
  const featured = presentation?.featured === true;

  const content = (
    <>
      <div className="flex items-start justify-between gap-5">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${disabled ? "border-white/8 bg-white/[0.02] text-white/22" : "border-[#D6A66A]/20 bg-[#D6A66A]/[0.07] text-[#E7C58A]"}`}>
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.55} />
          </div>
          <div>
            <div className="text-[9px] font-medium uppercase tracking-[0.22em] text-white/26">
              {presentation?.label || "Creative studio"}
            </div>
            <div className={`mt-1 text-lg font-medium tracking-[-0.02em] ${disabled ? "text-white/38" : "text-white/88"}`}>
              {item.name}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-[0.16em] ${disabled ? "border-white/8 bg-white/[0.02] text-white/28" : "border-[#D6A66A]/18 bg-[#D6A66A]/[0.05] text-[#D6A66A]/72"}`}>
            {statusLabel(item)}
          </span>
          {!disabled ? (
            <ArrowUpRight className="h-4 w-4 text-white/18 transition duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#D6A66A]" />
          ) : null}
        </div>
      </div>

      <p className={`mt-6 max-w-2xl text-sm leading-6 ${disabled ? "text-white/24" : "text-white/40"}`}>
        {item.description}
      </p>

      <div className={`mt-auto pt-7 text-[10px] font-medium uppercase tracking-[0.2em] ${disabled ? "text-white/18" : "text-white/28 group-hover:text-[#D6A66A]/72"}`}>
        {disabled ? "Reserved in Creative" : "Open studio"}
      </div>
    </>
  );

  const className = [
    "group relative flex min-h-[205px] flex-col overflow-hidden rounded-[26px] border p-5 transition duration-200 sm:p-6",
    featured ? "xl:col-span-2" : "",
    disabled
      ? "cursor-not-allowed border-white/[0.055] bg-white/[0.015] opacity-70"
      : "border-white/9 bg-white/[0.025] hover:-translate-y-0.5 hover:border-[#D6A66A]/28 hover:bg-[#D6A66A]/[0.045]",
  ].filter(Boolean).join(" ");

  if (disabled) {
    return (
      <article aria-disabled="true" className={className}>
        {content}
      </article>
    );
  }

  return (
    <Link href={studioHref(organizationId, item)} className={className}>
      <div className="pointer-events-none absolute inset-x-10 -top-16 h-32 rounded-full bg-[#D6A66A]/[0.045] blur-3xl opacity-0 transition duration-300 group-hover:opacity-100" />
      {content}
    </Link>
  );
}

export default function CreativeStudioHub({ organizationId }) {
  const groups = getWorkspaceGroups("creative");
  const items = groups.flatMap((group) => group?.items || []);
  const studios = items.filter((item) => PRESENTATION[item?.id]);
  const activeCount = studios.filter((item) => !DISABLED_STATUSES.has(statusOf(item))).length;
  const plannedCount = studios.length - activeCount;

  return (
    <main className="min-h-screen bg-[#050505] px-5 py-7 text-white sm:px-6 lg:px-8 lg:py-9">
      <div className="mx-auto max-w-[1500px]">
        <header className="relative overflow-hidden rounded-[32px] border border-white/8 bg-[#080807] px-6 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-[#D6A66A]/[0.06] blur-3xl" />
          <div className="relative flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.32em] text-[#D6A66A]/75">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
                Avantiqo Creative
              </div>
              <h1 className="mt-4 text-4xl font-medium tracking-[-0.045em] text-white/92 sm:text-5xl lg:text-6xl">
                One place to make, build and grow.
              </h1>
              <p className="mt-5 max-w-3xl text-sm leading-7 text-white/38 sm:text-[15px]">
                Choose the work you want to do. Creative gives every studio one clear front door while the governed runtime behind each capability stays unchanged.
              </p>
            </div>

            <div className="grid w-full max-w-md grid-cols-2 gap-3 xl:w-auto xl:min-w-[330px]">
              <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-4">
                <div className="text-[9px] uppercase tracking-[0.2em] text-white/24">Available</div>
                <div className="mt-2 text-2xl font-light text-white/78">{activeCount}</div>
                <div className="mt-1 text-[10px] text-white/25">Creative surfaces</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-4">
                <div className="text-[9px] uppercase tracking-[0.2em] text-white/24">Planned</div>
                <div className="mt-2 text-2xl font-light text-white/78">{plannedCount}</div>
                <div className="mt-1 text-[10px] text-white/25">Future surfaces</div>
              </div>
            </div>
          </div>

          <div className="relative mt-8 flex flex-wrap gap-2 border-t border-white/[0.06] pt-5">
            {SECTIONS.map((section, index) => (
              <div key={section.id} className="flex items-center gap-2">
                {index > 0 ? <span className="mx-1 text-white/12">/</span> : null}
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/26">{section.eyebrow}</span>
              </div>
            ))}
          </div>
        </header>

        <div className="mt-9 space-y-12 lg:mt-11 lg:space-y-14">
          {SECTIONS.map((section) => {
            const sectionItems = studios.filter((item) => PRESENTATION[item.id]?.section === section.id);
            if (!sectionItems.length) return null;

            return (
              <section key={section.id}>
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-[0.3em] text-[#D6A66A]/60">
                      {section.eyebrow}
                    </div>
                    <h2 className="mt-2 text-2xl font-medium tracking-[-0.03em] text-white/86">
                      {section.title}
                    </h2>
                  </div>
                  <p className="max-w-xl text-xs leading-5 text-white/30 sm:text-right">
                    {section.description}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {sectionItems.map((item) => (
                    <StudioCard
                      key={item.id}
                      item={item}
                      organizationId={organizationId}
                      presentation={PRESENTATION[item.id]}
                    />
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
