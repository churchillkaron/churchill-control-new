"use client";

import { useMemo, useState } from "react";

import CreativeDirectorCockpit from "../status/CreativeDirectorCockpit";
import CreativeConceptDirector from "../status/CreativeConceptDirector";
import CreativeQualityDirector from "../status/CreativeQualityDirector";
import RunProductionButton from "../actions/RunProductionButton";

function assetUrl(asset) {
  return (
    asset?.image_url ||
    asset?.thumbnail_url ||
    asset?.file_url ||
    asset?.video_url ||
    asset?.url ||
    ""
  );
}

function taskUrl(task) {
  const output = task?.output || {};
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

function isVideoValue(value = "") {
  const url = String(value || "").toLowerCase();
  return /\.(mp4|mov|m4v|webm)(\?|$)/.test(url);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function money(value) {
  if (!Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function statusTone(status = "") {
  const value = String(status || "").toUpperCase();
  if (value === "COMPLETED") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (value === "REVIEW") return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  if (value === "FAILED" || value === "SKIPPED") return "border-red-400/30 bg-red-400/10 text-red-200";
  if (value === "RUNNING") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  return "border-white/10 bg-white/[0.04] text-white/55";
}

function qualityEvidence(task = {}) {
  const candidates = [
    task.output?.validation_evidence,
    task.output?.output?.validation,
    task.output?.output?.result,
    task.output?.validation,
    task.output?.result,
  ];
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
  return finite(
    shot.duration_seconds ||
    shot.performance_contract?.duration_seconds ||
    shot.generation?.output_spec?.duration_seconds,
    0,
  );
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
      : [...new Set(shots.map((shot) => shot.scene_id).filter(Boolean))]
          .map((id, index) => ({ id, title: `Scene ${index + 1}` }));
    return sourceScenes.map((scene, index) => ({
      ...scene,
      index,
      shots: shots
        .filter((shot) => shot.scene_id === scene.id)
        .sort((a, b) => finite(a.shot_number) - finite(b.shot_number)),
    }));
  }, [scenes, shots]);

  const selectedShot =
    shots.find((shot) => shot.id === selectedShotId) ||
    shots[0] ||
    null;
  const selectedTasks = selectedShot ? taskMap.get(selectedShot.id) || [] : [];
  const selectedPreviewTask = [...selectedTasks]
    .reverse()
    .find((task) => taskUrl(task));
  const selectedAsset = assets.find((asset) =>
    asset.shot_id === selectedShot?.id ||
    asset.metadata?.shot_id === selectedShot?.id,
  ) || assets[0] || null;
  const previewUrl = taskUrl(selectedPreviewTask) || assetUrl(selectedAsset);
  const previewIsVideo = isVideoValue(previewUrl) ||
    selectedAsset?.asset_type?.toLowerCase?.().includes("video");

  const reviews = tasks.filter((task) => task.status === "REVIEW");
  const failed = tasks.filter((task) => ["FAILED", "SKIPPED"].includes(task.status));
  const running = tasks.filter((task) => task.status === "RUNNING");
  const completed = tasks.filter((task) => task.status === "COMPLETED");
  const lipSyncReviews = reviews.filter((task) =>
    String(task.metadata?.contract || "").includes("LIPSYNC_VALIDATION"),
  );
  const totalRuntime = shots.reduce((sum, shot) => sum + shotDuration(shot), 0);
  const estimatedCost = tasks.reduce(
    (sum, task) => sum + finite(task.cost?.actual ?? task.cost?.estimated, 0),
    0,
  );
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
          notes: "Approved in Creative Studio production cockpit after human review.",
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Approval failed");
      }
      await runtime.refresh?.();
    } catch (error) {
      setApprovalError(error.message || "Approval failed");
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <div className="h-full overflow-auto bg-[#050505] text-white">
      <CreativeDirectorCockpit runtime={runtime} />
      <CreativeConceptDirector runtime={runtime} />
      <CreativeQualityDirector runtime={runtime} />

      <header className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(200,169,106,0.08),transparent_34%)] px-7 py-7 lg:px-9">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.34em] text-[#c8a96a]">
              Film Production · World-Class Control Room
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {project?.name || production?.title || "Production"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
              Every shot must earn its place in the film. Provider completion is not approval: identity,
              performance, lip-sync, continuity, pacing and final perceptual quality remain gated until review.
            </p>
          </div>
          <RunProductionButton runtime={runtime} />
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-3 xl:grid-cols-7">
          {[
            ["Runtime", totalRuntime ? `${totalRuntime.toFixed(1)}s` : "—"],
            ["Scenes", sceneRows.length],
            ["Shots", shots.length],
            ["Running", running.length],
            ["Review", reviews.length],
            ["Failed", failed.length],
            ["Cost", estimatedCost ? money(estimatedCost) : "—"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/28">{label}</div>
              <div className="mt-1.5 text-xl font-medium text-white/88">{value}</div>
            </div>
          ))}
        </div>

        {mechanicalCadence && (
          <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] px-4 py-3 text-sm text-amber-100/90">
            Pacing warning: {nearFiveSecondShots} of {shots.length} shots are approximately five seconds.
            The Director should re-cut this sequence into intentional impact cuts, story beats and held moments before release.
          </div>
        )}
      </header>

      <div className="grid min-h-[720px] xl:grid-cols-[360px_minmax(0,1fr)_320px]">
        <aside className="border-r border-white/8 bg-[#070707] p-4">
          <div className="mb-4 flex items-center justify-between px-2">
            <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">Scene / Shot Plan</div>
            <div className="text-xs text-white/25">{completed.length}/{tasks.length} tasks</div>
          </div>

          <div className="space-y-5">
            {sceneRows.map((scene) => {
              const sceneDuration = scene.shots.reduce((sum, shot) => sum + shotDuration(shot), 0);
              return (
                <section key={scene.id || scene.index}>
                  <div className="mb-2 flex items-center justify-between px-2">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[#c8a96a]/80">
                        Scene {scene.index + 1}
                      </div>
                      <div className="truncate text-sm text-white/72">{scene.title || scene.name || "Untitled scene"}</div>
                    </div>
                    <div className="text-xs text-white/28">{sceneDuration.toFixed(1)}s</div>
                  </div>

                  <div className="space-y-1.5">
                    {scene.shots.map((shot, shotIndex) => {
                      const shotTasks = taskMap.get(shot.id) || [];
                      const state =
                        shotTasks.find((task) => task.status === "FAILED")?.status ||
                        shotTasks.find((task) => task.status === "REVIEW")?.status ||
                        shotTasks.find((task) => task.status === "RUNNING")?.status ||
                        (shotTasks.length && shotTasks.every((task) => task.status === "COMPLETED") ? "COMPLETED" : "WAITING");
                      const duration = shotDuration(shot);
                      return (
                        <button
                          key={shot.id}
                          type="button"
                          onClick={() => setSelectedShotId(shot.id)}
                          className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                            selectedShot?.id === shot.id
                              ? "border-[#c8a96a]/45 bg-[#c8a96a]/[0.08]"
                              : "border-white/7 bg-white/[0.018] hover:border-white/15 hover:bg-white/[0.035]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-medium text-white/72">Shot {shot.shot_number || shotIndex + 1}</div>
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.13em] ${statusTone(state)}`}>
                              {state}
                            </span>
                          </div>
                          <div className="mt-2 line-clamp-2 text-xs leading-5 text-white/44">
                            {shot.purpose || shot.subject || shot.description || shot.action || "Purpose unresolved"}
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px] text-white/27">
                            <span>{duration ? `${duration.toFixed(1)}s` : "No duration"}</span>
                            <span>{pacingLabel(duration)}</span>
                          </div>
                        </button>
                      );
                    })}
                    {!scene.shots.length && (
                      <div className="rounded-xl border border-dashed border-white/8 p-4 text-xs text-white/25">No shots</div>
                    )}
                  </div>
                </section>
              );
            })}

            {!shots.length && (
              <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-white/30">
                Storyboard shots have not been materialized into Production yet.
              </div>
            )}
          </div>
        </aside>

        <main className="min-w-0 border-r border-white/8 p-5 lg:p-7">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/30">Selected shot</div>
              <div className="mt-1 text-xl font-medium">
                {selectedShot?.title || selectedShot?.purpose || selectedShot?.subject || "Select a shot"}
              </div>
            </div>
            {selectedShot && (
              <div className="text-right text-xs text-white/35">
                <div>{shotDuration(selectedShot).toFixed(1)} seconds</div>
                <div className="mt-1">{pacingLabel(shotDuration(selectedShot))}</div>
              </div>
            )}
          </div>

          <div className="flex min-h-[430px] items-center justify-center overflow-hidden rounded-2xl border border-white/9 bg-black shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
            {previewUrl ? (
              previewIsVideo ? (
                <video src={previewUrl} controls className="max-h-[620px] w-full object-contain" />
              ) : (
                <img src={previewUrl} alt="Selected production asset" className="max-h-[620px] w-full object-contain" />
              )
            ) : (
              <div className="px-8 text-center">
                <div className="text-sm text-white/35">No generated candidate yet</div>
                <div className="mt-2 text-xs leading-5 text-white/20">
                  Production remains empty until this shot has a provider result. Studio will not substitute unrelated footage.
                </div>
              </div>
            )}
          </div>

          {selectedShot && (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/8 bg-white/[0.022] p-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/28">Story purpose</div>
                <div className="mt-2 text-sm leading-6 text-white/58">
                  {selectedShot.purpose || selectedShot.action || selectedShot.description || "Not defined"}
                </div>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.022] p-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/28">Performance / continuity</div>
                <div className="mt-2 text-sm leading-6 text-white/58">
                  {selectedShot.performance || selectedShot.performance_direction?.description || selectedShot.continuity?.notes || "Not defined"}
                </div>
              </div>
            </div>
          )}

          <div className="mt-6">
            <div className="mb-3 text-[10px] uppercase tracking-[0.25em] text-white/30">Production chain</div>
            <div className="space-y-2">
              {selectedTasks.map((task) => {
                const evidence = qualityEvidence(task);
                const score = evidence.total_score ?? evidence.overall_score ?? evidence.sync_score ?? null;
                return (
                  <div key={task.id} className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm text-white/72">{taskLabel(task)}</div>
                        <div className="mt-1 text-[10px] text-white/30">
                          {[task.provider_id || task.output?.provider, task.output?.model || task.metadata?.model]
                            .filter(Boolean)
                            .join(" · ") || "Provider pending"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {score !== null && score !== undefined && (
                          <span className="text-xs text-[#d9c08a]">QC {Number(score).toFixed(0)}</span>
                        )}
                        <span className={`rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.13em] ${statusTone(task.status)}`}>
                          {task.status}
                        </span>
                      </div>
                    </div>
                    {task.error && <div className="mt-2 text-xs text-red-200/75">{task.error}</div>}
                  </div>
                );
              })}
              {selectedShot && !selectedTasks.length && (
                <div className="rounded-xl border border-dashed border-white/8 p-4 text-xs text-white/28">
                  No production tasks have been materialized for this shot yet.
                </div>
              )}
            </div>
          </div>
        </main>

        <aside className="bg-[#070707] p-5">
          <div className="text-[10px] uppercase tracking-[0.28em] text-[#c8a96a]">Release Gates</div>
          <div className="mt-2 text-sm leading-6 text-white/45">
            Nothing enters the final edit merely because generation finished.
          </div>

          <div className="mt-5 space-y-3">
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/55">Human reviews</span>
                <span className="text-amber-100">{reviews.length}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-white/30">
                <span>Lip-sync holds</span>
                <span>{lipSyncReviews.length}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-white/30">
                <span>Production failures</span>
                <span>{failed.length}</span>
              </div>
            </div>

            {reviews.map((task) => {
              const evidence = qualityEvidence(task);
              const humanOnly = task.metadata?.human_only_validation_required === true;
              return (
                <div key={task.id} className="rounded-xl border border-amber-300/20 bg-amber-300/[0.045] p-4">
                  <div className="text-sm font-medium text-amber-50">{taskLabel(task)}</div>
                  <div className="mt-1 text-xs leading-5 text-white/35">
                    {humanOnly
                      ? "No trusted automated sync score is available. Inspect the actual speaking performance before approval."
                      : "Automated validation passed. Human release approval is still required."}
                  </div>
                  {evidence.sync_score !== undefined && (
                    <div className="mt-2 text-xs text-white/45">Sync {evidence.sync_score} · Identity {evidence.identity_score ?? "—"} · Performance {evidence.performance_score ?? "—"}</div>
                  )}
                  <button
                    type="button"
                    onClick={() => approveTask(task)}
                    disabled={approvingId === task.id}
                    className="mt-3 w-full rounded-lg border border-[#c8a96a]/35 bg-[#c8a96a]/10 px-3 py-2 text-xs font-medium text-[#dfc88f] transition hover:bg-[#c8a96a]/15 disabled:opacity-40"
                  >
                    {approvingId === task.id ? "Approving…" : "Approve after inspection"}
                  </button>
                </div>
              );
            })}

            {!reviews.length && (
              <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.035] p-4 text-xs leading-5 text-emerald-100/65">
                No human review holds right now.
              </div>
            )}

            {approvalError && (
              <div className="rounded-xl border border-red-400/20 bg-red-400/[0.05] p-3 text-xs text-red-200/80">
                {approvalError}
              </div>
            )}
          </div>

          <div className="mt-7 border-t border-white/8 pt-5">
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/28">World-class policy</div>
            <div className="mt-3 space-y-2 text-xs leading-5 text-white/34">
              <div>• Identity-critical speaking shots require approved identity references.</div>
              <div>• Visible speech uses exact audio segments, not full-track approximation.</div>
              <div>• Premium lip-sync targets 96 sync / 96 identity / 92 performance when trusted scoring exists.</div>
              <div>• Provider output remains a candidate until review and final perceptual QC.</div>
              <div>• Mechanical five-second cadence is surfaced before edit approval.</div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}