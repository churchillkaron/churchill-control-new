"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  Circle,
  Image as ImageIcon,
  Layers3,
  Maximize2,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { buildCreativeImageStudioOperatingState } from "@/lib/creative/stills/runtime/CreativeImageStudioOperatingRuntime";
import { classifyStillStudioHandoff } from "@/lib/creative/image/runtime/CreativeStillStudioHandoffRuntime";
import { useImageStudioWorkspaceStore } from "./useImageStudioWorkspaceStore";
import { useImageStudioWorkspacePersistence } from "./useImageStudioWorkspacePersistence";
import ImageStudioCanvasToolbar from "./ImageStudioCanvasToolbar";
import ImageStudioFormatBar from "./ImageStudioFormatBar";
import ImageStudioVersionCompare from "./ImageStudioVersionCompare";
import ImageStudioVersionHistoryPanel from "./ImageStudioVersionHistoryPanel";
import ImageStudioReferencePanel from "./ImageStudioReferencePanel";
import ImageStudioCanvasSurface from "./ImageStudioCanvasSurface";
import ImageStudioLayerPanel from "./ImageStudioLayerPanel";
import ImageStudioExportPanel from "./ImageStudioExportPanel";
import ImageStudioCommentComposer from "./ImageStudioCommentComposer";
import ImageStudioCommentsPanel from "./ImageStudioCommentsPanel";
import ImageStudioConflictBanner from "./ImageStudioConflictBanner";
import ImageStudioLayerInspector from "./ImageStudioLayerInspector";
import ImageStudioQualityPanel from "./ImageStudioQualityPanel";
import ImageStudioVisualBiblePanel from "./ImageStudioVisualBiblePanel";
import ImageStudioFinishingPanel from "./ImageStudioFinishingPanel";
import ImageStudioKeyboardShortcuts from "./ImageStudioKeyboardShortcuts";

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

function value(input) {
  return input === null || input === undefined || input === "" ? "—" : String(input);
}

function statusClass(status) {
  if (status === "COMPLETE") return "text-[#607057]";
  if (status === "ACTIVE") return "text-[#D6A66A]";
  if (status === "BLOCKED") return "text-[#98513D]";
  return "text-[#A09A92]";
}

function Property({ label: propertyLabel, children }) {
  return (
    <div className="border-b border-[#E5E1DA] py-3 last:border-b-0">
      <div className="text-[8px] font-semibold uppercase tracking-[0.17em] text-[#A09A92]">{propertyLabel}</div>
      <div className="mt-1.5 break-words text-[10px] leading-5 text-[#5E5952]">{children}</div>
    </div>
  );
}

function StageRail({ stages }) {
  return (
    <div className="space-y-1">
      {stages.map((stage, index) => (
        <div key={stage.id} className={`rounded-xl border px-3 py-2.5 ${stage.state === "ACTIVE" ? "border-[#D6A66A]/25 bg-[#D6A66A]/[0.06]" : "border-[#E5E1DA] bg-[#FBFAF8]"}`}>
          <div className="flex items-center gap-2">
            {stage.state === "COMPLETE" ? <CheckCircle2 className="h-3 w-3 text-[#607057]" /> : <Circle className={`h-3 w-3 ${statusClass(stage.state)}`} />}
            <span className={`text-[8px] font-semibold uppercase tracking-[0.12em] ${statusClass(stage.state)}`}>{String(index + 1).padStart(2, "0")}</span>
            <span className="text-[10px] font-medium text-[#4E4943]">{stage.label}</span>
          </div>
          {stage.state === "ACTIVE" ? <div className="mt-1.5 pl-5 text-[8px] leading-4 text-[#918B83]">{stage.detail}</div> : null}
        </div>
      ))}
    </div>
  );
}

