"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, Film, ShieldCheck } from "lucide-react";

import RunProductionButton from "../actions/RunProductionButton";

function assetUrl(asset) {
  return asset?.image_url || asset?.thumbnail_url || asset?.file_url || asset?.video_url || asset?.url || "";
}

function taskUrl(task) {
  const output = task?.output || {};
  return output.file_url || output.video_url || output.url || output.output?.video_url || output.output?.file_url || output.output?.url || output.output?.result || output.provider_poll?.output || "";
}

function isVideoValue(value = "") {
  return /\.(mp4|mov|m4v|webm)(\?|$)/.test(String(value || "").toLowerCase());
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function money(value) {
  if (!Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusTone(status = "") {
  const value = String(status || "").toUpperCase();
  if (value === "COMPLETED") return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (value === "REVIEW") return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (value === "FAILED" || value === "SKIPPED") return "border-red-700/15 bg-red-50 text-red-800";
  if (value === "RUNNING") return "border-[#8A633C]/15 bg-[#F5EEE5] text-[#76583A]";
  return "border-black/[0.08] bg-[#F6F4F0] text-[#746E66]";
}

function qualityEvidence(task = {}) {
  const candidates = [task.output?.validation_evidence, task.output?.output?.validation, task.output?.output?.result, task.output?.validation, task.output?.result];
  return candidates.find((item) => item && typeof item === "object") || {};
}

function taskLabel(task = {}) {
  const contract = String(task.metadata?.contract || "").toUpperCase();
  if (contract.includes("LIPSYNC_VALIDATION")) return "Lip-sync QC";
  if (contract.includes("LIPSYNC")) return "Lip-sync";
  if (contract.includes("MOTION_PLATE")) return "Performance plate";
  if (contract.includes("PERCEPTUAL")) return "Visual QC";
  return task.title || task.capability || task.service_code || task.type || "Production task";
}

function shotDuration(shot = {}) {
  return finite(shot.duration_seconds || shot.performance_contract?.duration_seconds || shot.generation?.output_spec?.duration_seconds, 0);
}

function pacingLabel(duration) {
  if (duration <= 0) return "Unresolved";
  if (duration < 2.25) return "Impact cut";
  if (duration < 5) return "Editorial beat";
  if (duration < 8) return "Story beat";
  return "Held sequence";
}

export default function ProductionWorkspace({ runtime }) {
  const production = runtime.productionRuntime?.current;
  const project = runtime.projectRuntime?.current;
  const tasks = runtime.taskRuntime?.items || [];
  const assets = runtime.assetRuntime?.items || [];
  const scenes = runtime.sceneRuntime?.items || [];
  const shots = runtime.shotRuntime?.items || [];
  const [selectedShotId, setSelectedShotId] = useState(shots[0]?.id || null);
  const [approvingId, setApprovingId] = useState(null);
  const [approvalError, setApprovalError] = useState("");

  const taskMap = useMemo(() => {
    const map = new Map();
    for (const task of tasks) {
      const key = task.shot_id || task.metadata?.shot_id || null;
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(task);
    }
    return map;
  }, [tasks]);

  const sceneRows = useMemo(() => {
    const sourceScenes = scenes.length
      ? scenes
      : [...new Set(shots.map((shot) => shot.scene_id).filter(Boolean))].map((id, index) => ({ id, title: `Scene ${index + 1}` }));
    return sourceScenes.map((scene, index) => ({
      ...scene,
      index,
      shots: shots.filter((shot) => shot.scene_id === scene.id).sort((a, b) => finite(a.shot_number) - finite(b.shot_number)),
    }));
  }, [scenes, shots]);

  const selectedShot = shots.find((shot) => shot.id === selectedShotId) || shots[0] || null;
  const selectedTasks = selectedShot ? taskMap.get(selectedShot.id) || [] : [];
  const selectedPreviewTask = [...selectedTasks].reverse().find((task) => taskUrl(task));
  const selectedAsset = assets.find((asset) => asset.shot_id === selectedShot?.id || asset.metadata?.shot_id === selectedShot?.id) || assets[0] || null;
  const previewUrl = taskUrl(selectedPreviewTask) || assetUrl(selectedAsset);
  const previewIsVideo = isVideoValue(previewUrl) || selectedAsset?.asset_type?.toLowerCase?.().includes("video");

  const reviews = tasks.filter((task) => task.status === "REVIEW");
  const failed = tasks.filter((task) => ["FAILED", "SKIPPED"].includes(task.status));
  const running = tasks.filter((task) => task.status === "RUNNING");
  const completed = tasks.filter((task) => task.status === "COMPLETED");
  const lipSyncReviews = reviews.filter((task) => String(task.metadata?.contract || "").includes("LIPSYNC_VALIDATION"));
  const totalRuntime = shots.reduce((sum, shot) => sum + shotDuration(shot), 0);
  const estimatedCost = tasks.reduce((sum, task) => sum + finite(task.cost?.actual ?? task.cost?.estimated, 0), 0);
  const nearFiveSecondShots = shots.filter((shot) => {
    const duration = shotDuration(shot);
    return duration >= 4.5 && duration <= 5.5;
  }).length;
  const mechanicalCadence = shots.length >= 6 && nearFiveSecondShots / shots.length >= 0.65;

  async function approveTask(task) {
    setApprovingId(task.id);
    setApprovalError("");
    try {
      const response = await fetch("/api/creative/production/review/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          task_id: task.id,
          notes: "Approved in Video Studio after human review.",
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.error || "Approval failed");
      runtime.refresh?.();
    } catch (error) {
      setApprovalError(error.message || "Approval failed");
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <div className="h-full overflow-auto bg-[#F6F3EE] text-[#2A2723]">
      <div className="sticky top-0 z-20 border-b border-black/[0.07] bg-[#F6F3EE]/95 px-4 py-3 backdrop-blur-sm lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[7px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">Production desk</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="truncate text-[15px] font-semibold tracking-[-0.02em]">{project?.name || production?.title || "Production"}</h2>
              <span className="text-[8px] text-[#817B73]">{totalRuntime ? `${totalRuntime.toFixed(1)}s` : "No runtime"} · {sceneRows.length} scenes · {shots.length} shots</span>
              {running.length ? <span className="rounded-full border border-[#A37849]/15 bg-[#F5EEE5] px-2 py-1 text-[7px] font-semibold text-[#76583A]">{running.length} running</span> : null}
              {reviews.length ? <span className="rounded-full border border-amber-700/15 bg-amber-50 px-2 py-1 text-[7px] font-semibold text-amber-800">{reviews.length} review</span> : null}
              {failed.length ? <span className="rounded-full border border-red-700/15 bg-red-50 px-2 py-1 text-[7px] font-semibold text-red-800">{failed.length} blocked</span> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/workspace/${runtime.organizationId}/creative/studio/production`} className="hidden h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[8px] font-semibold text-[#716B63] md:inline-flex">
              Plan & approvals <ArrowRight size={9} />
            </Link>
            <RunProductionButton runtime={runtime} />
          </div>
        </div>
        {mechanicalCadence ? (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-700/15 bg-amber-50 px-3 py-2 text-[8px] text-amber-900">
            <CircleAlert size={10} /> Pacing needs attention: {nearFiveSecondShots} of {shots.length} shots sit near five seconds.
          </div>
        ) : null}
      </div>

      <div className="grid min-h-[650px] xl:grid-cols-[300px_minmax(0,1fr)_300px]">
        <aside className="border-r border-black/[0.07] bg-white">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
            <div>
              <div className="text-[7px] font-semibold uppercase tracking-[0.13em] text-[#8A867F]">Shot navigator</div>
              <div className="mt-0.5 text-[9px] font-semibold text-[#4A453F]">Scenes & shots</div>
            </div>
            <div className="text-[8px] tabular-nums text-[#918B83]">{completed.length}/{tasks.length} tasks</div>
          </div>

          <div className="max-h-[calc(100vh-360px)] overflow-y-auto py-2">
            {sceneRows.map((scene) => {
              const sceneDuration = scene.shots.reduce((sum, shot) => sum + shotDuration(shot), 0);
              return (
                <section key={scene.id || scene.index} className="border-b border-black/[0.05] py-2 last:border-0">
                  <div className="flex items-center justify-between px-4 py-1.5">
                    <div className="min-w-0">
                      <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]">Scene {scene.index + 1}</div>
                      <div className="mt-0.5 truncate text-[9px] font-semibold text-[#4A453F]">{scene.title || scene.name || "Untitled scene"}</div>
                    </div>
                    <div className="text-[8px] tabular-nums text-[#918B83]">{sceneDuration.toFixed(1)}s</div>
                  </div>

                  <div className="mt-1">
                    {scene.shots.map((shot, shotIndex) => {
                      const shotTasks = taskMap.get(shot.id) || [];
                      const state =
                        shotTasks.find((task) => task.status === "FAILED")?.status ||
                        shotTasks.find((task) => task.status === "REVIEW")?.status ||
                        shotTasks.find((task) => task.status === "RUNNING")?.status ||
                        (shotTasks.length && shotTasks.every((task) => task.status === "COMPLETED") ? "COMPLETED" : "WAITING");
                      const duration = shotDuration(shot);
                      const selected = selectedShot?.id === shot.id;
                      return (
                        <button
                          key={shot.id}
                          type="button"
                          onClick={() => setSelectedShotId(shot.id)}
                          className={`grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 border-l-2 px-3 py-2 text-left transition ${selected ? "border-[#A37849] bg-[#FBF8F3]" : "border-transparent hover:bg-[#FCFAF6]"}`}
                        >
                          <div className="text-[8px] font-semibold tabular-nums text-[#9A948B]">{String(shot.shot_number || shotIndex + 1).padStart(2, "0")}</div>
                          <div className="min-w-0">
                            <div className="truncate text-[9px] font-semibold text-[#4A453F]">{shot.title || shot.purpose || shot.subject || "Untitled shot"}</div>
                            <div className="mt-0.5 truncate text-[7px] text-[#918B83]">{duration ? `${duration.toFixed(1)}s` : "No duration"} · {pacingLabel(duration)}</div>
                          </div>
                          <span className={`rounded-full border px-1.5 py-0.5 text-[6px] font-semibold uppercase ${statusTone(state)}`}>{state}</span>
                        </button>
                      );
                    })}
                    {!scene.shots.length ? <div className="px-4 py-3 text-[8px] text-[#A09A92]">No shots in this scene.</div> : null}
                  </div>
                </section>
              );
            })}
            {!shots.length ? <div className="p-6 text-center text-[9px] leading-4 text-[#918B83]">Storyboard shots have not been materialized into Production yet.</div> : null}
          </div>
        </aside>

        <main className="min-w-0 bg-[#F6F3EE] p-4 lg:p-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[7px] font-semibold uppercase tracking-[0.13em] text-[#8A867F]">Viewer</div>
              <div className="mt-0.5 truncate text-[13px] font-semibold tracking-[-0.01em] text-[#3E3934]">{selectedShot?.title || selectedShot?.purpose || selectedShot?.subject || "Select a shot"}</div>
            </div>
            {selectedShot ? <div className="text-right text-[8px] text-[#817B73]">{shotDuration(selectedShot).toFixed(1)}s · {pacingLabel(shotDuration(selectedShot))}</div> : null}
          </div>

          <div className="flex min-h-[390px] items-center justify-center overflow-hidden rounded-xl border border-black/[0.08] bg-[#22201D] shadow-sm">
            {previewUrl ? (
              previewIsVideo ? (
                <video src={previewUrl} controls className="max-h-[600px] w-full object-contain" />
              ) : (
                <img src={previewUrl} alt="Selected production asset" className="max-h-[600px] w-full object-contain" />
              )
            ) : (
              <div className="max-w-sm px-8 text-center text-white">
                <Film className="mx-auto h-5 w-5 text-white/35" />
                <div className="mt-3 text-[10px] font-semibold text-white/70">No candidate yet</div>
                <div className="mt-1 text-[8px] leading-4 text-white/40">Run production for this project. The viewer stays empty rather than substituting unrelated footage.</div>
              </div>
            )}
          </div>

          {selectedShot ? (
            <div className="mt-3 grid border-y border-black/[0.06] bg-white md:grid-cols-2 md:divide-x md:divide-black/[0.06]">
              <div className="px-4 py-3">
                <div className="text-[7px] font-semibold uppercase tracking-[0.11em] text-[#918B83]">Story purpose</div>
                <div className="mt-1 text-[9px] leading-4 text-[#625C55]">{selectedShot.purpose || selectedShot.action || selectedShot.description || "Not defined"}</div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[7px] font-semibold uppercase tracking-[0.11em] text-[#918B83]">Performance / continuity</div>
                <div className="mt-1 text-[9px] leading-4 text-[#625C55]">{selectedShot.performance || selectedShot.performance_direction?.description || selectedShot.continuity?.notes || "Not defined"}</div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 overflow-hidden rounded-xl border border-black/[0.07] bg-white">
            <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
              <div>
                <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8A867F]">Production chain</div>
                <div className="mt-0.5 text-[9px] text-[#716B63]">Generation, validation and finishing for the selected shot</div>
              </div>
              <div className="text-[8px] text-[#918B83]">{selectedTasks.length} steps</div>
            </div>
            <div className="divide-y divide-black/[0.055]">
              {selectedTasks.map((task) => {
                const evidence = qualityEvidence(task);
                const score = evidence.total_score ?? evidence.overall_score ?? evidence.sync_score ?? null;
                return (
                  <div key={task.id} className="grid gap-2 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="truncate text-[9px] font-semibold text-[#4A453F]">{taskLabel(task)}</div>
                      <div className="mt-0.5 truncate text-[7px] text-[#9A948B]">{[task.provider_id || task.output?.provider, task.output?.model || task.metadata?.model].filter(Boolean).join(" · ") || "Provider pending"}</div>
                      {task.error ? <div className="mt-1 text-[8px] text-red-700">{task.error}</div> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {score !== null && score !== undefined ? <span className="text-[8px] font-semibold text-[#76583A]">QC {Number(score).toFixed(0)}</span> : null}
                      <span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase ${statusTone(task.status)}`}>{task.status}</span>
                    </div>
                  </div>
                );
              })}
              {selectedShot && !selectedTasks.length ? <div className="px-4 py-4 text-[8px] text-[#918B83]">No production tasks have been materialized for this shot yet.</div> : null}
            </div>
          </div>
        </main>

        <aside className="border-l border-black/[0.07] bg-white">
          <div className="border-b border-black/[0.06] px-4 py-3">
            <div className="flex items-center gap-2 text-[7px] font-semibold uppercase tracking-[0.13em] text-[#8A633C]"><ShieldCheck size={9} /> Release control</div>
            <div className="mt-1 text-[10px] font-semibold text-[#403C37]">Review before delivery</div>
            <div className="mt-1 text-[8px] leading-4 text-[#918B83]">Generated is not approved. Only exceptions and decisions that need a person appear here.</div>
          </div>

          <div className="grid grid-cols-3 border-b border-black/[0.06] bg-[#FCFBF8]">
            {[["Review", reviews.length], ["Lip-sync", lipSyncReviews.length], ["Failed", failed.length]].map(([label, value]) => (
              <div key={label} className="border-r border-black/[0.055] px-3 py-3 last:border-r-0">
                <div className="text-[7px] uppercase tracking-[0.09em] text-[#918B83]">{label}</div>
                <div className="mt-1 text-[13px] font-semibold tabular-nums text-[#403C37]">{value}</div>
              </div>
            ))}
          </div>

          <div className="max-h-[calc(100vh-410px)] overflow-y-auto p-3">
            {reviews.map((task) => {
              const evidence = qualityEvidence(task);
              const humanOnly = task.metadata?.human_only_validation_required === true;
              return (
                <div key={task.id} className="mb-2 rounded-xl border border-amber-700/15 bg-amber-50 p-3">
                  <div className="text-[9px] font-semibold text-amber-950">{taskLabel(task)}</div>
                  <div className="mt-1 text-[8px] leading-4 text-amber-900/70">{humanOnly ? "Inspect the real speaking performance; trusted automated sync evidence is unavailable." : "Automated validation passed. Human release approval is still required."}</div>
                  {evidence.sync_score !== undefined ? <div className="mt-2 text-[7px] text-amber-900/60">Sync {evidence.sync_score} · Identity {evidence.identity_score ?? "—"} · Performance {evidence.performance_score ?? "—"}</div> : null}
                  <button type="button" onClick={() => approveTask(task)} disabled={approvingId === task.id} className="mt-2 inline-flex h-7 w-full items-center justify-center gap-1 rounded-lg bg-[#25231F] px-2 text-[8px] font-semibold text-white disabled:opacity-40">
                    {approvingId === task.id ? "Approving…" : "Approve after inspection"}
                  </button>
                </div>
              );
            })}

            {!reviews.length ? (
              <div className="flex items-start gap-2 rounded-xl border border-emerald-700/10 bg-emerald-50/60 p-3 text-[8px] leading-4 text-emerald-800">
                <CheckCircle2 size={10} className="mt-0.5 shrink-0" /> No human review holds right now.
              </div>
            ) : null}

            {approvalError ? <div className="mt-2 rounded-lg border border-red-700/15 bg-red-50 p-2.5 text-[8px] text-red-800">{approvalError}</div> : null}

            <div className="mt-4 border-t border-black/[0.06] pt-3">
              <div className="text-[7px] font-semibold uppercase tracking-[0.11em] text-[#918B83]">Production state</div>
              <div className="mt-2 space-y-1.5 text-[8px] text-[#746E66]">
                <div className="flex justify-between"><span>Completed tasks</span><span className="font-semibold text-[#4A453F]">{completed.length}</span></div>
                <div className="flex justify-between"><span>Estimated cost</span><span className="font-semibold text-[#4A453F]">{estimatedCost ? money(estimatedCost) : "—"}</span></div>
                <div className="flex justify-between"><span>Assets</span><span className="font-semibold text-[#4A453F]">{assets.length}</span></div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
