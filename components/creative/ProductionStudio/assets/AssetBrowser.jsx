"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import AddToTimelineButton from "./actions/AddToTimelineButton";
import { useAssetTimeline } from "./hooks/useAssetTimeline";

const ASSET_TYPE_PRIORITY = Object.freeze(["VIDEO", "IMAGE", "VOICE", "MUSIC", "MODEL", "BRAND"]);

function AssetRow({ asset, addToTimeline }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-black/[0.055] px-3 py-2.5 last:border-0 hover:bg-[#FBF8F3]">
      <div className="min-w-0">
        <div className="truncate text-[8px] font-semibold text-[#4A453F]">{asset.name || asset.title || "Unnamed asset"}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[7px] text-[#918B83]">
          <span>{asset.type || "ASSET"}</span><span>·</span><span>{asset.status || "READY"}</span>
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
  const [query, setQuery] = useState("");

  const { addToTimeline } = useAssetTimeline({
    organizationId: runtime.organizationId,
    projectId: runtime.projectRuntime?.current?.id,
    timelineId: timeline?.id,
    trackId: track?.id,
    onCreated() { runtime.refresh?.(); },
  });

  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const grouped = new Map();
    for (const asset of assets) {
      const searchable = [asset.name, asset.title, asset.type, asset.status].filter(Boolean).join(" ").toLowerCase();
      if (needle && !searchable.includes(needle)) continue;
      const type = asset.type || "IMAGE";
      if (!grouped.has(type)) grouped.set(type, []);
      grouped.get(type).push(asset);
    }
    return [...new Set([...ASSET_TYPE_PRIORITY, ...grouped.keys()])]
      .map((type) => ({ type, assets: grouped.get(type) || [] }))
      .filter((group) => group.assets.length);
  }, [assets, query]);

  const visibleCount = visibleGroups.reduce((sum, group) => sum + group.assets.length, 0);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#FCFBF8]">
      <div className="shrink-0 border-b border-black/[0.06] p-2.5">
        <div className="flex items-center justify-between px-0.5">
          <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8A867F]">Media</div>
          <div className="text-[7px] text-[#918B83]">{query ? `${visibleCount}/${assets.length}` : assets.length} assets</div>
        </div>
        <label className="mt-2 flex h-7 items-center gap-2 rounded-lg border border-black/[0.07] bg-white px-2.5 text-[#918B83] focus-within:border-[#A37849]/30">
          <Search size={9} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search media" className="min-w-0 flex-1 bg-transparent text-[8px] text-[#4A453F] outline-none placeholder:text-[#AAA49C]" />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visibleGroups.map((group) => (
          <section key={group.type}>
            <div className="sticky top-0 z-10 border-b border-black/[0.05] bg-[#F6F3EE] px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8A867F]">{group.type} · {group.assets.length}</div>
            {group.assets.map((asset) => <AssetRow key={asset.id} asset={asset} addToTimeline={addToTimeline} />)}
          </section>
        ))}
        {!assets.length ? <div className="p-5 text-center text-[8px] text-[#918B83]">No project assets yet.</div> : null}
        {assets.length && !visibleCount ? <div className="p-5 text-center text-[8px] text-[#918B83]">No media matches “{query}”.</div> : null}
      </div>
    </div>
  );
}