export default function ImageStudioWorkspace({ runtime }) {
  const operating = useMemo(() => buildCreativeImageStudioOperatingState(runtime), [runtime]);
  const images = useMemo(() => (runtime.assetRuntime?.items || []).filter(looksLikeImage), [runtime.assetRuntime?.items]);
  const workspace = useImageStudioWorkspaceStore();
  const persistence = useImageStudioWorkspacePersistence({
    organizationId: runtime.projectRuntime?.current?.organization_id || runtime.organization_id || null,
    projectId: runtime.projectRuntime?.current?.id || null,
    workspace,
  });
  const bootstrapScopeRef = useRef(null);
  useEffect(() => {
    const projectId = runtime.projectRuntime?.current?.id || null;
    const organizationId = runtime.projectRuntime?.current?.organization_id || runtime.organization_id || null;
    if (!projectId || !organizationId || !images.length) return;
    const scopeKey = `${organizationId}:${projectId}`;
    if (persistence.hydrationState !== "EMPTY" || persistence.hydratedScope !== scopeKey) return;
    if (bootstrapScopeRef.current === scopeKey) return;
    bootstrapScopeRef.current = scopeKey;
    const artboards = images.map((asset, index) => ({
      id: asset.artboard_id || `asset-artboard-${asset.id || index + 1}`,
      name: label(asset, index),
      width: Number(asset.width || asset.metadata?.width || 1080),
      height: Number(asset.height || asset.metadata?.height || 1350),
      sort_order: index,
      status: asset.approval_state || asset.status || "DRAFT",
    }));
    const layers = images.map((asset, index) => {
      const sourceWidth = Number(asset.width || asset.metadata?.width || asset.metadata?.pixel_width || 0) || null;
      const sourceHeight = Number(asset.height || asset.metadata?.height || asset.metadata?.pixel_height || 0) || null;
      return {
        id: `asset-layer-${asset.id || index + 1}`,
        artboard_id: artboards[index]?.id,
        parent_layer_id: null,
        source_asset_id: asset.id || null,
        layer_type: "IMAGE",
        name: label(asset, index),
        bounds: { x: 0, y: 0, width: artboards[index]?.width || 1080, height: artboards[index]?.height || 1350 },
        transform: { rotation: 0 },
        style: {},
        content: {},
        sort_order: 0,
        visible: true,
        locked: false,
        metadata: {
          bootstrap_source: true,
          source_width: sourceWidth,
          source_height: sourceHeight,
          source_dimensions: { width: sourceWidth, height: sourceHeight },
        },
      };
    });
    workspace.hydrate({ project_id: projectId, organization_id: organizationId, artboards, layers });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime.projectRuntime?.current?.id, runtime.organization_id, images, persistence.hydrationState, persistence.hydratedScope, workspace]);
  const [selectedId, setSelectedId] = useState(images[0]?.id || null);
  const [leftMode, setLeftMode] = useState("production");
  const selected = images.find((item) => item.id === selectedId) || images[0] || null;
  const previewUrl = assetUrl(selected);
  const studioHandoff = useMemo(() => classifyStillStudioHandoff({ asset: selected || {} }), [selected]);
  const organizationId = runtime.projectRuntime?.current?.organization_id || runtime.organization_id || null;
  const projectId = runtime.projectRuntime?.current?.id || null;
  const videoHref = organizationId && projectId && selected?.id ? `/workspace/${organizationId}/creative/video?project_id=${projectId}&source_asset_id=${selected.id}&source_lineage=${studioHandoff.lineage_digest}` : null;

  const siblingVersions = useMemo(() => {
    if (!selected) return [];
    const rootId = selected.parent_asset_id || selected.id;
    return images
      .filter((item) => item.id === rootId || item.parent_asset_id === rootId || item.parent_asset_id === selected.parent_asset_id)
      .sort((a, b) => Number(b.revision || b.version || 0) - Number(a.revision || a.version || 0));
  }, [images, selected]);

  const projectName = operating.project?.name || operating.mission?.title || operating.mission?.business_goal || "Active creative project";

  return (
    <>
    <ImageStudioKeyboardShortcuts workspace={workspace} persistence={persistence} />
    <div className="grid h-full min-h-0 bg-[#F7F6F3] lg:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[290px_minmax(0,1fr)_320px]">
      <aside className="min-h-0 overflow-y-auto border-r border-[#D8D3CB] bg-white">
        <div className="sticky top-0 z-10 border-b border-[#E2DED7] bg-white/95 p-3 backdrop-blur">
          <div className="grid grid-cols-2 rounded-lg border border-[#DDD8D0] bg-[#FBFAF8] p-1">
            {[["production", "Production"], ["assets", "Assets"]].map(([id, name]) => (
              <button key={id} type="button" onClick={() => setLeftMode(id)} className={`rounded-md px-2 py-1.5 text-[8px] font-semibold uppercase tracking-[0.12em] ${leftMode === id ? "bg-[#D6A66A]/[0.09] text-[#D6A66A]" : "text-[#918B83]"}`}>{name}</button>
            ))}
          </div>
        </div>

        {leftMode === "production" ? (
          <div className="space-y-5 p-3">
            <section>
              <div className="px-1 text-[8px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]/65">Image production</div>
              <div className="mt-1 px-1 text-[11px] font-medium leading-5 text-[#4E4943]">{projectName}</div>
              <div className="mt-1 px-1 text-[9px] leading-4 text-[#948D84]">The studio advances from purpose and references to exact composition, repair, review and delivery.</div>
            </section>
            <section>
              <div className="mb-2 flex items-center justify-between px-1"><span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-[#99928A]">Workflow</span><Sparkles className="h-3 w-3 text-[#D6A66A]/50" /></div>
              <StageRail stages={operating.stages} />
            </section>
            <section>
              <div className="mb-2 flex items-center justify-between px-1"><span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-[#99928A]">Studio team</span><UsersRound className="h-3 w-3 text-[#D6A66A]/50" /></div>
              <div className="space-y-1">
                {operating.team.map((role) => (
                  <div key={role.id} className="rounded-lg border border-[#E7E3DD] bg-[#FBFAF8] px-3 py-2">
                    <div className="text-[9px] font-medium text-[#625D56]">{role.id.replaceAll("_", " ")}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="p-3">
            <div className="flex items-center justify-between px-2 pb-3 pt-1">
              <div><div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#99928A]">Assets</div><div className="mt-1 text-[11px] text-[#817A72]">{images.length} image{images.length === 1 ? "" : "s"}</div></div>
              <Layers3 className="h-4 w-4 text-[#D6A66A]/55" />
            </div>
            <div className="space-y-1.5">
              {images.map((asset, index) => {
                const url = assetUrl(asset);
                const active = selected?.id === asset.id;
                return <button key={asset.id || `${url}-${index}`} type="button" draggable onDragStart={(event)=>{event.dataTransfer.setData("application/x-avantiqo-asset",asset.id||"");event.dataTransfer.effectAllowed="copy";}} onClick={() => setSelectedId(asset.id)} className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition ${active ? "border-[#D6A66A]/30 bg-[#D6A66A]/[0.07]" : "border-transparent hover:border-[#D8D3CB] hover:bg-[#F7F6F3]"}`}>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#DDD8D0] bg-[#F2EFEA]">{url ? <Image src={url} alt="" width={44} height={44} className="h-full w-full object-cover" /> : <ImageIcon className="h-4 w-4 text-[#AAA49C]" />}</div>
                  <div className="min-w-0 flex-1"><div className="truncate text-[11px] font-medium text-[#403C36]">{label(asset, index)}</div><div className="mt-1 flex items-center gap-2 text-[9px] text-[#99928A]"><span>{asset.revision || asset.version || "v1"}</span><span>·</span><span className="truncate">{asset.approval_state || asset.status || "asset"}</span></div></div>
                </button>;
              })}
              {!images.length ? <div className="rounded-xl border border-dashed border-[#D8D3CB] px-4 py-8 text-center text-[11px] leading-5 text-[#948D84]">No image assets in the active creative project yet.</div> : null}
            </div>
          </div>
        )}
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#F7F6F3]">
        <div className="flex shrink-0 items-center justify-between border-b border-[#DDD8D0] px-4 py-3 lg:px-5">
          <div className="min-w-0"><div className="truncate text-sm font-medium text-[#2D2925]">{selected ? label(selected, 0) : "Image canvas"}</div><div className="mt-0.5 text-[10px] text-[#948D84]">{operating.active_stage.label} · governed Creative project</div></div>
          <ImageStudioCanvasToolbar workspace={workspace} persistence={persistence} />
          <div className="flex items-center gap-2">
            <div className="hidden rounded-full border border-[#DDD8D0] px-2.5 py-1 text-[8px] uppercase tracking-[0.12em] text-[#948D84] sm:block">{operating.counts.references} refs · {operating.counts.review_open} review</div>
            {selected?.approval_state ? <div className="flex items-center gap-1.5 rounded-full border border-[#D8D3CB] px-2.5 py-1 text-[9px] uppercase tracking-[0.13em] text-[#817A72]"><CheckCircle2 className="h-3 w-3 text-[#D6A66A]/70" />{selected.approval_state}</div> : null}
          </div>
        </div>

        <ImageStudioConflictBanner persistence={persistence} />
        <ImageStudioFormatBar workspace={workspace} />
        <div className="relative min-h-0 flex-1 overflow-auto p-4 lg:p-6">
          <ImageStudioCommentComposer workspace={workspace} persistence={persistence} />
          {workspace.ui.compare ? <ImageStudioVersionCompare workspace={workspace} assets={images} /> : <ImageStudioCanvasSurface workspace={workspace} assets={images} />}
        </div>

        {selected ? <div className="shrink-0 border-t border-[#DDD8D0] bg-white px-4 py-3 lg:px-5"><div className="flex items-center gap-3 overflow-x-auto"><div className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#A09A92]">Versions</div>{(siblingVersions.length ? siblingVersions : [selected]).map((version, index) => { const url = assetUrl(version); const active = version.id === selected.id; return <button key={version.id || index} type="button" onClick={() => setSelectedId(version.id)} className={`flex shrink-0 items-center gap-2 rounded-lg border px-2 py-1.5 ${active ? "border-[#D6A66A]/30 bg-[#D6A66A]/[0.06]" : "border-[#DDD8D0] bg-[#FBFAF8]"}`}>{url ? <Image src={url} alt="" width={28} height={28} className="h-7 w-7 rounded object-cover" /> : null}<span className="text-[10px] text-[#746E67]">v{value(version.revision || version.version || index + 1)}</span></button>; })}<div className="ml-auto hidden items-center gap-1.5 text-[9px] text-[#AAA49C] xl:flex"><Maximize2 className="h-3 w-3" /> Original aspect ratio preserved</div></div></div> : null}
      </section>

      <aside className="hidden min-h-0 overflow-y-auto border-l border-[#D8D3CB] bg-white p-4 2xl:block">
        <section>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.22em] text-[#D6A66A]/62"><ShieldCheck className="h-3 w-3" /> Quality authority</div>
          <div className="mt-3 space-y-2">
            {[
              ["Exact brand assets", operating.quality.exact_brand_assets_required],
              ["Deterministic typography", operating.quality.deterministic_typography_required],
              ["Bounded repair first", operating.quality.bounded_repair_preferred],
              ["Release ready", operating.quality.release_ready],
            ].map(([name, ready]) => <div key={name} className="flex items-center justify-between rounded-lg border border-[#E5E1DA] bg-[#FBFAF8] px-3 py-2.5"><span className="text-[9px] text-[#777169]">{name}</span>{ready ? <BadgeCheck className="h-3.5 w-3.5 text-[#607057]" /> : <Circle className="h-3 w-3 text-[#AAA49C]" />}</div>)}
          </div>
        </section>

        <section className="mt-5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#948D84]">Selected asset</div>
          <div className="mt-3 rounded-xl border border-[#DDD8D0] bg-[#FBFAF8] px-4">
            <Property label="Title">{value(selected?.title || selected?.name)}</Property>
            <Property label="Status">{value(selected?.status)}</Property>
            <Property label="Approval">{value(selected?.approval_state)}</Property>
            <Property label="Provider">{value(selected?.provider || selected?.engine)}</Property>
            <Property label="MIME type">{value(selected?.mime_type)}</Property>
            <Property label="Revision">{value(selected?.revision || selected?.version)}</Property>
            <Property label="Score">{value(selected?.score || selected?.performance_score)}</Property>
            <Property label="Tags">{Array.isArray(selected?.tags) && selected.tags.length ? selected.tags.join(", ") : "—"}</Property>
            {selected?.id ? <div className="py-3"><button type="button" onClick={async()=>{await persistence.action("add_reference",{id:crypto.randomUUID(),asset_id:selected.id,reference_role:"COMPOSITION",strength:1,locked:false,notes:"Added from Image Studio workspace"});await persistence.load();}} className="w-full rounded-md border border-[#D6A66A]/20 bg-[#D6A66A]/[0.04] px-2 py-1.5 text-[9px] text-[#D6A66A]">Use as reference</button></div> : null}
          </div>
        </section>

        <ImageStudioVisualBiblePanel bible={operating.visual_bible} />
        <ImageStudioFinishingPanel chain={operating.finishing_chain} />
        <ImageStudioLayerInspector workspace={workspace} persistence={persistence} assets={images} />
        <ImageStudioLayerPanel workspace={workspace} />
        <ImageStudioReferencePanel workspace={workspace} persistence={persistence} assets={images} />
        <ImageStudioCommentsPanel workspace={workspace} persistence={persistence} />
        <ImageStudioVersionHistoryPanel workspace={workspace} />
        <ImageStudioExportPanel workspace={workspace} persistence={persistence} />
        <ImageStudioQualityPanel workspace={workspace} />

        <section className="mt-5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#948D84]">Studio handoff</div>
          <div className="mt-2 rounded-xl border border-[#DDD8D0] bg-[#FBFAF8] p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-[#D6A66A]/20 bg-white px-3 py-2">
                <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#D6A66A]">Image Studio</div>
                <div className="mt-1 text-[8px] leading-4 text-[#817A72]">Still master · retouch · composite · typography · campaign variants.</div>
              </div>
              {videoHref && studioHandoff.destinations.video_studio.ready ? (
                <Link href={videoHref} className="rounded-lg border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] px-3 py-2 transition hover:bg-[#D6A66A]/[0.1]">
                  <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#D6A66A]">Video Studio →</div>
                  <div className="mt-1 text-[8px] leading-4 text-[#817A72]">Animate this approved master with its exact lineage and quality evidence.</div>
                </Link>
              ) : (
                <div className="rounded-lg border border-[#E5E1DA] bg-white px-3 py-2">
                  <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#A09A92]">Video Studio locked</div>
                  <div className="mt-1 text-[8px] leading-4 text-[#918B83]">Approve and seal this still for video source use first.</div>
                </div>
              )}
            </div>
            <div className="mt-2 text-[8px] leading-4 text-[#9A938B]">Video Studio never overwrites the still master. Source-image repair returns to Image Studio.</div>
          </div>
        </section>

        <section className="mt-5 rounded-xl border border-[#D6A66A]/15 bg-[#D6A66A]/[0.035] p-3">
          <div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#D6A66A]/70">Production rule</div>
          <p className="mt-2 text-[9px] leading-5 text-[#8A837A]">Prompt-free by design. Avantiqo derives provider instructions dynamically from approved business, brand and creative evidence. Typography, logos, prices, legal copy and structured business information remain exact editable composition until export.</p>
        </section>
      </aside>
    </div>
    </>
  );
}
