"use client";

import AddToTimelineButton from "./actions/AddToTimelineButton";
import { useAssetTimeline } from "./hooks/useAssetTimeline";

function AssetCard({
  asset,
  addToTimeline,
}) {

  return (

    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">

      <div className="flex items-center justify-between">

        <div className="font-medium">
          {asset.name || "Unnamed Asset"}
        </div>

        <div className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase">
          {asset.type}
        </div>

      </div>

      <div className="mt-3 text-xs text-white/45">
        {asset.status || "READY"}
      </div>

      <div className="mt-4">
        <AddToTimelineButton
          asset={asset}
          addToTimeline={addToTimeline}
        />
      </div>

    </div>

  );

}

export default function AssetBrowser({
  runtime,
}) {

  const assets =
    runtime.assetRuntime?.items || [];

  const timeline =
    runtime.timelineRuntime;

  const track =
    timeline?.tracks?.[0];

  const { addToTimeline } =
    useAssetTimeline({

      organizationId:
        runtime.organizationId,

      projectId:
        runtime.projectRuntime?.current?.id,

      timelineId:
        timeline?.id,

      trackId:
        track?.id,

      onCreated() {

        if (
          typeof runtime.refresh === "function"
        ) {

          runtime.refresh();

        }

      },

    });

  const groups = {

    IMAGE: [],
    VIDEO: [],
    VOICE: [],
    MUSIC: [],
    MODEL: [],
    BRAND: [],

  };

  for (const asset of assets) {

    const type =
      asset.type || "IMAGE";

    if (!groups[type]) {
      groups[type] = [];
    }

    groups[type].push(asset);

  }

  return (

    <div className="space-y-6">

      {Object.entries(groups).map(([type, list]) => (

        <div key={type}>

          <div className="mb-3 text-xs uppercase tracking-[0.22em] text-white/40">

            {type}
            {" · "}
            {list.length}

          </div>

          <div className="grid grid-cols-2 gap-3">

            {list.map(asset => (

              <AssetCard
                key={asset.id}
                asset={asset}
                addToTimeline={addToTimeline}
              />

            ))}

            {!list.length && (

              <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-white/30">

                Empty

              </div>

            )}

          </div>

        </div>

      ))}

    </div>

  );

}
