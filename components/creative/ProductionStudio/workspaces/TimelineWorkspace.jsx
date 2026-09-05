"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Film,
  Layers3,
  MessageSquareText,
  Music2,
  Play,
  ShieldCheck,
  Sparkles,
  Subtitles,
  Volume2,
} from "lucide-react";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function timecode(value = 0) {
  const total = Math.max(0, finite(value, 0));
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function shortDuration(value = 0) {
  const duration = finite(value, 0);
  return duration > 0 ? `${duration.toFixed(duration >= 10 ? 1 : 2)}s` : "—";
}

function superseded(task = {}) {
  return Boolean(
    task.metadata?.superseded_by_revision_task_id ||
    task.metadata?.superseded_by_repair_task_id ||
    task.metadata?.superseded_by_repair_review_task_id,
  );
}

function taskShotId(task = {}) {
  return task.shot_id || task.metadata?.shot_id || null;
}

function taskMediaUrl(task = {}) {
  const output = task.output || {};
  return (
    output.file_url ||
    output.video_url ||
    output.url ||
    output.output?.video_url ||
    output.output?.file_url ||
    output.output?.url ||
    output.output?.result ||
    output.provider_poll?.output ||
    ""
  );
}

function assetMediaUrl(asset = {}) {
  return asset.video_url || asset.file_url || asset.url || asset.image_url || asset.thumbnail_url || "";
}

function isVideoUrl(value = "") {
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(String(value || ""));
}

function qualityScore(task = {}) {
  const candidates = [
    task.output?.validation_evidence,
    task.output?.output?.validation,
    task.output?.validation,
    task.output?.result,
    task.output?.output?.result,
  ];
  const evidence = candidates.find((item) => item && typeof item === "object") || {};
  const value = evidence.total_score ?? evidence.overall_score ?? evidence.sync_score ?? null;
  return value === null || value === undefined ? null : finite(value, null);
}

function taskStatus(tasks = []) {
  if (tasks.some((task) => ["FAILED", "SKIPPED"].includes(String(task.status).toUpperCase()))) return "FAILED";
  if (tasks.some((task) => String(task.status).toUpperCase() === "REVIEW")) return "REVIEW";
  if (tasks.some((task) => String(task.status).toUpperCase() === "RUNNING")) return "RUNNING";
  if (tasks.length && tasks.every((task) => String(task.status).toUpperCase() === "COMPLETED")) return "COMPLETED";
  return tasks.length ? "WAITING" : "UNMATERIALIZED";
}

function statusClass(status = "") {
  const value = String(status || "").toUpperCase();
  if (value === "COMPLETED") return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (value === "REVIEW") return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (value === "RUNNING") return "border-[#9A6A37]/15 bg-[#F7EFE5] text-[#76583A]";
  if (value === "FAILED") return "border-red-700/15 bg-red-50 text-red-800";
  return "border-black/[0.08] bg-[#F5F3EF] text-[#7C756D]";
}

function statusDot(status = "") {
  const value = String(status || "").toUpperCase();
  if (value === "COMPLETED") return "bg-emerald-600";
  if (value === "REVIEW") return "bg-amber-500";
  if (value === "RUNNING") return "bg-[#9A6A37]";
  if (value === "FAILED") return "bg-red-600";
  return "bg-[#B8B1A8]";
}

function sceneOrderMap(scenes = []) {
  return new Map(scenes.map((scene, index) => [scene.id, finite(scene.scene_number, index + 1)]));
}

function shotDuration(shot = {}) {
  return finite(
    shot.duration_seconds ||
    shot.performance_contract?.duration_seconds ||
    shot.generation?.output_spec?.duration_seconds,
    0,
  );
}

function shotLabel(shot = {}, index = 0) {
  return shot.title || shot.purpose || shot.subject || `Shot ${index + 1}`;
}

function candidateForShot({ shot, tasks, assets }) {
  const shotTasks = tasks.filter((task) => taskShotId(task) === shot.id && !superseded(task));
  const mediaTasks = [...shotTasks]
    .reverse()
    .map((task) => ({ task, url: taskMediaUrl(task) }))
    .filter((row) => row.url);
  const explicitlySelected = mediaTasks.find(({ task }) =>
    task.metadata?.selected_for_edit === true ||
    task.metadata?.selected_take === true ||
    task.review?.approved === true,
  );
  const chosen = explicitlySelected || mediaTasks[0] || null;
  const asset = assets.find((item) => item.shot_id === shot.id || item.metadata?.shot_id === shot.id) || null;
  return {
    tasks: shotTasks,
    task: chosen?.task || null,
    url: chosen?.url || assetMediaUrl(asset),
    score: chosen?.task ? qualityScore(chosen.task) : null,
    selection: explicitlySelected ? "SELECTED" : chosen ? "EFFECTIVE" : asset ? "ASSET" : "MISSING",
  };
}

function buildShotCut({ shots, scenes, tasks, assets }) {
  const order = sceneOrderMap(scenes);
  const sorted = [...shots].sort((left, right) => {
    const sceneDelta = finite(order.get(left.scene_id), 9999) - finite(order.get(right.scene_id), 9999);
    if (sceneDelta !== 0) return sceneDelta;
    return finite(left.shot_number, 9999) - finite(right.shot_number, 9999);
  });
  let cursor = 0;
  return sorted.map((shot, index) => {
    const candidate = candidateForShot({ shot, tasks, assets });
    const duration = shotDuration(shot);
    const start = cursor;
    const end = start + duration;
    cursor = end;
    return {
      key: `shot:${shot.id}`,
      kind: "SHOT",
      index: index + 1,
      shot,
      title: shotLabel(shot, index),
      scene_id: shot.scene_id || null,
      url: candidate.url,
      task: candidate.task,
      tasks: candidate.tasks,
      score: candidate.score,
      selection: candidate.selection,
      status: taskStatus(candidate.tasks),
      timeline_in_seconds: start,
      timeline_out_seconds: end,
      duration_seconds: duration,
      source_in_seconds: 0,
      source_out_seconds: duration,
      performance_verified: candidate.task?.metadata?.performance_verified === true,
      requirement_index: null,
    };
  });
}

function buildEdlCut(timeline, assets = []) {
  const entries = Array.isArray(timeline?.metadata?.edit_decision_list)
    ? timeline.metadata.edit_decision_list
    : [];
  return entries.map((entry, index) => {
    const asset = assets.find((item) =>
      item.id === entry.source_asset_node_id ||
      item.id === entry.source_clip_node_id ||
      item.id === entry.source_moment_node_id,
    );
    const start = finite(entry.timeline_in_seconds, 0);
    const end = finite(entry.timeline_out_seconds, start + finite(entry.duration_seconds, 0));
    return {
      key: `edl:${entry.source_moment_node_id || entry.source_clip_node_id || entry.source_asset_node_id || index}`,
      kind: "EDL",
      index: finite(entry.index, index + 1),
      shot: null,
      title: entry.label || entry.title || `Edit ${index + 1}`,
      scene_id: null,
      url: entry.source_url || assetMediaUrl(asset),
      task: null,
      tasks: [],
      score: entry.selection_score ?? null,
      selection: "COMPOSED",
      status: entry.performance_verified === false ? "REVIEW" : "COMPLETED",
      timeline_in_seconds: start,
      timeline_out_seconds: end,
      duration_seconds: finite(entry.duration_seconds, Math.max(0, end - start)),
      source_in_seconds: finite(entry.source_in_seconds, 0),
      source_out_seconds: finite(entry.source_out_seconds, 0),
      performance_verified: entry.performance_verified === true,
      requirement_index: entry.requirement_index ?? null,
      selection_evidence: entry.selection_evidence || null,
    };
  });
}

function laneMatch(task = {}, lane) {
  const capability = String(task.capability || task.service_code || "").toLowerCase();
  const title = String(task.title || "").toLowerCase();
  const haystack = `${capability} ${title}`;
  if (lane === "voice") return /(voice|speech|dialogue|dialog|lip.?sync)/.test(haystack);
  if (lane === "music") return /(music|soundtrack|sfx|audio)/.test(haystack) && !/(voice|speech|dialogue|lip.?sync)/.test(haystack);
  if (lane === "subtitle") return /(subtitle|caption)/.test(haystack);
  return false;
}

function TrackLane({ label, icon: Icon, clips, tasks, lane, scale }) {
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] border-t border-black/[0.055] first:border-t-0">
      <div className="flex items-center gap-1.5 border-r border-black/[0.055] bg-[#F8F6F2] px-3 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#7D766F]">
        <Icon size={9} /> {label}
      </div>
      <div className="overflow-x-auto bg-white py-1.5">
        <div className="flex min-h-8 items-stretch gap-px px-1.5" style={{ minWidth: `${Math.max(720, clips.reduce((sum, clip) => sum + Math.max(58, finite(clip.duration_seconds, 0) * scale), 0))}px` }}>
          {clips.map((clip) => {
            const matching = lane === "video"
              ? clip.tasks || []
              : tasks.filter((task) => !superseded(task) && taskShotId(task) === clip.shot?.id && laneMatch(task, lane));
            const active = lane === "video" ? Boolean(clip.url) : matching.length > 0;
            return (
              <div
                key={`${lane}:${clip.key}`}
                className={`flex min-w-0 items-center rounded px-2 text-[6px] ${active ? "border border-[#A37849]/15 bg-[#F5EEE5] text-[#76583A]" : "border border-black/[0.04] bg-[#FAF9F7] text-[#B2ABA3]"}`}
                style={{ width: `${Math.max(58, finite(clip.duration_seconds, 0) * scale)}px` }}
              >
                <span className="truncate">{active ? (lane === "video" ? clip.title : matching[0]?.title || matching[0]?.capability || label) : "—"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function TimelineWorkspace({ runtime, editor }) {
  const timelineItems = runtime.timelineRuntime?.items || [];
  const timelineCurrent = runtime.timelineRuntime?.current || timelineItems[0] || null;
  const scenes = runtime.sceneRuntime?.items || [];
  const shots = runtime.shotRuntime?.items || [];
  const tasks = runtime.taskRuntime?.items || [];
  const assets = runtime.assetRuntime?.items || [];

  const [selectedVersionId, setSelectedVersionId] = useState(timelineCurrent?.id || null);
  const [selectedClipKey, setSelectedClipKey] = useState(null);

  const timeline = timelineItems.find((item) => item.id === selectedVersionId) || timelineCurrent || null;
  const edlClips = useMemo(() => buildEdlCut(timeline, assets), [timeline, assets]);
  const shotClips = useMemo(() => buildShotCut({ shots, scenes, tasks, assets }), [shots, scenes, tasks, assets]);
  const clips = edlClips.length ? edlClips : shotClips;
  const selectedClip = clips.find((clip) => clip.key === selectedClipKey) || clips[0] || null;

  const effectiveTasks = tasks.filter((task) => !superseded(task));
  const failedTasks = effectiveTasks.filter((task) => ["FAILED", "SKIPPED"].includes(String(task.status).toUpperCase()));
  const reviewTasks = effectiveTasks.filter((task) => String(task.status).toUpperCase() === "REVIEW");
  const runningTasks = effectiveTasks.filter((task) => String(task.status).toUpperCase() === "RUNNING");
  const missingShotMedia = shotClips.filter((clip) => !clip.url).length;
  const missingRequirements = Array.isArray(timeline?.metadata?.missing_requirements)
    ? timeline.metadata.missing_requirements
    : [];

  const totalDuration = finite(
    timeline?.metadata?.total_duration_seconds ?? timeline?.technical?.duration_seconds,
    clips.reduce((max, clip) => Math.max(max, finite(clip.timeline_out_seconds, 0)), 0),
  );
  const scale = totalDuration > 0 ? Math.max(12, Math.min(26, 1000 / totalDuration)) : 18;
  const distinctScenes = new Set(shots.map((shot) => shot.scene_id).filter(Boolean)).size;
  const sourceCount = finite(timeline?.metadata?.distinct_source_count, new Set(clips.map((clip) => clip.url).filter(Boolean)).size);
  const cutStatus = String(timeline?.status || (clips.length ? "WORKING_CUT" : "NOT_STARTED")).toUpperCase();
  const currentVersionIndex = Math.max(0, timelineItems.findIndex((item) => item.id === timeline?.id));
  const masterReady = Boolean(
    timeline &&
    clips.length &&
    failedTasks.length === 0 &&
    reviewTasks.length === 0 &&
    runningTasks.length === 0 &&
    missingShotMedia === 0 &&
    missingRequirements.length === 0,
  );

  const rulerMarks = totalDuration > 0
    ? [0, totalDuration * 0.25, totalDuration * 0.5, totalDuration * 0.75, totalDuration]
    : [0];
  const playerUrl = selectedClip?.url || "";
  const playerSource = playerUrl && selectedClip?.kind === "EDL" && selectedClip.source_in_seconds > 0
    ? `${playerUrl}#t=${selectedClip.source_in_seconds},${selectedClip.source_out_seconds || ""}`
    : playerUrl;

  return (
    <div className="h-full overflow-auto bg-[#F6F3EE] text-[#2A2723]">
      <div className="sticky top-0 z-20 border-b border-black/[0.07] bg-[#F6F3EE]/95 px-4 py-3 backdrop-blur-sm lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[7px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">Edit desk</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="truncate text-[15px] font-semibold tracking-[-0.02em]">{timeline?.name || timeline?.title || "Main timeline"}</h2>
              <span className="text-[8px] text-[#817B73]">{shortDuration(totalDuration)} · {clips.length} clips · {distinctScenes || scenes.length} scenes</span>
              <span className={`rounded-full border px-2 py-1 text-[7px] font-semibold ${statusClass(cutStatus === "DERIVED" ? "COMPLETED" : cutStatus === "REVIEW" ? "REVIEW" : "WAITING")}`}>{cutStatus.replaceAll("_", " ")}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => editor?.setActiveWorkspace?.("production")} className="h-8 rounded-lg border border-black/[0.08] bg-white px-3 text-[8px] font-semibold text-[#716B63]">Production</button>
            <button type="button" onClick={() => editor?.setActiveWorkspace?.("render")} disabled={!masterReady} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#25231F] px-3 text-[8px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35"><Play size={8} fill="currentColor" /> {masterReady ? "Open master" : "Master blocked"}</button>
          </div>
        </div>
      </div>

      <div className="grid min-h-[760px] xl:grid-cols-[minmax(0,1fr)_310px]">
        <main className="min-w-0 border-r border-black/[0.07] p-4 lg:p-5">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Cut duration", shortDuration(totalDuration), Clock3],
              ["Cut versions", timelineItems.length || (timeline ? 1 : 0), Layers3],
              ["Source media", sourceCount, Film],
              ["Review holds", reviewTasks.length + failedTasks.length, MessageSquareText],
            ].map(([label, value, Icon]) => (
              <div key={label} className="rounded-xl border border-black/[0.07] bg-white px-3 py-3">
                <div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#918B83]"><Icon size={9} /> {label}</div>
                <div className="mt-1 text-[15px] font-semibold tabular-nums text-[#403C37]">{value}</div>
              </div>
            ))}
          </div>

          <section className="mt-3 overflow-hidden rounded-xl border border-black/[0.08] bg-[#211F1C] shadow-sm">
            <div className="flex min-h-[360px] items-center justify-center">
              {playerSource ? (
                isVideoUrl(playerSource)
                  ? <video src={playerSource} controls preload="metadata" className="max-h-[620px] w-full object-contain" />
                  : <div className="flex max-w-md flex-col items-center px-8 text-center text-white"><Film size={22} className="text-white/35" /><div className="mt-3 text-[10px] font-semibold text-white/70">Media is available but is not a browser-playable video</div><div className="mt-1 text-[8px] leading-4 text-white/40">The edit desk will not substitute unrelated footage.</div></div>
              ) : (
                <div className="max-w-md px-8 text-center text-white"><Film className="mx-auto h-6 w-6 text-white/30" /><div className="mt-3 text-[10px] font-semibold text-white/70">No playable cut media yet</div><div className="mt-1 text-[8px] leading-4 text-white/40">Return to Production to finish missing shots or generate the governed timeline.</div></div>
              )}
            </div>
            <div className="border-t border-white/10 bg-black/20 px-4 py-3 text-white">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0"><div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-white/35">Playhead selection</div><div className="mt-0.5 truncate text-[10px] font-semibold text-white/80">{selectedClip?.title || "No clip selected"}</div></div>
                {selectedClip ? <div className="text-right text-[8px] tabular-nums text-white/45">{timecode(selectedClip.timeline_in_seconds)} → {timecode(selectedClip.timeline_out_seconds)} · {shortDuration(selectedClip.duration_seconds)}</div> : null}
              </div>
            </div>
          </section>

          <section className="mt-3 overflow-hidden rounded-xl border border-black/[0.07] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] px-4 py-3">
              <div><div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8A867F]">Cut timeline</div><div className="mt-0.5 text-[9px] text-[#716B63]">Real edit decisions, review markers and provider-backed shot state</div></div>
              <div className="text-[8px] text-[#918B83]">{edlClips.length ? "AVANTIQO EDL" : "SHOT CUT FALLBACK"}</div>
            </div>

            <div className="overflow-x-auto bg-[#FBFAF8] px-3 pb-3 pt-2">
              <div className="relative" style={{ minWidth: `${Math.max(780, clips.reduce((sum, clip) => sum + Math.max(68, finite(clip.duration_seconds, 0) * scale), 0))}px` }}>
                <div className="mb-1 flex h-5 items-end justify-between border-b border-black/[0.06] text-[6px] tabular-nums text-[#A09A92]">
                  {rulerMarks.map((mark) => <span key={mark}>{timecode(mark)}</span>)}
                </div>
                <div className="flex items-stretch gap-1">
                  {clips.map((clip) => {
                    const selected = selectedClip?.key === clip.key;
                    return (
                      <button
                        key={clip.key}
                        type="button"
                        onClick={() => setSelectedClipKey(clip.key)}
                        className={`relative min-h-[82px] min-w-0 overflow-hidden rounded-lg border p-2 text-left transition ${selected ? "border-[#9A6A37]/35 bg-[#F5EEE5] shadow-sm" : "border-black/[0.07] bg-white hover:border-[#9A6A37]/20"}`}
                        style={{ width: `${Math.max(68, finite(clip.duration_seconds, 0) * scale)}px` }}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[6px] font-semibold uppercase tracking-[0.08em] text-[#9A948B]">{String(clip.index).padStart(2, "0")}</span>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusDot(clip.status)}`} />
                        </div>
                        <div className="mt-2 truncate text-[8px] font-semibold text-[#49443F]">{clip.title}</div>
                        <div className="mt-1 text-[6px] tabular-nums text-[#918B83]">{shortDuration(clip.duration_seconds)}</div>
                        <div className="mt-1 flex items-center gap-1 text-[6px] text-[#A09A92]">
                          {clip.score !== null && clip.score !== undefined ? <span>QC {finite(clip.score).toFixed(0)}</span> : null}
                          {clip.selection ? <span>{clip.selection}</span> : null}
                        </div>
                        {["REVIEW", "FAILED"].includes(String(clip.status).toUpperCase()) ? <div className={`absolute bottom-0 left-0 right-0 h-1 ${clip.status === "FAILED" ? "bg-red-500" : "bg-amber-400"}`} /> : null}
                      </button>
                    );
                  })}
                  {!clips.length ? <div className="flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-black/[0.08] bg-white text-[8px] text-[#918B83]">No edit decisions exist yet.</div> : null}
                </div>
              </div>
            </div>

            <TrackLane label="Video" icon={Film} clips={clips} tasks={effectiveTasks} lane="video" scale={scale} />
            <TrackLane label="Dialogue" icon={Volume2} clips={clips} tasks={effectiveTasks} lane="voice" scale={scale} />
            <TrackLane label="Music / SFX" icon={Music2} clips={clips} tasks={effectiveTasks} lane="music" scale={scale} />
            <TrackLane label="Captions" icon={Subtitles} clips={clips} tasks={effectiveTasks} lane="subtitle" scale={scale} />
          </section>

          {timelineItems.length ? (
            <section className="mt-3 rounded-xl border border-black/[0.07] bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#918B83]">Cut versions</span>
                {timelineItems.map((item, index) => (
                  <button key={item.id} type="button" onClick={() => { setSelectedVersionId(item.id); setSelectedClipKey(null); }} className={`rounded-md border px-2.5 py-1.5 text-[7px] font-semibold ${timeline?.id === item.id ? "border-[#A37849]/20 bg-[#F5EEE5] text-[#76583A]" : "border-black/[0.07] text-[#716B63]"}`}>V{timelineItems.length - index} · {String(item.status || "CUT").replaceAll("_", " ")}</button>
                ))}
              </div>
            </section>
          ) : null}
        </main>

        <aside className="bg-white">
          <div className="border-b border-black/[0.06] px-4 py-3">
            <div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]"><ShieldCheck size={9} /> Master control</div>
            <div className="mt-1 text-[11px] font-semibold text-[#403C37]">Release readiness</div>
            <div className="mt-1 text-[8px] leading-4 text-[#918B83]">A master stays blocked until the active cut has real media and all governed holds are cleared.</div>
          </div>

          <div className={`border-b px-4 py-3 ${masterReady ? "border-emerald-700/10 bg-emerald-50/60" : "border-amber-700/10 bg-amber-50/60"}`}>
            <div className="flex items-start gap-2">
              {masterReady ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-700" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-700" />}
              <div><div className={`text-[9px] font-semibold ${masterReady ? "text-emerald-900" : "text-amber-950"}`}>{masterReady ? "Ready for master assembly" : "Master is not releasable yet"}</div><div className={`mt-1 text-[8px] leading-4 ${masterReady ? "text-emerald-800/70" : "text-amber-900/70"}`}>{masterReady ? "The active cut has no provider work, review holds, failures or missing shot media." : "Resolve the evidence below before final assembly."}</div></div>
            </div>
          </div>

          <div className="p-4">
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Failed", failedTasks.length],
                ["Review", reviewTasks.length],
                ["Running", runningTasks.length],
                ["Missing media", missingShotMedia],
                ["Missing brief beats", missingRequirements.length],
                ["Cut version", timelineItems.length ? `V${timelineItems.length - currentVersionIndex}` : timeline ? "V1" : "—"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-black/[0.06] bg-[#FBFAF8] px-3 py-2.5"><div className="text-[6px] uppercase tracking-[0.09em] text-[#9A948B]">{label}</div><div className="mt-1 text-[12px] font-semibold tabular-nums text-[#4A453F]">{value}</div></div>
              ))}
            </div>

            <div className="mt-4 border-t border-black/[0.06] pt-3">
              <div className="text-[7px] font-semibold uppercase tracking-[0.11em] text-[#918B83]">Selected edit</div>
              {selectedClip ? (
                <div className="mt-2 rounded-xl border border-black/[0.07] bg-[#FCFBF8] p-3">
                  <div className="flex items-center justify-between gap-2"><div className="truncate text-[9px] font-semibold text-[#403C37]">{selectedClip.title}</div><span className={`rounded-full border px-1.5 py-0.5 text-[6px] font-semibold ${statusClass(selectedClip.status)}`}>{selectedClip.status}</span></div>
                  <div className="mt-2 space-y-1.5 text-[7px] text-[#817B73]">
                    <div className="flex justify-between gap-3"><span>Timeline</span><span className="font-semibold tabular-nums text-[#4A453F]">{timecode(selectedClip.timeline_in_seconds)}–{timecode(selectedClip.timeline_out_seconds)}</span></div>
                    <div className="flex justify-between gap-3"><span>Source</span><span className="font-semibold tabular-nums text-[#4A453F]">{timecode(selectedClip.source_in_seconds)}–{timecode(selectedClip.source_out_seconds)}</span></div>
                    <div className="flex justify-between gap-3"><span>Quality</span><span className="font-semibold text-[#4A453F]">{selectedClip.score !== null && selectedClip.score !== undefined ? finite(selectedClip.score).toFixed(0) : "—"}</span></div>
                    <div className="flex justify-between gap-3"><span>Performance</span><span className="font-semibold text-[#4A453F]">{selectedClip.performance_verified ? "Verified" : selectedClip.kind === "EDL" ? "Not verified" : "See production QC"}</span></div>
                  </div>
                </div>
              ) : <div className="mt-2 text-[8px] leading-4 text-[#918B83]">Select a clip in the cut to inspect its exact evidence.</div>}
            </div>

            {(failedTasks.length || reviewTasks.length || runningTasks.length || missingRequirements.length || missingShotMedia) ? (
              <div className="mt-4 border-t border-black/[0.06] pt-3">
                <div className="text-[7px] font-semibold uppercase tracking-[0.11em] text-[#918B83]">What blocks release</div>
                <div className="mt-2 space-y-2">
                  {failedTasks.slice(0, 4).map((task) => <div key={task.id} className="rounded-lg border border-red-700/12 bg-red-50 p-2.5"><div className="text-[8px] font-semibold text-red-950">{task.title || task.capability || "Production failure"}</div><div className="mt-0.5 text-[7px] leading-3 text-red-900/65">{task.error || "This production step failed."}</div></div>)}
                  {reviewTasks.slice(0, 4).map((task) => <div key={task.id} className="rounded-lg border border-amber-700/12 bg-amber-50 p-2.5"><div className="text-[8px] font-semibold text-amber-950">{task.title || task.capability || "Human review required"}</div><div className="mt-0.5 text-[7px] leading-3 text-amber-900/65">Approve the real candidate in Production before release.</div></div>)}
                  {runningTasks.length ? <div className="rounded-lg border border-[#A37849]/12 bg-[#F5EEE5] p-2.5 text-[8px] text-[#76583A]">{runningTasks.length} provider step{runningTasks.length === 1 ? " is" : "s are"} still running.</div> : null}
                  {missingShotMedia ? <div className="rounded-lg border border-black/[0.07] bg-[#F8F6F2] p-2.5 text-[8px] text-[#716B63]">{missingShotMedia} production shot{missingShotMedia === 1 ? " has" : "s have"} no effective media candidate.</div> : null}
                  {missingRequirements.length ? <div className="rounded-lg border border-black/[0.07] bg-[#F8F6F2] p-2.5 text-[8px] text-[#716B63]">{missingRequirements.length} timeline requirement{missingRequirements.length === 1 ? " is" : "s are"} unresolved.</div> : null}
                </div>
              </div>
            ) : null}

            <div className="mt-4 border-t border-black/[0.06] pt-3">
              <div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#918B83]"><Sparkles size={9} /> Editorial evidence</div>
              <div className="mt-2 space-y-1.5 text-[8px] text-[#746E66]">
                <div className="flex justify-between"><span>Timeline format</span><span className="font-semibold text-[#4A453F]">{timeline?.metadata?.format || (edlClips.length ? "EDL" : "SHOT CUT")}</span></div>
                <div className="flex justify-between"><span>Distinct sources</span><span className="font-semibold text-[#4A453F]">{sourceCount}</span></div>
                <div className="flex justify-between"><span>Verified-only composition</span><span className="font-semibold text-[#4A453F]">{timeline?.metadata?.performance_verified_only === true ? "Yes" : "No"}</span></div>
                <div className="flex justify-between"><span>Human timeline approval</span><span className="font-semibold text-[#4A453F]">{timeline?.review?.approved === true ? "Approved" : "Not recorded"}</span></div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
