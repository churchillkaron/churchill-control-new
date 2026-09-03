"use client";

import { useMemo, useState } from "react";
import { useTimelineEditor } from "./hooks/useTimelineEditor";
import { useTimelineDrag } from "./hooks/useTimelineDrag";

const PX_PER_SECOND = 18;
const MIN_WIDTH = 72;

function Ruler({ seconds }) {
  return (
    <div className="relative ml-20 h-7 min-w-[900px] border-b border-black/[0.06] bg-[#FCFBF8]">
      {Array.from({ length: seconds + 1 }).map((_, index) => (
        <div key={index} className="absolute top-0 h-full border-l border-black/[0.06] text-[7px] text-[#A09A92]" style={{ left: index * PX_PER_SECOND }}>
          <span className="ml-1">{index}s</span>
        </div>
      ))}
    </div>
  );
}

function Clip({ clip, asset, selected, onSelect, drag }) {
  const start = Number(clip.start_seconds || 0);
  const end = Number(clip.end_seconds || start + 5);
  const width = Math.max(MIN_WIDTH, (end - start) * PX_PER_SECOND);
  const active = selected?.id === clip.id;

  return (
    <button
      type="button"
      onMouseDown={(event) => {
        onSelect(clip);
        drag.startDrag(clip, event.clientX);
      }}
      onMouseMove={(event) => drag.moveDrag(event.clientX)}
      onMouseUp={() => drag.endDrag()}
      onMouseLeave={() => drag.endDrag()}
      className={`absolute top-2 h-12 rounded-lg border px-2.5 py-2 text-left transition ${active ? "border-[#A37849]/35 bg-[#F5EEE5]" : "border-black/[0.08] bg-white hover:bg-[#FBF8F3]"}`}
      style={{ left: start * PX_PER_SECOND, width }}
    >
      <div className="truncate text-[8px] font-semibold text-[#4A453F]">{asset?.name || asset?.title || "Timeline clip"}</div>
      <div className="mt-0.5 text-[7px] tabular-nums text-[#918B83]">{start}s → {end}s</div>
    </button>
  );
}

function Track({ track, clips, assets, selected, onSelect, drag }) {
  return (
    <div className="flex min-w-[1000px] border-b border-black/[0.055] last:border-b-0">
      <div className="w-20 shrink-0 border-r border-black/[0.06] bg-[#FCFBF8] px-3 py-4 text-[7px] font-semibold uppercase tracking-[0.11em] text-[#8A867F]">{track.type}</div>
      <div className="relative h-16 flex-1 bg-white">
        {clips.map((clip) => (
          <Clip
            key={clip.id}
            clip={clip}
            asset={assets.find((item) => item.id === clip.asset_id)}
            selected={selected}
            onSelect={onSelect}
            drag={drag}
          />
        ))}
      </div>
    </div>
  );
}

export default function TimelinePanel({ runtime }) {
  const [selected, setSelected] = useState(null);
  const timeline = runtime.timelineRuntime;
  const clips = timeline?.clips || [];
  const assets = runtime.assetRuntime?.items || [];
  const tracks = timeline?.tracks || [];

  const { updateClip } = useTimelineEditor({
    organizationId: runtime.organizationId,
    timelineId: timeline?.id,
    onUpdated() {
      runtime.refresh?.();
    },
  });

  const drag = useTimelineDrag({ updateClip });
  const duration = useMemo(() => Math.ceil(clips.reduce((value, clip) => Math.max(value, Number(clip.end_seconds || 0)), 30)), [clips]);

  if (!timeline) {
    return <div className="flex h-full items-center justify-center bg-white text-[8px] text-[#918B83]">No timeline yet.</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-black/[0.06] px-3">
        <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8A867F]">Timeline</div>
        <div className="text-[7px] text-[#918B83]">{tracks.length} tracks · {clips.length} clips</div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-[1000px]">
          <Ruler seconds={duration} />
          {tracks.map((track) => (
            <Track
              key={track.id}
              track={track}
              clips={clips.filter((clip) => clip.track_id === track.id)}
              assets={assets}
              selected={selected}
              onSelect={setSelected}
              drag={drag}
            />
          ))}
        </div>
      </div>
      {selected ? <div className="shrink-0 border-t border-black/[0.06] px-3 py-2 text-[7px] text-[#918B83]">Selected clip · <span className="font-semibold text-[#4A453F]">{selected.id}</span></div> : null}
    </div>
  );
}
