"use client";

import AddToTimelineButton from "./actions/AddToTimelineButton";
import { useAssetTimeline } from "./hooks/useAssetTimeline";

function AssetRow({ asset, addToTimeline }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-black/[0.055] px-3 py-2.5 last:border-0 hover:bg-[#FBF8F3]">
      <div className="min-w-0">
        <div className="truncate text-[8px] font-semibold text-[#4A453F]">{asset.name || asset.title || "Unnamed asset"}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[7px] text-[#918B83]">
          <span>{asset.type || "ASSET"}</span>
          <span>·</span>
          <span>{asset.status || "READY"}</span>
        </div>
      </div>
      <AddToTimelineButton asset={asset} addToTimeline={addToTimeline} />
    </div>
  );
}

export default function AssetBrowser({ runtime }) {
  const assets = runtime.assetRuntime?.items || [];
  const timeline = runtime.timelineRuntime;
  const track = timeline?.tracks?.[0];

  const { addToTimeline } = useAssetTimeline({
    organizationId: runtime.organizationId,
    projectId: runtime.projectRuntime?.current?.id,
    timelineId: timeline?.id,
    trackId: track?.id,
    onCreated() {
      runtime.refresh?.();
    },
  });

  const priority = ["VIDEO", "IMAGE", "VOICE", "MUSIC", "MODEL", "BRAND"];
  const grouped = new Map();
  for (const asset of assets) {
    const type = asset.type || "IMAGE";
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type).push(asset);
  }
  const groups = [...new Set([...priority, ...grouped.keys()])];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#FCFBF8]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-black/[0.06] px-3">
        <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8A867F]">Media</div>
        <div className="text-[7px] text-[#918B83]">{assets.length} assets</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.map((type) => {
          const list = grouped.get(type) || [];
          if (!list.length) return null;
          return (
            <section key={type}>
              <div className="sticky top-0 z-10 border-b border-black/[0.05] bg-[#F6F3EE] px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8A867F]">{type} · {list.length}</div>
              {list.map((asset) => <AssetRow key={asset.id} asset={asset} addToTimeline={addToTimeline} />)}
            </section>
          );
        })}
        {!assets.length ? <div className="p-5 text-center text-[8px] text-[#918B83]">No project assets yet.</div> : null}
      </div>
    </div>
  );
}
