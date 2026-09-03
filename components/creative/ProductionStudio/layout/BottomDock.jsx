"use client";

import TimelinePanel from "../timeline/TimelinePanel";
import AssetBrowser from "../assets/AssetBrowser";

export default function BottomDock({ runtime }) {
  return (
    <section className="grid h-full min-h-0 grid-cols-[1.55fr_0.95fr] divide-x divide-black/[0.07] overflow-hidden bg-white text-[#2A2723]">
      <div className="min-h-0 overflow-hidden">
        <TimelinePanel runtime={runtime} />
      </div>
      <div className="min-h-0 overflow-hidden bg-[#FCFBF8]">
        <AssetBrowser runtime={runtime} />
      </div>
    </section>
  );
}
