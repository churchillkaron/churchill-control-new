"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Disc3, Headphones, Layers3, Play, Plus, Scissors, Square, Star } from "lucide-react";

import { renderMusicCompToWav24 } from "@/lib/creative/music/client/MusicCompRender";
import {
  applyMusicCompToTrack,
  buildMusicComp,
} from "@/lib/creative/music/runtime/CreativeMusicCompingRuntime";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatTime(seconds) {
  const safe = Math.max(0, finite(seconds, 0));
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
}

export default function MusicTakeLaneCompPanel({
  track,
  assetUrls,
  disabled = false,
  onChange,
  organizationId = null,
  projectId = null,
  sessionRevision = 0,
  sampleRate = 48000,
  onRendered,
}) {
  const takes = Array.isArray(track?.takes) ? track.takes : [];
  const [selectedTakeId, setSelectedTakeId] = useState(takes[0]?.id || "");
  const [regionStart, setRegionStart] = useState(takes[0]?.start_seconds || 0);
  const [regionEnd, setRegionEnd] = useState(
    takes[0] ? finite(takes[0].start_seconds, 0) + finite(takes[0].duration_seconds, 0) : 1,
  );
  const [regions, setRegions] = useState(track?.comp?.regions || []);
  const [error, setError] = useState("");
  const [auditioning, setAuditioning] = useState("");
  const [rendering, setRendering] = useState(false);
  const [renderStatus, setRenderStatus] = useState("");
  const audioRef = useRef(null);

  useEffect(() => {
    setRegions(track?.comp?.regions || []);
    if (!takes.some((take) => take.id === selectedTakeId)) {
      const first = takes[0];
      setSelectedTakeId(first?.id || "");
      setRegionStart(first?.start_seconds || 0);
      setRegionEnd(first ? finite(first.start_seconds, 0) + finite(first.duration_seconds, 0) : 1);
    }
  }, [track?.id, track?.comp?.id, takes.length]);

  useEffect(() => () => {
    audioRef.current?.pause?.();
    audioRef.current = null;
  }, []);

  const selectedTake = useMemo(
    () => takes.find((take) => take.id === selectedTakeId) || takes[0] || null,
    [takes, selectedTakeId],
  );

  function stopAudition() {
    audioRef.current?.pause?.();
    audioRef.current = null;
    setAuditioning("");
  }

  function audition(take) {
    if (auditioning === take.id) {
      stopAudition();
      return;
    }
    stopAudition();
    const url = assetUrls?.[take.source_asset_id];
    if (!url) {
      setError("Take playback URL is unavailable.");
      return;
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    setAuditioning(take.id);
    audio.onended = stopAudition;
    audio.onerror = () => {
      setError("Take audition failed.");
      stopAudition();
    };
    void audio.play();
  }

  function rateTake(takeId, rating) {
    const next = structuredClone(track);
    const take = next.takes.find((entry) => entry.id === takeId);
    if (!take) return;
    take.rating = rating;
    onChange?.(next);
  }

  function selectTake(takeId) {
    const take = takes.find((entry) => entry.id === takeId);
    setSelectedTakeId(takeId);
    if (take) {
      setRegionStart(finite(take.start_seconds, 0));
      setRegionEnd(finite(take.start_seconds, 0) + finite(take.duration_seconds, 0));
    }
  }

  function addRegion() {
    setError("");
    if (!selectedTake) return;
    const start = Math.max(finite(selectedTake.start_seconds, 0), finite(regionStart, 0));
    const takeEnd = finite(selectedTake.start_seconds, 0) + finite(selectedTake.duration_seconds, 0);
    const end = Math.min(takeEnd, Math.max(start + 0.01, finite(regionEnd, start + 0.01)));
    const sourceOffset = Math.max(0, start - finite(selectedTake.start_seconds, 0));
    const nextRegion = {
      take_id: selectedTake.id,
      source_asset_id: selectedTake.source_asset_id,
      start_seconds: start,
      end_seconds: end,
      source_offset_seconds: sourceOffset,
      gain_db: 0,
      fade_in_seconds: 0.01,
      fade_out_seconds: 0.01,
    };
    const next = [...regions, nextRegion].sort((a, b) => a.start_seconds - b.start_seconds);
    for (let index = 1; index < next.length; index += 1) {
      if (next[index].start_seconds < next[index - 1].end_seconds) {
        setError("Comp regions cannot overlap. Trim or remove the neighbouring region first.");
        return;
      }
    }
    setRegions(next);
  }

  function removeRegion(index) {
    setRegions((current) => current.filter((_, regionIndex) => regionIndex !== index));
  }

  function buildComp() {
    setError("");
    setRenderStatus("");
    try {
      const comp = buildMusicComp({
        track_id: track.id,
        name: `${track.name || "Track"} Comp`,
        regions,
        crossfade_default_seconds: 0.015,
      });
      const nextTrack = applyMusicCompToTrack(structuredClone(track), comp);
      onChange?.(nextTrack);
    } catch (cause) {
      setError(cause?.message || "Comp could not be built.");
    }
  }

  function chooseWholeTake(take) {
    const start = finite(take.start_seconds, 0);
    const end = start + finite(take.duration_seconds, 0);
    setRegions([{
      take_id: take.id,
      source_asset_id: take.source_asset_id,
      start_seconds: start,
      end_seconds: end,
      source_offset_seconds: 0,
      gain_db: 0,
      fade_in_seconds: 0.01,
      fade_out_seconds: 0.01,
    }]);
    setSelectedTakeId(take.id);
  }

  async function compRequest(payload) {
    const response = await fetch("/api/creative/music/comp-render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok || body.success === false) throw new Error(body.error || "Comp render request failed");
    return body;
  }

  async function renderComp() {
    if (!track?.comp || !organizationId || !projectId || rendering) return;
    setError("");
    setRendering(true);
    setRenderStatus("RENDERING DRY COMP");
    try {
      const rendered = await renderMusicCompToWav24({
        track,
        assetUrls,
        sampleRate,
      });
      const safeTrack = String(track.name || "track-comp")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "track-comp";
      const fileName = `${safeTrack}-comp.wav`;
      setRenderStatus("UPLOADING 24-BIT COMP");
      const target = await compRequest({
        action: "prepare_upload",
        organization_id: organizationId,
        creative_project_id: projectId,
        file_name: fileName,
        size_bytes: rendered.blob.size,
      });
      const upload = await fetch(target.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "audio/wav" },
        body: rendered.blob,
      });
      if (!upload.ok) throw new Error(`CREATIVE_MUSIC_COMP_RENDER_UPLOAD_${upload.status}`);

      setRenderStatus("REGISTERING DERIVED ASSET");
      const registered = await compRequest({
        action: "register",
        organization_id: organizationId,
        creative_project_id: projectId,
        track_id: track.id,
        comp_id: track.comp.id,
        expected_revision: sessionRevision,
        storage_reference: target.storage_reference,
        file_name: fileName,
        title: `${track.name || "Track"} Comp`,
        duration_seconds: rendered.duration_seconds,
        sample_rate: rendered.sample_rate,
        channels: rendered.channels,
        source_take_ids: rendered.source_take_ids,
        source_asset_ids: rendered.source_asset_ids,
      });
      setRenderStatus("24-BIT COMP SAVED");
      await onRendered?.(registered);
    } catch (cause) {
      setError(cause?.message || "Comp could not be rendered.");
      setRenderStatus("RENDER FAILED");
    } finally {
      setRendering(false);
    }
  }

  if (!track) return null;

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#d6a66a]/65"><Layers3 className="h-3.5 w-3.5" /> Take lanes & comp</div>
          <div className="mt-1 text-xs text-white/42">{takes.length} immutable take{takes.length === 1 ? "" : "s"}</div>
        </div>
        {track.comp ? <div className="flex items-center gap-1 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.03] px-2 py-1 text-[9px] text-emerald-100/55"><Check className="h-3 w-3" /> COMP</div> : null}
      </div>

      {!takes.length ? <div className="mt-4 rounded-xl border border-dashed border-white/8 px-3 py-5 text-center text-[10px] text-white/22">Record two or more passes to start comping.</div> : (
        <div className="mt-4 space-y-2">
          {takes.map((take, index) => (
            <div key={take.id} className={`rounded-xl border p-3 ${selectedTakeId === take.id ? "border-[#d6a66a]/22 bg-[#d6a66a]/[0.035]" : "border-white/7 bg-black/15"}`}>
              <div className="flex items-center gap-2">
                <button type="button" disabled={disabled} onClick={() => selectTake(take.id)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-[10px] font-medium text-white/58">Take {index + 1}</div>
                  <div className="mt-1 text-[8px] text-white/22">{formatTime(take.start_seconds)} · {formatTime(take.duration_seconds)}</div>
                </button>
                <button type="button" disabled={disabled} onClick={() => audition(take)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 text-white/45 disabled:opacity-25">{auditioning === take.id ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}</button>
                <button type="button" disabled={disabled} onClick={() => chooseWholeTake(take)} className="rounded-lg border border-white/8 px-2 py-1.5 text-[8px] text-white/38 disabled:opacity-25">Use all</button>
              </div>
              <div className="mt-2 flex items-center gap-1">
                {Array.from({ length: 5 }, (_, rating) => (
                  <button key={rating} type="button" disabled={disabled} onClick={() => rateTake(take.id, rating + 1)} className="disabled:opacity-25">
                    <Star className={`h-3 w-3 ${finite(take.rating, 0) >= rating + 1 ? "fill-current text-[#d6a66a]/70" : "text-white/15"}`} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {takes.length ? <>
        <div className="mt-4 border-t border-white/7 pt-4">
          <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-white/28"><Scissors className="h-3.5 w-3.5" /> Add comp region</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <select disabled={disabled} value={selectedTakeId} onChange={(event) => selectTake(event.target.value)} className="rounded-lg border border-white/8 bg-[#0a0a0a] px-2 py-2 text-[10px] text-white/55 disabled:opacity-25">{takes.map((take, index) => <option key={take.id} value={take.id}>Take {index + 1}</option>)}</select>
            <input disabled={disabled} type="number" step="0.01" value={regionStart} onChange={(event) => setRegionStart(finite(event.target.value, 0))} className="rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[10px] text-white/55 disabled:opacity-25" />
            <input disabled={disabled} type="number" step="0.01" value={regionEnd} onChange={(event) => setRegionEnd(finite(event.target.value, 1))} className="rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[10px] text-white/55 disabled:opacity-25" />
          </div>
          <button type="button" disabled={disabled} onClick={addRegion} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-white/8 px-3 py-2 text-[9px] text-white/45 disabled:opacity-25"><Plus className="h-3 w-3" /> Add selected region</button>
        </div>

        <div className="mt-4 space-y-1.5">
          {regions.map((region, index) => {
            const takeIndex = takes.findIndex((take) => take.id === region.take_id);
            return <div key={region.id || `${region.take_id}-${region.start_seconds}-${index}`} className="flex items-center gap-2 rounded-lg border border-white/7 bg-black/20 px-2 py-2 text-[9px] text-white/36"><span className="min-w-12 text-[#d6a66a]/60">Take {takeIndex + 1}</span><span className="flex-1">{formatTime(region.start_seconds)} → {formatTime(region.end_seconds)}</span><button type="button" disabled={disabled} onClick={() => removeRegion(index)} className="text-white/25 hover:text-red-100 disabled:opacity-25">×</button></div>;
          })}
          {!regions.length ? <div className="text-[9px] text-white/18">No comp regions yet.</div> : null}
        </div>

        <button type="button" disabled={disabled || !regions.length} onClick={buildComp} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#d6a66a]/25 bg-[#d6a66a]/[0.07] px-3 py-2.5 text-[10px] font-medium text-[#efd29f]/75 disabled:opacity-25"><Headphones className="h-3.5 w-3.5" /> Build non-destructive comp</button>

        {track.comp ? <button type="button" disabled={disabled || rendering || !organizationId || !projectId} onClick={renderComp} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.035] px-3 py-2.5 text-[10px] font-medium text-emerald-100/65 disabled:opacity-25"><Disc3 className="h-3.5 w-3.5" /> {rendering ? renderStatus || "Rendering…" : track.comp.rendered_asset_id ? "Render new 24-bit comp version" : "Render 24-bit comp asset"}</button> : null}
        {track.comp?.rendered_asset_id ? <div className="mt-2 text-center text-[8px] text-emerald-100/35">Derived comp asset saved · mixer processing remains live/non-destructive</div> : null}
      </> : null}

      {renderStatus && !rendering ? <div className="mt-2 text-center text-[8px] text-white/25">{renderStatus}</div> : null}
      {error ? <div className="mt-3 text-[9px] leading-4 text-red-100/65">{error}</div> : null}
      <div className="mt-3 text-[8px] leading-4 text-white/18">Comp regions reference immutable source takes. Render creates a new dry 24-bit derived asset; EQ/compression/fader remain editable in the mixer and source recordings are never modified.</div>
    </div>
  );
}