"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Image as ImageIcon,
  Layers3,
  Maximize2,
} from "lucide-react";

function assetUrl(asset) {
  return asset?.image_url || asset?.thumbnail_url || asset?.file_url || asset?.uri || asset?.url || "";
}

function looksLikeImage(asset) {
  const type = String(asset?.asset_type || asset?.mime_type || asset?.type || "").toLowerCase();
  const url = assetUrl(asset).toLowerCase();
  return type.includes("image") || /\.(png|jpe?g|webp|gif|avif)(\?|$)/.test(url);
}

function label(asset, index) {
  return asset?.title || asset?.name || asset?.file_name || `Image ${index + 1}`;
}

function value(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function Property({ label, children }) {
  return (
    <div className="border-b border-white/[0.055] py-3 last:border-b-0">
      <div className="text-[9px] font-semibold uppercase tracking-[0.17em] text-white/24">{label}</div>
      <div className="mt-1.5 break-words text-[11px] leading-5 text-white/60">{children}</div>
    </div>
  );
}

export default function ImageStudioWorkspace({ runtime }) {
  const images = useMemo(
    () => (runtime.assetRuntime?.items || []).filter(looksLikeImage),
    [runtime.assetRuntime?.items],
  );
  const [selectedId, setSelectedId] = useState(images[0]?.id || null);
  const selected = images.find((item) => item.id === selectedId) || images[0] || null;
  const previewUrl = assetUrl(selected);

  const siblingVersions = useMemo(() => {
    if (!selected) return [];
    const rootId = selected.parent_asset_id || selected.id;
    return images
      .filter((item) => item.id === rootId || item.parent_asset_id === rootId || item.parent_asset_id === selected.parent_asset_id)
      .sort((a, b) => Number(b.revision || b.version || 0) - Number(a.revision || a.version || 0));
  }, [images, selected]);

  return (
    <div className="grid h-full min-h-0 bg-[#050505] lg:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[250px_minmax(0,1fr)_300px]">
      <aside className="min-h-0 overflow-y-auto border-r border-white/[0.08] bg-[#080807] p-3">
        <div className="flex items-center justify-between px-2 pb-3 pt-1">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/26">Assets</div>
            <div className="mt-1 text-[11px] text-white/38">{images.length} image{images.length === 1 ? "" : "s"}</div>
          </div>
          <Layers3 className="h-4 w-4 text-[#D6A66A]/55" />
        </div>

        <div className="space-y-1.5">
          {images.map((asset, index) => {
            const url = assetUrl(asset);
            const active = selected?.id === asset.id;
            return (
              <button
                key={asset.id || `${url}-${index}`}
                type="button"
                onClick={() => setSelectedId(asset.id)}
                className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition ${active ? "border-[#D6A66A]/30 bg-[#D6A66A]/[0.07]" : "border-transparent hover:border-white/[0.08] hover:bg-white/[0.025]"}`}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/[0.07] bg-black/40">
                  {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-4 w-4 text-white/20" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium text-white/68">{label(asset, index)}</div>
                  <div className="mt-1 flex items-center gap-2 text-[9px] text-white/26">
                    <span>{asset.revision || asset.version || "v1"}</span>
                    <span>·</span>
                    <span className="truncate">{asset.approval_state || asset.status || "asset"}</span>
                  </div>
                </div>
              </button>
            );
          })}

          {!images.length ? (
            <div className="rounded-xl border border-dashed border-white/[0.09] px-4 py-8 text-center text-[11px] leading-5 text-white/28">
              No image assets in the active creative project yet.
            </div>
          ) : null}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#050505]">
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-4 py-3 lg:px-5">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-white/78">{selected ? label(selected, 0) : "Image canvas"}</div>
            <div className="mt-0.5 text-[10px] text-white/27">Current asset · governed Creative library</div>
          </div>
          {selected?.approval_state ? (
            <div className="flex items-center gap-1.5 rounded-full border border-white/[0.08] px-2.5 py-1 text-[9px] uppercase tracking-[0.13em] text-white/38">
              <CheckCircle2 className="h-3 w-3 text-[#D6A66A]/70" />
              {selected.approval_state}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4 lg:p-6">
          <div className="flex min-h-full items-center justify-center rounded-2xl border border-white/[0.07] bg-black/60 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            {previewUrl ? (
              <img src={previewUrl} alt={selected?.title || selected?.name || "Creative image"} className="max-h-[calc(100vh-260px)] max-w-full object-contain" />
            ) : (
              <div className="text-center text-white/25">
                <ImageIcon className="mx-auto h-8 w-8" />
                <div className="mt-3 text-sm">Select an image asset</div>
              </div>
            )}
          </div>
        </div>

        {selected ? (
          <div className="shrink-0 border-t border-white/[0.07] bg-[#080807] px-4 py-3 lg:px-5">
            <div className="flex items-center gap-3 overflow-x-auto">
              <div className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/24">Versions</div>
              {(siblingVersions.length ? siblingVersions : [selected]).map((version, index) => {
                const url = assetUrl(version);
                const active = version.id === selected.id;
                return (
                  <button
                    key={version.id || index}
                    type="button"
                    onClick={() => setSelectedId(version.id)}
                    className={`flex shrink-0 items-center gap-2 rounded-lg border px-2 py-1.5 ${active ? "border-[#D6A66A]/30 bg-[#D6A66A]/[0.06]" : "border-white/[0.07] bg-white/[0.02]"}`}
                  >
                    {url ? <img src={url} alt="" className="h-7 w-7 rounded object-cover" /> : null}
                    <span className="text-[10px] text-white/48">v{value(version.revision || version.version || index + 1)}</span>
                  </button>
                );
              })}
              <div className="ml-auto hidden items-center gap-1.5 text-[9px] text-white/22 xl:flex">
                <Maximize2 className="h-3 w-3" /> Canvas preserves original aspect ratio
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <aside className="hidden min-h-0 overflow-y-auto border-l border-white/[0.08] bg-[#080807] p-4 2xl:block">
        <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#D6A66A]/62">Image properties</div>
        <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/20 px-4">
          <Property label="Title">{value(selected?.title || selected?.name)}</Property>
          <Property label="Status">{value(selected?.status)}</Property>
          <Property label="Approval">{value(selected?.approval_state)}</Property>
          <Property label="Provider">{value(selected?.provider || selected?.engine)}</Property>
          <Property label="MIME type">{value(selected?.mime_type)}</Property>
          <Property label="Revision">{value(selected?.revision || selected?.version)}</Property>
          <Property label="Score">{value(selected?.score || selected?.performance_score)}</Property>
          <Property label="Tags">{Array.isArray(selected?.tags) && selected.tags.length ? selected.tags.join(", ") : "—"}</Property>
        </div>
      </aside>
    </div>
  );
}
