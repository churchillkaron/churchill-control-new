"use client";

import Link from "next/link";
import {
  ArrowLeft,
  AudioLines,
  Clapperboard,
  Image as ImageIcon,
  Music2,
  RefreshCw,
} from "lucide-react";

import { useCreativeEditor } from "@/components/creative/ProductionStudio/hooks/useCreativeEditor";
import BottomDock from "@/components/creative/ProductionStudio/layout/BottomDock";
import MusicStudioWorkspace from "@/components/creative/ProductionStudio/workspaces/MusicStudioWorkspace";
import ProductionWorkspace from "@/components/creative/ProductionStudio/workspaces/ProductionWorkspace";
import { resolveCreativeCommands } from "@/lib/creative/studio/commands/CreativeCommandResolver";

import ImageStudioWorkspace from "./ImageStudioWorkspace";
import VoiceStudioWorkspace from "./VoiceStudioWorkspace";

const MODE_META = Object.freeze({
  image: {
    label: "Image Studio",
    eyebrow: "Creative · Image",
    description: "Professional art direction, versions, finishing and delivery from the shared Creative project.",
    icon: ImageIcon,
    stages: ["Direction", "References", "Create", "Refine", "Review", "Deliver"],
  },
  video: {
    label: "Video Studio",
    eyebrow: "Creative · Video",
    description: "Professional treatment, shot production, editorial, quality review and delivery from one production record.",
    icon: Clapperboard,
    stages: ["Treatment", "Storyboard", "Shots", "Edit", "Review", "Deliver"],
  },
  music: {
    label: "Music Studio",
    eyebrow: "Creative · Music",
    description: "Professional composition, arrangement, takes, stems, mix, mastering and delivery from the shared Creative project.",
    icon: Music2,
    stages: ["Direction", "Compose", "Arrange", "Produce", "Mix", "Master"],
  },
  voice: {
    label: "Voice Studio",
    eyebrow: "Creative · Voice",
    description: "Professional script, casting, performance direction, takes, edit, mastering and delivery with project continuity intact.",
    icon: AudioLines,
    stages: ["Script", "Cast", "Direct", "Takes", "Master", "Deliver"],
  },
});

function SpecialistHeader({ mode, runtime }) {
  const meta = MODE_META[mode] || MODE_META.image;
  const Icon = meta.icon;
  const project = runtime.projectRuntime?.current || null;
  const mission = runtime.missionRuntime?.current || null;
  const projectName = project?.name || mission?.title || mission?.business_goal || "No active project";
  const assetCount = runtime.assetRuntime?.items?.length || 0;
  const taskCount = runtime.taskRuntime?.items?.length || 0;

  return (
    <header className="shrink-0 border-b border-white/[0.08] bg-[#070706]">
      <div className="px-4 py-3 sm:px-5 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={`/workspace/${runtime.organizationId}/creative`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-white/45 transition hover:border-[#D6A66A]/30 hover:text-[#D6A66A]"
              aria-label="Back to Creative"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.07] text-[#D6A66A]">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]/70">
                {meta.eyebrow}
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-2">
                <h1 className="truncate text-sm font-semibold text-white/90 sm:text-base">{meta.label}</h1>
                <span className="hidden h-3 w-px bg-white/10 sm:block" />
                <span className="hidden max-w-[520px] truncate text-[11px] text-white/34 sm:block">
                  {projectName}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[10px] text-white/34 lg:flex">
              <span className="text-[#D6A66A]/60">Shared project</span>
              <span className="h-3 w-px bg-white/10" />
              <span>{assetCount} assets</span>
              <span className="h-3 w-px bg-white/10" />
              <span>{taskCount} tasks</span>
            </div>
            <button
              type="button"
              onClick={() => runtime.refresh?.()}
              disabled={runtime.refreshing}
              className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-[11px] text-white/48 transition hover:border-white/[0.15] hover:text-white/75 disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${runtime.refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        <div className="mt-2 hidden items-center justify-between gap-4 md:flex">
          <div className="truncate text-[10px] text-white/27">{meta.description}</div>
          <div className="shrink-0 text-[9px] uppercase tracking-[0.16em] text-white/20">
            Brand · references · approvals · versions stay synchronized
          </div>
        </div>
      </div>

      <div className="overflow-x-auto border-t border-white/[0.055] bg-black/20 px-4 sm:px-5 lg:px-6">
        <div className="flex min-w-max items-center">
          {meta.stages.map((stage, index) => (
            <div
              key={stage}
              className={`flex items-center gap-2 py-2.5 pr-5 ${index ? "pl-5" : ""}`}
            >
              <span className="text-[8px] font-medium tracking-[0.14em] text-[#D6A66A]/38">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-white/36">
                {stage}
              </span>
              {index < meta.stages.length - 1 ? <span className="ml-3 h-3 w-px bg-white/[0.07]" /> : null}
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}

export default function CreativeSpecialistStudio({ runtime, mode }) {
  const editor = useCreativeEditor(runtime);
  const liveRuntime = {
    ...runtime,
    commands: resolveCreativeCommands({
      commands: runtime.commands || [],
      runtime: {
        ...runtime,
        refresh: editor.refresh,
      },
      editor,
    }),
    refresh: editor.refresh,
    refreshing: editor.refreshing,
  };

  let workspace = <ImageStudioWorkspace runtime={liveRuntime} editor={editor} />;
  if (mode === "video") workspace = <ProductionWorkspace runtime={liveRuntime} editor={editor} />;
  if (mode === "music") workspace = <MusicStudioWorkspace runtime={liveRuntime} editor={editor} />;
  if (mode === "voice") workspace = <VoiceStudioWorkspace runtime={liveRuntime} editor={editor} />;

  const showVideoDock = mode === "video";

  return (
    <main className="flex h-[calc(100vh-112px)] min-h-[640px] flex-col overflow-hidden bg-[#050505] text-white">
      <SpecialistHeader mode={mode} runtime={liveRuntime} />
      <section className="min-h-0 flex-1 overflow-hidden">
        {showVideoDock ? (
          <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_190px] 2xl:grid-rows-[minmax(0,1fr)_220px]">
            <div className="min-h-0 overflow-hidden">{workspace}</div>
            <div className="min-h-0 overflow-hidden border-t border-white/[0.08]">
              <BottomDock runtime={liveRuntime} />
            </div>
          </div>
        ) : (
          <div className="h-full min-h-0 overflow-hidden">{workspace}</div>
        )}
      </section>
    </main>
  );
}
