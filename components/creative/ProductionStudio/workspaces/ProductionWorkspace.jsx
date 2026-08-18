"use client";

import { useEffect, useMemo, useState } from "react";

import CreativeDirectorCockpit from "../status/CreativeDirectorCockpit";
import CreativeConceptDirector from "../status/CreativeConceptDirector";
import CreativeQualityDirector from "../status/CreativeQualityDirector";
import {
  creativeVideoQualityFromProject,
} from "@/lib/creative/video/runtime/CreativeVideoQualityPreferenceRuntime";

function assetUrl(asset) {
  return (
    asset?.image_url ||
    asset?.thumbnail_url ||
    asset?.file_url ||
    asset?.url ||
    ""
  );
}

function isVideo(asset) {
  const url = assetUrl(asset).toLowerCase();
  return (
    asset?.asset_type?.toLowerCase?.().includes("video") ||
    url.includes(".mp4") ||
    url.includes(".mov") ||
    url.includes(".webm")
  );
}

function generationQualityLocked(project = {}) {
  const metadata = project?.metadata || {};
  const approval =
    metadata.paid_generation_approval ||
    metadata.generation_approval ||
    metadata.media_generation_authorization ||
    {};
  return approval.approved === true ||
    approval.media_generation_authorized === true ||
    metadata.production_authorized === true ||
    metadata.media_generation_authorized === true;
}

function configuredQualityOptions(configuration = {}) {
  const auto = configuration.auto_option || null;
  const manual = Array.isArray(configuration.resolution_options)
    ? configuration.resolution_options
    : [];
  return [auto, ...manual]
    .filter((option) => option?.id)
    .map((option) => ({
      id: String(option.id),
      label: option.label || String(option.id),
      short_label: option.short_label || String(option.id),
      description: option.description || "",
    }));
}

