"use client";

import { useEffect, useMemo, useState } from "react";

export default function StudioCenterStage({
  selectedAssets = [],
  setSelectedAssets,
  marketingAssets = [],
  latestCampaign,
  activeAsset: externalActiveAsset,
  setActiveAsset: setExternalActiveAsset,
}) {
  const [localActiveAsset, setLocalActiveAsset] =
    useState(null);

  const activeAsset =
    externalActiveAsset || localActiveAsset;

  const setActiveAsset = (asset) => {
    setLocalActiveAsset(asset);
    setExternalActiveAsset?.(asset);
  };

  const campaignMedia = useMemo(() => {
    if (latestCampaign?.video_url) {
      return {
        type: "video",
        url: latestCampaign.video_url,
      };
    }

    const imageUrl =
      latestCampaign?.image_url ||
      latestCampaign?.imageUrl ||
      latestCampaign?.thumbnail_url ||
      null;

    return imageUrl
      ? {
          type: "image",
          url: imageUrl,
        }
      : null;
  }, [latestCampaign]);

  useEffect(() => {
    if (campaignMedia?.url) {
      setActiveAsset(campaignMedia);
    }
  }, [campaignMedia?.url]);

  const visibleAssets =
    selectedAssets.length > 0
      ? selectedAssets
      : marketingAssets.slice(0, 10);

  return (
    <main className="h-full overflow-hidden p-4">
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-center justify-between rounded-[26px] border border-white/[0.08] bg-white/[0.035] px-5 py-3 backdrop-blur-3xl">
          <div>
            <div className="text-[10px] uppercase tracking-[0.35em] text-[#D6B56D]">
              Creative Canvas
            </div>
            <div className="mt-1 text-xl font-semibold tracking-[-0.04em]">
              Full Preview
            </div>
          </div>

          <div className="flex rounded-full border border-white/[0.08] bg-black/35 p-1 text-xs text-white/55">
            {["Post", "Story", "Flyer", "Menu", "Screen", "Video"].map((item) => (
              <button
                key={item}
                className="rounded-full px-4 py-2 transition hover:bg-white/[0.06] hover:text-white"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[34px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(214,181,109,0.12),transparent_32%),linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015))] shadow-[0_30px_120px_rgba(0,0,0,0.72)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.055),transparent_45%)]" />

          <div className="relative flex h-full w-full items-center justify-center p-6">
            {activeAsset?.url ? (
              <div className="relative h-full max-h-full overflow-hidden rounded-[34px] border border-[#D6B56D]/25 bg-black shadow-[0_35px_150px_rgba(0,0,0,0.95),0_0_90px_rgba(214,181,109,0.12)]">
                {activeAsset?.type === "video" ? (
                  <video
                    src={activeAsset.url}
                    controls
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <img
                    src={activeAsset.url}
                    alt="Creative Preview"
                    className="h-full w-full object-contain"
                  />
                )}
              </div>
            ) : (
              <div className="flex max-w-md flex-col items-center text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border border-dashed border-white/15 bg-black/35 text-white/30">
                  +
                </div>
                <div className="text-xl font-semibold text-white">
                  No creative selected
                </div>
                <div className="mt-2 text-sm leading-6 text-white/45">
                  Generate a campaign or select an asset from the dock to preview it here.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid shrink-0 gap-4 xl:grid-cols-[1fr_360px]">
          <section className="rounded-[26px] border border-white/[0.08] bg-white/[0.035] p-4 backdrop-blur-3xl">
            <div className="mb-2 text-[10px] uppercase tracking-[0.32em] text-[#D6B56D]">
              Generated Copy
            </div>
            <div className="max-h-28 overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-white/70">
              {latestCampaign?.content || "No campaign copy generated yet."}
            </div>
          </section>

          <section className="rounded-[26px] border border-white/[0.08] bg-white/[0.035] p-4 backdrop-blur-3xl">
            <div className="mb-3 text-[10px] uppercase tracking-[0.32em] text-[#D6B56D]">
              Asset Dock
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {visibleAssets.length === 0 && (
                <div className="rounded-2xl border border-white/[0.08] bg-black/30 p-4 text-xs text-white/40">
                  No assets loaded.
                </div>
              )}

              {visibleAssets.map((asset) => {
                const mediaUrl =
                  asset?.video_url ||
                  asset?.file_url ||
                  asset?.image_url ||
                  asset?.thumbnail_url;

                const isVideo =
                  asset?.tags?.includes("video") ||
                  asset?.video_url;

                return (
                  <button
                    key={asset.id}
                    onClick={() => {
                      setActiveAsset({
                        type: isVideo ? "video" : "image",
                        url: mediaUrl,
                        asset,
                      });

                      setSelectedAssets?.((prev) => {
                        if (prev.find((item) => item.id === asset.id)) {
                          return prev;
                        }

                        return [...prev, asset];
                      });
                    }}
                    className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-black/40 transition hover:border-[#D6B56D]/40"
                  >
                    {isVideo ? (
                      <video
                        src={mediaUrl}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <img
                        src={mediaUrl}
                        alt={asset.name || "Asset"}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
