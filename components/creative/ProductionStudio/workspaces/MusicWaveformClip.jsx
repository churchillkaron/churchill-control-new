"use client";

import { useEffect, useMemo, useState } from "react";

const AUDIO_BUFFER_CACHE = new Map();
const PEAK_CACHE = new Map();

async function decodedAudio(url) {
  if (AUDIO_BUFFER_CACHE.has(url)) return AUDIO_BUFFER_CACHE.get(url);
  const promise = (async () => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`CREATIVE_MUSIC_WAVEFORM_FETCH_${response.status}`);
    const bytes = await response.arrayBuffer();
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) throw new Error("CREATIVE_MUSIC_WAVEFORM_AUDIO_CONTEXT_UNAVAILABLE");
    const context = new AudioContextClass({ latencyHint: "playback" });
    try {
      return await context.decodeAudioData(bytes.slice(0));
    } finally {
      await context.close().catch(() => {});
    }
  })();
  AUDIO_BUFFER_CACHE.set(url, promise);
  try {
    return await promise;
  } catch (error) {
    AUDIO_BUFFER_CACHE.delete(url);
    throw error;
  }
}

function samplePeaks(buffer, { sourceOffsetSeconds, durationSeconds, columns }) {
  const offsetFrames = Math.max(0, Math.floor(sourceOffsetSeconds * buffer.sampleRate));
  const requestedFrames = Math.max(1, Math.floor(durationSeconds * buffer.sampleRate));
  const endFrame = Math.min(buffer.length, offsetFrames + requestedFrames);
  const available = Math.max(1, endFrame - offsetFrames);
  const channelCount = Math.max(1, buffer.numberOfChannels);
  const data = Array.from({ length: channelCount }, (_, channel) => buffer.getChannelData(channel));
  const peaks = [];
  for (let column = 0; column < columns; column += 1) {
    const start = offsetFrames + Math.floor((column / columns) * available);
    const end = offsetFrames + Math.max(1, Math.floor(((column + 1) / columns) * available));
    let peak = 0;
    for (let frame = start; frame < Math.min(end, endFrame); frame += 1) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        peak = Math.max(peak, Math.abs(data[channel]?.[frame] || 0));
      }
    }
    peaks.push(Math.min(1, peak));
  }
  return peaks;
}

export default function MusicWaveformClip({
  url,
  sourceOffsetSeconds = 0,
  durationSeconds = 0,
  columns = 96,
  className = "",
}) {
  const [peaks, setPeaks] = useState([]);
  const [failed, setFailed] = useState(false);
  const safeColumns = Math.max(16, Math.min(240, Math.round(Number(columns) || 96)));
  const cacheKey = useMemo(
    () => `${url || ""}|${Number(sourceOffsetSeconds || 0).toFixed(3)}|${Number(durationSeconds || 0).toFixed(3)}|${safeColumns}`,
    [url, sourceOffsetSeconds, durationSeconds, safeColumns],
  );

  useEffect(() => {
    let cancelled = false;
    if (!url || Number(durationSeconds) <= 0) {
      setPeaks([]);
      return () => { cancelled = true; };
    }
    setFailed(false);
    const cached = PEAK_CACHE.get(cacheKey);
    if (cached) {
      setPeaks(cached);
      return () => { cancelled = true; };
    }
    decodedAudio(url)
      .then((buffer) => samplePeaks(buffer, {
        sourceOffsetSeconds: Math.max(0, Number(sourceOffsetSeconds) || 0),
        durationSeconds: Math.max(0.001, Number(durationSeconds) || 0.001),
        columns: safeColumns,
      }))
      .then((next) => {
        PEAK_CACHE.set(cacheKey, next);
        if (!cancelled) setPeaks(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [url, sourceOffsetSeconds, durationSeconds, safeColumns, cacheKey]);

  if (!peaks.length) {
    return <div aria-hidden="true" className={`h-full w-full ${className}`}><div className="relative top-1/2 h-px w-full -translate-y-1/2 bg-current opacity-20" />{failed ? <div className="absolute inset-0 flex items-center justify-center text-[7px] opacity-30">waveform unavailable</div> : null}</div>;
  }

  return (
    <svg aria-hidden="true" className={`h-full w-full ${className}`} viewBox={`0 0 ${peaks.length} 100`} preserveAspectRatio="none">
      {peaks.map((peak, index) => {
        const height = Math.max(1.5, peak * 92);
        return <line key={index} x1={index + 0.5} x2={index + 0.5} y1={(100 - height) / 2} y2={(100 + height) / 2} stroke="currentColor" strokeWidth="0.72" opacity="0.72" />;
      })}
    </svg>
  );
}

export function clearMusicWaveformCache() {
  AUDIO_BUFFER_CACHE.clear();
  PEAK_CACHE.clear();
}
