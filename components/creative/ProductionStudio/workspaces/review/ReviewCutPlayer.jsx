"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function timecode(value = 0) {
  const total = Math.max(0, finite(value));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total - hours * 3600) / 60);
  const seconds = total - hours * 3600 - minutes * 60;
  const prefix = hours ? `${String(hours).padStart(2, "0")}:` : "";
  return `${prefix}${String(minutes).padStart(2, "0")}:${seconds.toFixed(2).padStart(5, "0")}`;
}

function segmentsFromTimeline(timeline = {}) {
  const entries = Array.isArray(timeline?.metadata?.edit_decision_list)
    ? timeline.metadata.edit_decision_list
    : [];

  return entries
    .map((entry, index) => {
      const sourceIn = finite(entry.source_in_seconds, 0);
      const duration = Math.max(0, finite(
        entry.duration_seconds,
        finite(entry.timeline_out_seconds, 0) - finite(entry.timeline_in_seconds, 0),
      ));
      const timelineIn = finite(entry.timeline_in_seconds, 0);
      const timelineOut = finite(entry.timeline_out_seconds, timelineIn + duration);
      const sourceOut = finite(entry.source_out_seconds, sourceIn + duration);
      return {
        key: String(
          entry.source_moment_node_id ||
          entry.source_clip_node_id ||
          entry.source_asset_node_id ||
          `review-segment-${index}`,
        ),
        index,
        url: entry.source_url || "",
        source_in_seconds: sourceIn,
        source_out_seconds: sourceOut,
        timeline_in_seconds: timelineIn,
        timeline_out_seconds: timelineOut,
        duration_seconds: Math.max(0, timelineOut - timelineIn),
      };
    })
    .filter((segment) =>
      segment.url &&
      segment.duration_seconds > 0 &&
      segment.source_out_seconds > segment.source_in_seconds,
    )
    .sort((left, right) => left.timeline_in_seconds - right.timeline_in_seconds);
}

function segmentIndexAt(segments, value) {
  if (!segments.length) return -1;
  const time = Math.max(0, finite(value));
  const exact = segments.findIndex((segment) =>
    time >= segment.timeline_in_seconds && time < segment.timeline_out_seconds,
  );
  if (exact >= 0) return exact;
  if (time >= segments[segments.length - 1].timeline_out_seconds) {
    return segments.length - 1;
  }
  return 0;
}

function markerResolved(marker = {}) {
  return Boolean(marker.metadata?.resolved_at || marker.status === "APPROVED");
}

