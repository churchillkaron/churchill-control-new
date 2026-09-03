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
    description: "Plan the film, produce every shot, inspect every candidate and deliver from one production record.",
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

function videoStageIndex(stage) {
  const value = String(stage || "").toUpperCase();
  if (["MISSION_CREATED", "UNDERSTANDING", "RESEARCHING", "BUILDING_STRATEGY", "BUILDING_CONCEPT"].includes(value)) return 0;
  if (["WAITING_APPROVAL", "BUILDING_STORYBOARD", "PLANNING_PRODUCTION"].includes(value)) return 1;
  if (["READY_FOR_EXECUTION", "EXECUTING", "PRODUCING"].includes(value)) return 2;
  if (value === "RENDERING") return 3;
  if (["REVIEWING", "PUBLISHING"].includes(value)) return 4;
  if (["MONITORING", "LEARNING", "COMPLETED"].includes(value)) return 5;
  return 2;
}

function SpecialistHeader({ mode, runtime }) {
  const meta = MODE_META[mode] || MODE_META.image;
  const Icon = meta.icon;
  const project = runtime.projectRuntime?.current || null;
  const mission = runtime.missionRuntime?.current || null;
  const projectName = project?.name || mission?.title || mission?.business_goal || "No active project";
  const assetCount = runtime.assetRuntime?.items?.length || 0;
  const taskCount = runtime.taskRuntime?.items?.length || 0;
  const isVideo = mode === "video";
  const activeStage = isVideo ? videoStageIndex(runtime.stateRuntime?.current?.stage) : -1;

  if (isVideo) {
    return (
      <header className="shrink-0 border-b border-black/[0.07] bg-[#FBF8F3] text-[#2A2723]">
        <div className="px-4 py-3 sm:px-5 lg:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href={`/workspace/${runtime.organizationId}/creative`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/[0.08] bg-white text-[#746E66] transition hover:bg-[#F6F2EB] hover:text-[#76583A]"
                aria-label="Back to Creative"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#A37849]/15 bg-[#F5EEE5] text-[#76583A]">
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[8px] font-semibold uppercase tracking-[0.15em] text-[#8A633C]">{meta.eyebrow}</div>
                <div className="mt-0.5 flex min-w-0 items-center gap-2">
                  <h1 className="truncate text-[15px] font-semibold tracking-[-0.02em]">{meta.label}</h1>
                  <span className="hidden h-3 w-px bg-black/[0.08] sm:block" />
                  <span className="hidden max-w-[520px] truncate text-[9px] text-[#817B73] sm:block">{projectName}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-3 rounded-lg border border-black/[0.07] bg-white px-3 py-2 text-[8px] text-[#817B73] lg:flex">
                <span className="font-semibold text-[#76583A]">Live production</span>
                <span className="h-3 w-px bg-black/[0.08]" />
                <span>{assetCount} assets</span>
                <span className="h-3 w-px bg-black/[0.08]" />
                <span>{taskCount} tasks</span>
              </div>
              <button
                type="button"
                onClick={() => runtime.refresh?.()}
                disabled={runtime.refreshing}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[8px] font-semibold text-[#716B63] transition hover:bg-[#F8F5F0] disabled:opacity-40"
              >
                <RefreshCw className={`h-3 w-3 ${runtime.refreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto border-t border-black/[0.055] bg-white px-4 sm:px-5 lg:px-6">
          <div className="flex min-w-max items-center gap-1 py-1.5">
            {meta.stages.map((stage, index) => {
              const active = index === activeStage;
              const complete = index < activeStage;
              return (
                <div
                  key={stage}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 ${active ? "bg-[#F5EEE5]" : ""}`}
                >
                  <span className={`text-[7px] font-semibold tabular-nums ${active ? "text-[#76583A]" : complete ? "text-emerald-700" : "text-[#B0AAA2]"}`}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={`text-[8px] font-semibold uppercase tracking-[0.11em] ${active ? "text-[#3E3934]" : complete ? "text-[#65715F]" : "text-[#918B83]"}`}>
                    {stage}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="shrink-0 border-b border-white/[0.08] bg-[#070706]">
      <div className="px-4 py-3 sm:px-5 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={`/workspace/${runtime.organizationId}/creative`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-white/45" aria-label="Back to Creative">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.07] text-[#D6A66A]">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]/70">{meta.eyebrow}</div>
              <h1 className="mt-0.5 truncate text-sm font-semibold text-white/90 sm:text-base">{meta.label}</h1>
            </div>
          </div>
          <button type="button" onClick={() => runtime.refresh?.()} disabled={runtime.refreshing} className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-[11px] text-white/48 disabled:opacity-40">
            <RefreshCw className={`h-3.5 w-3.5 ${runtime.refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
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
      runtime: { ...runtime, refresh: editor.refresh },
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
    <main className={`flex h-[calc(100vh-112px)] min-h-[640px] flex-col overflow-hidden ${showVideoDock ? "bg-[#F6F3EE] text-[#2A2723]" : "bg-[#050505] text-white"}`}>
      <SpecialistHeader mode={mode} runtime={liveRuntime} />
      <section className="min-h-0 flex-1 overflow-hidden">
        {showVideoDock ? (
          <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_190px] 2xl:grid-rows-[minmax(0,1fr)_220px]">
            <div className="min-h-0 overflow-hidden">{workspace}</div>
            <div className="min-h-0 overflow-hidden border-t border-black/[0.07]">
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
