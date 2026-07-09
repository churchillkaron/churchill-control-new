"use client";

import TimelinePanel from "../timeline/TimelinePanel";
import AssetBrowser from "../assets/AssetBrowser";

export default function BottomDock({
  runtime,
}) {

  return (
    <section className="grid h-full min-h-0 grid-cols-[1.4fr_1fr] divide-x divide-white/10 overflow-hidden bg-[#080808]">

      <div className="min-h-0 overflow-hidden">

        <TimelinePanel
          runtime={runtime}
        />

      </div>

      <div className="min-h-0 overflow-hidden">

        <AssetBrowser
          runtime={runtime}
        />

      </div>

    </section>
  );
}
