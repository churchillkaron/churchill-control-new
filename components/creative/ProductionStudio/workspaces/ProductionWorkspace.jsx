"use client";

import { useEffect, useMemo, useState } from "react";

import CreativeDirectorCockpit from "../status/CreativeDirectorCockpit";
import CreativeConceptDirector from "../status/CreativeConceptDirector";
import CreativeQualityDirector from "../status/CreativeQualityDirector";
import {
  creativeVideoQualityDefinition,
  creativeVideoQualityFromProject,
} from "@/lib/creative/video/runtime/CreativeVideoQualityPreferenceRuntime";

const VIDEO_QUALITY_OPTIONS = ["AUTO", "HD", "FULL_HD", "UHD_4K"];

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
  const [qualitySaving, setQualitySaving] = useState(false);
  const [qualityError, setQualityError] = useState("");

  useEffect(() => {
    setVideoQuality(persistedQuality);
  }, [persistedQuality]);

  const qualityLocked = generationQualityLocked(project || {});

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
      runtime.refresh?.();
    } catch (error) {
      setVideoQuality(previous);
      setQualityError(error?.message || "Video quality update failed");
    } finally {
      setQualitySaving(false);
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
                Choose the native generation quality before cost approval.
              </div>
              <div className="mt-1 text-xs text-white/35">
                Auto selects the best supported native quality. This preference only applies when the approved deliverable uses video.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {VIDEO_QUALITY_OPTIONS.map((quality) => {
                const definition = creativeVideoQualityDefinition(quality);
                const active = videoQuality === quality;
                return (
                  <button
                    key={quality}
                    type="button"
                    disabled={qualitySaving || qualityLocked || !project?.id}
                    onClick={() => selectVideoQuality(quality)}
                    title={definition.description}
                    className={`rounded-xl border px-3.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      active
                        ? "border-[#d5b56d]/45 bg-[#d5b56d]/12 text-[#f0dca8]"
                        : "border-white/10 bg-black/20 text-white/50 hover:border-white/20 hover:text-white/75"
                    }`}
                  >
                    <div className="text-xs font-semibold">{definition.label}</div>
                    <div className="mt-0.5 text-[10px] opacity-60">
                      {definition.short_label}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

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