function money(value, currency) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  })} ${currency || ""}`.trim();
}

function approvalBlockerLabel(reason) {
  const labels = {
    CREATIVE_VIDEO_PRODUCTION_DOSSIER_REQUIRED:
      "Production dossier is required before generation approval.",
    CREATIVE_VIDEO_PRODUCTION_DOSSIER_NOT_PASSED:
      "Production dossier must pass its production gate first.",
    CREATIVE_VIDEO_PRODUCTION_DOSSIER_APPROVAL_REQUIRED:
      "Production dossier needs human approval first.",
    CREATIVE_VIDEO_EXISTING_AUTHORIZATION_PREFLIGHT_MISMATCH:
      "An older generation authorization no longer matches this preflight.",
  };
  if (labels[reason]) return labels[reason];
  if (String(reason || "").startsWith("CREATIVE_VIDEO_APPROVAL_TASK_STATUS_INVALID:")) {
    return `Task is not waiting for approval (${String(reason).split(":").pop()}).`;
  }
  return String(reason || "Generation approval is blocked.");
}

export default function ProductionWorkspace({
  runtime,
}) {
  const production = runtime.productionRuntime?.current;
  const project = runtime.projectRuntime?.current;
  const tasks = runtime.taskRuntime?.items || [];
  const assets = runtime.assetRuntime?.items || [];
  const selectedAsset = assets[0] || null;
  const previewUrl = assetUrl(selectedAsset);

  const persistedQuality = useMemo(
    () => creativeVideoQualityFromProject(project || {}),
    [project],
  );
  const [videoQuality, setVideoQuality] = useState(persistedQuality);
  const [qualityConfiguration, setQualityConfiguration] = useState(null);
  const [qualitySaving, setQualitySaving] = useState(false);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityError, setQualityError] = useState("");
  const [qualityServerLocked, setQualityServerLocked] = useState(false);
  const [generationInspections, setGenerationInspections] = useState([]);
  const [generationLoading, setGenerationLoading] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [approvingTaskId, setApprovingTaskId] = useState(null);
  const [approvalRevision, setApprovalRevision] = useState(0);

  useEffect(() => {
    setVideoQuality(persistedQuality);
  }, [persistedQuality]);

  useEffect(() => {
    let cancelled = false;

    async function loadQualityConfiguration() {
      if (!project?.id || !runtime.organizationId) {
        setQualityConfiguration(null);
        setQualityServerLocked(false);
        return;
      }

      setQualityLoading(true);
      setQualityError("");
      try {
        const params = new URLSearchParams({
          organization_id: runtime.organizationId,
          creative_project_id: project.id,
        });
        const response = await fetch(
          `/api/creative/projects/video-quality?${params.toString()}`,
          { cache: "no-store" },
        );
        const result = await response.json();
        if (!response.ok || !result.configuration) {
          throw new Error(result.error || "Video quality configuration unavailable");
        }
        if (!cancelled) {
          setQualityConfiguration(result.configuration);
          setVideoQuality(result.selection || persistedQuality);
          setQualityServerLocked(result.locked === true);
        }
      } catch (error) {
        if (!cancelled) {
          setQualityConfiguration(null);
          setQualityServerLocked(false);
          setQualityError(error?.message || "Video quality configuration unavailable");
        }
      } finally {
        if (!cancelled) setQualityLoading(false);
      }
    }

    loadQualityConfiguration();
    return () => {
      cancelled = true;
    };
  }, [project?.id, runtime.organizationId, persistedQuality, approvalRevision]);

  useEffect(() => {
    let cancelled = false;

    async function loadGenerationPreflights() {
      if (!project?.id || !runtime.organizationId) {
        setGenerationInspections([]);
        return;
      }

      setGenerationLoading(true);
      setGenerationError("");
      try {
        const params = new URLSearchParams({
          organization_id: runtime.organizationId,
          creative_project_id: project.id,
        });
        const response = await fetch(
          `/api/creative/projects/video-generation-approval?${params.toString()}`,
          { cache: "no-store" },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Generation preflight unavailable");
        }
        if (!cancelled) {
          setGenerationInspections(
            Array.isArray(result.inspections) ? result.inspections : [],
          );
        }
      } catch (error) {
        if (!cancelled) {
          setGenerationInspections([]);
          setGenerationError(error?.message || "Generation preflight unavailable");
        }
      } finally {
        if (!cancelled) setGenerationLoading(false);
      }
    }

    loadGenerationPreflights();
    return () => {
      cancelled = true;
    };
  }, [project?.id, runtime.organizationId, videoQuality, approvalRevision]);

  const qualityLocked =
    qualityServerLocked || generationQualityLocked(project || {});
  const qualityOptions = useMemo(
    () => configuredQualityOptions(qualityConfiguration || {}),
    [qualityConfiguration],
  );

  async function selectVideoQuality(nextQuality) {
    if (!project?.id || !runtime.organizationId || qualityLocked || qualitySaving) {
      return;
    }
    if (nextQuality === videoQuality) return;

    const previous = videoQuality;
    setVideoQuality(nextQuality);
    setQualitySaving(true);
    setQualityError("");

    try {
      const response = await fetch("/api/creative/projects/video-quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          creative_project_id: project.id,
          quality: nextQuality,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.project) {
        throw new Error(result.detail || result.error || "Video quality update failed");
      }
      setVideoQuality(result.quality?.preference || nextQuality);
      if (result.configuration) {
        setQualityConfiguration(result.configuration);
      }
      setApprovalRevision((value) => value + 1);
      runtime.refresh?.();
    } catch (error) {
      setVideoQuality(previous);
      setQualityError(error?.message || "Video quality update failed");
    } finally {
      setQualitySaving(false);
    }
  }

  async function approveGeneration(inspection) {
    const taskId = inspection?.task?.id;
    const preflightSha256 = inspection?.preflight?.preflight_sha256;
    if (!taskId || !preflightSha256 || !runtime.organizationId || approvingTaskId) {
      return;
    }

    setApprovingTaskId(taskId);
    setGenerationError("");
    try {
      const response = await fetch(
        "/api/creative/projects/video-generation-approval",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organization_id: runtime.organizationId,
            task_id: taskId,
            preflight_sha256: preflightSha256,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok || result.approved !== true) {
        throw new Error(result.error || "Generation approval failed");
      }
      setQualityServerLocked(true);
      setApprovalRevision((value) => value + 1);
      runtime.refresh?.();
    } catch (error) {
      setGenerationError(error?.message || "Generation approval failed");
    } finally {
      setApprovingTaskId(null);
    }
  }

  return (
    <div className="h-full overflow-auto">
      <CreativeDirectorCockpit runtime={runtime} />
      <CreativeConceptDirector runtime={runtime} />
      <CreativeQualityDirector runtime={runtime} />

      <div className="border-b border-white/10 p-8">
        <div className="text-xs uppercase tracking-[0.30em] text-[#c8a96a]">
          Production
        </div>

        <div className="mt-2 text-3xl font-semibold">
          {project?.name || production?.title || "Production"}
        </div>

        {!production && (
          <div className="mt-3 text-sm text-white/40">
            No production document yet. Showing available creative assets.
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#d5b56d]/70">
                Video master quality
              </div>
              <div className="mt-1 text-sm text-white/70">
                Choose the configured native generation quality before cost approval.
              </div>
              <div className="mt-1 text-xs text-white/35">
                Available qualities and Auto priority come from the active provider configuration.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {qualityOptions.map((option) => {
                const active = videoQuality === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={qualitySaving || qualityLocked || !project?.id}
                    onClick={() => selectVideoQuality(option.id)}
                    title={option.description}
                    className={`rounded-xl border px-3.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      active
                        ? "border-[#d5b56d]/45 bg-[#d5b56d]/12 text-[#f0dca8]"
                        : "border-white/10 bg-black/20 text-white/50 hover:border-white/20 hover:text-white/75"
                    }`}
                  >
                    <div className="text-xs font-semibold">{option.label}</div>
                    <div className="mt-0.5 text-[10px] opacity-60">
                      {option.short_label}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {qualityLoading ? (
            <div className="mt-3 text-xs text-white/35">Loading configured quality options…</div>
          ) : null}
          {!qualityLoading && !qualityOptions.length && !qualityError ? (
            <div className="mt-3 text-xs text-amber-200/60">
              No configured video quality options are available for this organization.
            </div>
          ) : null}
          {qualityLocked ? (
            <div className="mt-3 text-xs text-amber-200/60">
              Quality is locked by the current generation authorization. A different quality requires a fresh preflight and approval.
            </div>
          ) : null}
          {qualitySaving ? (
            <div className="mt-3 text-xs text-white/35">Saving quality preference…</div>
          ) : null}
          {qualityError ? (
            <div className="mt-3 text-xs text-red-200/75">{qualityError}</div>
          ) : null}
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#d5b56d]/70">
                Generation approval
              </div>
              <div className="mt-1 text-sm text-white/70">
                Review the exact task-bound generation preflight before authorizing paid production.
              </div>
              <div className="mt-1 text-xs text-white/35">
                Approval seals provider, model, quality, duration, pricing and the preflight hash. Publication remains unauthorized.
              </div>
            </div>
            {generationLoading ? (
              <div className="text-xs text-white/35">Resolving preflight…</div>
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            {generationInspections.map((inspection) => {
              const preflight = inspection.preflight || {};
              const task = inspection.task || {};
              const blockingReasons = Array.isArray(inspection.blocking_reasons)
                ? inspection.blocking_reasons
                : [];
              return (
                <div
                  key={task.id || preflight.preflight_sha256}
                  className="rounded-xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white/85">
                        {task.title || "Video generation"}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/45">
                        <span>Quality: {preflight.resolution || "—"}</span>
                        <span>Format: {preflight.aspect_ratio || "—"}</span>
                        <span>
                          Duration: {preflight.duration_seconds ?? preflight.quantity ?? "—"}
                          {preflight.unit ? ` ${preflight.unit}` : ""}
                        </span>
                        <span>Price: {money(preflight.customer_price, preflight.currency)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/30">
                        <span>{preflight.provider || "Configured provider"}</span>
                        {preflight.model ? <span>{preflight.model}</span> : null}
                        <span>Dossier: {inspection.dossier_approved ? "approved" : "pending"}</span>
                      </div>
                    </div>

                    {inspection.approved ? (
                      <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-100/80">
                        Generation authorized
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          inspection.can_approve !== true ||
                          approvingTaskId !== null ||
                          !preflight.preflight_sha256
                        }
                        onClick={() => approveGeneration(inspection)}
                        className="rounded-xl border border-[#d5b56d]/35 bg-[#d5b56d]/12 px-4 py-2.5 text-xs font-semibold text-[#f0dca8] transition hover:bg-[#d5b56d]/18 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {approvingTaskId === task.id
                          ? "Authorizing…"
                          : `Approve generation • ${money(preflight.customer_price, preflight.currency)}`}
                      </button>
                    )}
                  </div>

                  {blockingReasons.length ? (
                    <div className="mt-3 space-y-1 text-xs text-amber-200/60">
                      {blockingReasons.map((reason) => (
                        <div key={reason}>{approvalBlockerLabel(reason)}</div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-3 break-all text-[10px] text-white/20">
                    Preflight {preflight.preflight_sha256 || "not available"}
                  </div>
                </div>
              );
            })}

            {!generationLoading && !generationInspections.length && !generationError ? (
              <div className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-white/35">
                No task currently resolves to a complete governed video generation preflight.
              </div>
            ) : null}
          </div>

          {generationError ? (
            <div className="mt-3 text-xs text-red-200/75">{generationError}</div>
          ) : null}
          {generationInspections.some((inspection) => inspection.approved) ? (
            <div className="mt-3 text-xs text-white/35">
              Generation is authorized for the sealed task only. This screen does not dispatch generation or authorize publication.
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-0">
        <section className="min-h-[420px] border-r border-white/10 p-8">
          {previewUrl ? (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
              {isVideo(selectedAsset) ? (
                <video
                  src={previewUrl}
                  controls
                  className="h-[420px] w-full object-contain"
                />
              ) : (
                <img
                  src={previewUrl}
                  alt={
                    selectedAsset?.name ||
                    selectedAsset?.title ||
                    "Creative asset"
                  }
                  className="h-[420px] w-full object-contain"
                />
              )}
            </div>
          ) : (
            <div className="flex h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/10 text-white/35">
              No preview asset found.
            </div>
          )}

          <div className="mt-6 grid grid-cols-4 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-white/40">Status</div>
              <div className="mt-2">
                {production?.status || "Asset Preview"}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-white/40">Tasks</div>
              <div className="mt-2 text-2xl">{tasks.length}</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-white/40">Assets</div>
              <div className="mt-2 text-2xl">{assets.length}</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-white/40">Queue</div>
              <div className="mt-2 text-2xl">
                {runtime.queueRuntime?.total || 0}
              </div>
            </div>
          </div>
        </section>

        <aside className="p-6">
          <div className="mb-4 text-xs uppercase tracking-[0.25em] text-white/40">
            Assets
          </div>

          <div className="space-y-3">
            {assets.map(asset => {
              const url = assetUrl(asset);

              return (
                <div
                  key={asset.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                >
                  {url && (
                    isVideo(asset) ? (
                      <video
                        src={url}
                        className="mb-3 h-24 w-full rounded-lg object-cover"
                      />
                    ) : (
                      <img
                        src={url}
                        alt={asset.name || asset.title || "Asset"}
                        className="mb-3 h-24 w-full rounded-lg object-cover"
                      />
                    )
                  )}

                  <div className="text-sm font-medium">
                    {asset.name || asset.title || asset.asset_type || "Creative Asset"}
                  </div>

                  <div className="mt-1 text-xs text-white/40">
                    {asset.provider || asset.asset_type || "asset"}
                  </div>
                </div>
              );
            })}

            {!assets.length && (
              <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-white/35">
                Empty
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
