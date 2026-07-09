"use client";

import { useMemo, useState } from "react";

import {
  useTimelineEditor,
} from "./hooks/useTimelineEditor";

import {
  useTimelineDrag,
} from "./hooks/useTimelineDrag";

const PX_PER_SECOND = 18;
const MIN_WIDTH = 80;

function Ruler({
  seconds,
}) {

  return (

    <div className="relative ml-24 h-8 min-w-[900px] border-b border-white/10">

      {Array.from({
        length: seconds + 1,
      }).map((_, index) => (

        <div
          key={index}
          className="absolute top-0 h-full border-l border-white/10 text-[10px] text-white/35"
          style={{
            left:
              index * PX_PER_SECOND,
          }}
        >

          <span className="ml-1">
            {index}s
          </span>

        </div>

      ))}

    </div>

  );

}

function Clip({
  clip,
  asset,
  selected,
  onSelect,
  drag,
}) {

  const start =
    Number(clip.start_seconds || 0);

  const end =
    Number(clip.end_seconds || start + 5);

  const width =
    Math.max(
      MIN_WIDTH,
      (end - start) * PX_PER_SECOND,
    );

  return (

    <button
      type="button"
      onMouseDown={(event) => {

        onSelect(clip);

        drag.startDrag(
          clip,
          event.clientX,
        );

      }}
      onMouseMove={(event) =>
        drag.moveDrag(
          event.clientX,
        )
      }
      onMouseUp={() =>
        drag.endDrag()
      }
      onMouseLeave={() =>
        drag.endDrag()
      }
      className={[
        "absolute top-2 rounded-xl border p-3 text-left transition",
        selected?.id === clip.id
          ? "border-[#c8a96a] bg-[#b48a45]/20"
          : "border-[#c8a96a]/20 bg-[#b48a45]/10 hover:bg-[#b48a45]/15",
      ].join(" ")}
      style={{
        left:
          start * PX_PER_SECOND,
        width,
      }}
    >

      <div className="truncate text-sm font-medium">
        {asset?.name ||
          asset?.title ||
          "Timeline Clip"}
      </div>

      <div className="mt-1 text-[10px] text-white/45">
        {start}s → {end}s
      </div>

    </button>

  );

}

function Track({
  track,
  clips,
  assets,
  selected,
  onSelect,
  drag,
}) {

  return (

    <div className="flex min-w-[1000px] border-b border-white/10">

      <div className="w-24 shrink-0 border-r border-white/10 px-3 py-4 text-xs uppercase tracking-[0.18em] text-white/40">
        {track.type}
      </div>

      <div className="relative h-20 flex-1">

        {clips.map((clip) => {

          const asset =
            assets.find(
              item =>
                item.id === clip.asset_id,
            );

          return (

            <Clip
              key={clip.id}
              clip={clip}
              asset={asset}
              selected={selected}
              onSelect={onSelect}
              drag={drag}
            />

          );

        })}

      </div>

    </div>

  );

}

export default function TimelinePanel({
  runtime,
}) {

  const [selected,setSelected] =
    useState(null);

  const timeline =
    runtime.timelineRuntime;

  const clips =
    runtime.timelineRuntime?.clips || [];

  const assets =
    runtime.assetRuntime?.items || [];

  const tracks =
    timeline?.tracks || [];

  const {
    updateClip,
  } =
    useTimelineEditor({

      organizationId:
        runtime.organizationId,

      timelineId:
        timeline?.id,

      onUpdated() {

        if (
          typeof runtime.refresh === "function"
        ) {
          runtime.refresh();
        }

      },

    });

  const drag =
    useTimelineDrag({
      updateClip,
    });

  const duration =
    useMemo(() => {

      const max =
        clips.reduce(
          (value, clip) =>
            Math.max(
              value,
              Number(
                clip.end_seconds || 0,
              ),
            ),
          30,
        );

      return Math.ceil(max);

    }, [
      clips,
    ]);

  if (!timeline) {

    return (

      <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-white/35">
        No timeline yet.
      </div>

    );

  }

  return (

    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">

      <div className="min-w-[1000px]">

        <Ruler
          seconds={duration}
        />

        {tracks.map((track) => (

          <Track
            key={track.id}
            track={track}
            clips={
              clips.filter(
                clip =>
                  clip.track_id === track.id,
              )
            }
            assets={assets}
            selected={selected}
            onSelect={setSelected}
            drag={drag}
          />

        ))}

      </div>

      {selected && (

        <div className="border-t border-white/10 p-3 text-xs text-white/50">

          Selected clip:
          {" "}
          <span className="text-white">
            {selected.id}
          </span>

        </div>

      )}

    </div>

  );

}