export default function ReviewCutPlayer({
  timeline,
  value = 0,
  onChange,
  markers = [],
}) {
  const videoRef = useRef(null);
  const pendingSeekRef = useRef(null);
  const shouldPlayRef = useRef(false);
  const switchingRef = useRef(false);
  const segments = useMemo(() => segmentsFromTimeline(timeline), [timeline]);
  const [activeIndex, setActiveIndex] = useState(() => segmentIndexAt(segments, value));
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);

  const frameRate = Math.max(1, finite(
    timeline?.metadata?.frame_rate ??
    timeline?.metadata?.frameRate ??
    timeline?.technical?.frame_rate ??
    timeline?.technical?.fps,
    24,
  ));
  const frameDuration = 1 / frameRate;
  const totalDuration = segments.length
    ? segments[segments.length - 1].timeline_out_seconds
    : Math.max(0, finite(
        timeline?.metadata?.total_duration_seconds ?? timeline?.technical?.duration_seconds,
        0,
      ));
  const activeSegment = activeIndex >= 0 ? segments[activeIndex] || null : null;
  const nextSegment = activeIndex >= 0 ? segments[activeIndex + 1] || null : null;

  useEffect(() => {
    setActiveIndex(segmentIndexAt(segments, value));
    setPlaying(false);
    shouldPlayRef.current = false;
    switchingRef.current = false;
    pendingSeekRef.current = null;
  }, [timeline?.id]);

  const emit = useCallback((nextValue) => {
    onChange?.(clamp(nextValue, 0, Math.max(totalDuration, 0)));
  }, [onChange, totalDuration]);

  const seekGlobal = useCallback((nextValue, { preservePlayback = false } = {}) => {
    if (!segments.length) return;
    const target = clamp(finite(nextValue), 0, Math.max(totalDuration - frameDuration / 2, 0));
    const targetIndex = segmentIndexAt(segments, target);
    const segment = segments[targetIndex];
    if (!segment) return;
    const local = clamp(
      target - segment.timeline_in_seconds,
      0,
      Math.max(segment.duration_seconds - frameDuration / 2, 0),
    );
    const sourceTime = segment.source_in_seconds + local;
    shouldPlayRef.current = preservePlayback && shouldPlayRef.current;
    emit(target);

    if (targetIndex !== activeIndex) {
      pendingSeekRef.current = sourceTime;
      switchingRef.current = true;
      setActiveIndex(targetIndex);
      return;
    }

    const video = videoRef.current;
    if (video) {
      try {
        video.currentTime = sourceTime;
      } catch {
        pendingSeekRef.current = sourceTime;
      }
    }
  }, [activeIndex, emit, frameDuration, segments, totalDuration]);

  const moveToSegment = useCallback((nextIndex) => {
    const segment = segments[nextIndex];
    if (!segment) {
      shouldPlayRef.current = false;
      setPlaying(false);
      emit(totalDuration);
      return;
    }
    pendingSeekRef.current = segment.source_in_seconds;
    switchingRef.current = true;
    setActiveIndex(nextIndex);
    emit(segment.timeline_in_seconds);
  }, [emit, segments, totalDuration]);

  const pause = useCallback(() => {
    shouldPlayRef.current = false;
    setPlaying(false);
    videoRef.current?.pause?.();
  }, []);

  const play = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !activeSegment) return;
    shouldPlayRef.current = true;
    setPlaying(true);
    video.playbackRate = rate;
    try {
      await video.play();
    } catch {
      shouldPlayRef.current = false;
      setPlaying(false);
    }
  }, [activeSegment, rate]);

  const stepFrame = useCallback((direction) => {
    pause();
    seekGlobal(value + direction * frameDuration);
  }, [frameDuration, pause, seekGlobal, value]);

  const onLoadedMetadata = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !activeSegment) return;
    video.playbackRate = rate;
    const requested = pendingSeekRef.current;
    const start = requested === null
      ? activeSegment.source_in_seconds
      : clamp(
          requested,
          activeSegment.source_in_seconds,
          Math.max(activeSegment.source_in_seconds, activeSegment.source_out_seconds - frameDuration / 2),
        );
    pendingSeekRef.current = null;
    try {
      video.currentTime = start;
    } catch {
      // Browser will apply the seek when media becomes seekable.
    }
    switchingRef.current = false;
    if (shouldPlayRef.current) {
      try {
        await video.play();
        setPlaying(true);
      } catch {
        shouldPlayRef.current = false;
        setPlaying(false);
      }
    }
  }, [activeSegment, frameDuration, rate]);

  const onVideoTimeUpdate = useCallback((event) => {
    const segment = activeSegment;
    if (!segment || switchingRef.current) return;
    const sourceTime = finite(event.currentTarget.currentTime, segment.source_in_seconds);
    const local = Math.max(0, sourceTime - segment.source_in_seconds);
    const global = clamp(
      segment.timeline_in_seconds + local,
      segment.timeline_in_seconds,
      segment.timeline_out_seconds,
    );
    emit(global);

    if (
      sourceTime >= segment.source_out_seconds - Math.max(frameDuration / 2, 0.02)
    ) {
      moveToSegment(activeIndex + 1);
    }
  }, [activeIndex, activeSegment, emit, frameDuration, moveToSegment]);

  const onRateChange = useCallback((nextRate) => {
    setRate(nextRate);
    if (videoRef.current) videoRef.current.playbackRate = nextRate;
  }, []);

  const markerItems = useMemo(() => (Array.isArray(markers) ? markers : [])
    .map((marker) => ({
      id: marker.id,
      time: finite(marker.metadata?.timecode_seconds, 0),
      resolved: markerResolved(marker),
      body: marker.metadata?.body || marker.description || "Review note",
    }))
    .filter((marker) => marker.time >= 0 && marker.time <= totalDuration), [markers, totalDuration]);

  if (!segments.length || !activeSegment) {
    return (
      <div className="flex min-h-[430px] items-center justify-center px-8 text-center text-white">
        <div className="max-w-md">
          <div className="text-[10px] font-semibold text-white/70">No playable governed EDL exists yet</div>
          <div className="mt-1 text-[8px] leading-4 text-white/40">Review waits for timeline entries with real source media and source ranges.</div>
        </div>
      </div>
    );
  }

  const progress = totalDuration > 0 ? clamp((finite(value) / totalDuration) * 100, 0, 100) : 0;
  const frameNumber = Math.max(0, Math.round(finite(value) * frameRate));

  return (
    <div className="flex min-h-[430px] flex-col bg-[#171614] text-white">
      <div className="flex min-h-[360px] flex-1 items-center justify-center bg-black/25">
        <video
          key={`${activeSegment.key}:${activeIndex}`}
          ref={videoRef}
          src={activeSegment.url}
          preload="auto"
          playsInline
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onVideoTimeUpdate}
          onEnded={() => moveToSegment(activeIndex + 1)}
          onPlay={() => setPlaying(true)}
          onPause={() => {
            if (!shouldPlayRef.current) setPlaying(false);
          }}
          className="max-h-[680px] w-full object-contain"
        />
        {nextSegment ? (
          <video src={nextSegment.url} preload="metadata" muted playsInline className="hidden" aria-hidden="true" />
        ) : null}
      </div>

      <div className="border-t border-white/10 bg-[#1D1B18] px-3 py-3">
        <div className="relative mb-2 h-5">
          <input
            aria-label="Review playhead"
            type="range"
            min="0"
            max={Math.max(totalDuration, frameDuration)}
            step={frameDuration}
            value={clamp(finite(value), 0, Math.max(totalDuration, frameDuration))}
            onChange={(event) => {
              const nextValue = finite(event.target.value, 0);
              seekGlobal(nextValue, { preservePlayback: playing });
            }}
            className="absolute inset-x-0 top-1 z-10 h-2 w-full cursor-pointer accent-[#D5B16D]"
          />
          <div className="pointer-events-none absolute inset-x-1 top-0 h-4">
            {markerItems.map((marker) => (
              <span
                key={marker.id}
                title={`${timecode(marker.time)} · ${marker.body}`}
                className={`absolute top-0 h-2 w-0.5 -translate-x-1/2 rounded ${marker.resolved ? "bg-emerald-300/70" : "bg-amber-300"}`}
                style={{ left: `${totalDuration ? (marker.time / totalDuration) * 100 : 0}%` }}
              />
            ))}
          </div>
          <div className="pointer-events-none absolute bottom-0 left-0 h-px bg-[#D5B16D]/35" style={{ width: `${progress}%` }} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => stepFrame(-1)} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]" title="Previous frame"><SkipBack size={10} /></button>
            <button type="button" onClick={playing ? pause : play} className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#D5B16D] text-[#17130D]" title={playing ? "Pause" : "Play"}>{playing ? <Pause size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}</button>
            <button type="button" onClick={() => stepFrame(1)} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]" title="Next frame"><SkipForward size={10} /></button>
            <div className="ml-2 text-[9px] font-semibold tabular-nums text-white/80">{timecode(value)}</div>
            <div className="text-[7px] tabular-nums text-white/35">F{frameNumber} · {frameRate.toFixed(frameRate % 1 ? 2 : 0)} fps</div>
          </div>

          <div className="flex items-center gap-2 text-[7px] text-white/45">
            <span>Cut {activeIndex + 1}/{segments.length}</span>
            <span>source {timecode(activeSegment.source_in_seconds)}–{timecode(activeSegment.source_out_seconds)}</span>
            <select
              aria-label="Playback speed"
              value={rate}
              onChange={(event) => onRateChange(finite(event.target.value, 1))}
              className="h-7 rounded-md border border-white/10 bg-white/[0.04] px-2 text-[7px] text-white/70 outline-none"
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((valueOption) => (
                <option key={valueOption} value={valueOption} className="bg-[#1D1B18]">{valueOption}×</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
