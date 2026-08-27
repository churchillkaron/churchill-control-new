"use client";

import { useEffect, useRef, useState } from "react";
import { CircleStop, Drum, Layers3, Play, Trash2, Upload } from "lucide-react";
import { startMusicSamplerPreview } from "@/lib/creative/music/client/MusicSamplerEngine";

const PAD_PITCHES = [36, 38, 39, 42, 46, 41, 43, 45, 49, 51];

function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, finite(value, min))); }

export default function MusicSamplerPanel({ organizationId, projectId, session, disabled = false, onReload }) {
  const [sampler, setSampler] = useState(null);
  const [sampleUrls, setSampleUrls] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploadingPitch, setUploadingPitch] = useState(null);
  const [uploadingMode, setUploadingMode] = useState(null);
  const previewRef = useRef(null);

  async function request(action, extra = {}) {
    const response = await fetch("/api/creative/music/sampler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, organization_id: organizationId, creative_project_id: projectId, ...extra }),
    });
    const body = await response.json();
    if (!response.ok || body.success === false) throw new Error(body.error || "Sampler request failed");
    if (body.sampler) setSampler(body.sampler);
    if (body.sample_urls) setSampleUrls(body.sample_urls);
    return body;
  }

  async function load() {
    if (!organizationId || !projectId) return;
    setBusy(true); setError("");
    try { await request("load"); } catch (cause) { setError(cause?.message || "Sampler could not load"); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, [organizationId, projectId]);
  useEffect(() => () => { previewRef.current?.stop?.(); }, []);

  const selectedKit = sampler?.kits?.find((kit) => kit.id === sampler.selected_kit_id) || sampler?.kits?.[0] || null;
  const drumTrack = session?.midi?.tracks?.find((track) => track.instrument?.kind === "drum_machine") || null;
  const drumClip = drumTrack?.clips?.find((clip) => clip.drum_pattern?.contract === "AVANTIQO_MUSIC_MIDI_DRUM_PATTERN_V1") || null;

  async function stopPreview() {
    const active = previewRef.current;
    previewRef.current = null;
    if (active?.stop) await active.stop();
  }

  async function previewNotes(notes) {
    if (!selectedKit || !notes?.length) return;
    setError("");
    try {
      await stopPreview();
      previewRef.current = await startMusicSamplerPreview({
        kit: selectedKit,
        notes,
        sampleUrls,
        bpm: session?.bpm || 120,
        onEnded: () => { previewRef.current = null; },
      });
    } catch (cause) { setError(cause?.message || "Sampler preview failed"); }
  }

  async function uploadAndRegister(file) {
    const target = await request("prepare_upload", {
      file_name: file.name,
      size_bytes: file.size,
      content_type: file.type || "audio/wav",
    });
    const uploaded = await fetch(target.upload_url, {
      method: "PUT",
      headers: { "Content-Type": file.type || "audio/wav" },
      body: file,
    });
    if (!uploaded.ok) throw new Error(`Sampler upload failed (${uploaded.status})`);
    return request("register_sample", {
      storage_reference: target.storage_reference,
      file_name: file.name,
      title: file.name.replace(/\.[^.]+$/, ""),
      source_rights_confirmed: true,
    });
  }

  async function uploadSample(file, midiPitch, mode = "replace") {
    if (!file || disabled || busy || !selectedKit) return;
    setBusy(true); setUploadingPitch(midiPitch); setUploadingMode(mode); setError("");
    try {
      const registered = await uploadAndRegister(file);
      if (mode === "layer") {
        const pad = selectedKit.pads.find((entry) => entry.midi_pitch === midiPitch);
        const layerCount = pad?.layers?.length || 0;
        await request("assign_layer", {
          kit_id: selectedKit.id,
          midi_pitch: midiPitch,
          sample_asset_id: registered.asset.id,
          layer: {
            velocity_min: 1,
            velocity_max: 127,
            round_robin_group: "default",
            round_robin_index: layerCount,
            enabled: true,
          },
        });
      } else {
        await request("assign_sample", {
          kit_id: selectedKit.id,
          midi_pitch: midiPitch,
          sample_asset_id: registered.asset.id,
        });
      }
      await onReload?.();
    } catch (cause) { setError(cause?.message || "Sample could not be loaded"); }
    finally { setBusy(false); setUploadingPitch(null); setUploadingMode(null); }
  }

  async function updatePad(midiPitch, patch) {
    if (!selectedKit || busy) return;
    setBusy(true); setError("");
    try { await request("update_pad", { kit_id: selectedKit.id, midi_pitch: midiPitch, pad: patch }); }
    catch (cause) { setError(cause?.message || "Pad could not update"); }
    finally { setBusy(false); }
  }

  async function updateLayer(pad, layerId, patch) {
    const layers = (pad.layers || []).map((layer) => layer.id === layerId ? { ...layer, ...patch } : layer);
    await updatePad(pad.midi_pitch, { layers });
  }

  async function removeLayer(pad, layerId) {
    if (!selectedKit || busy) return;
    setBusy(true); setError("");
    try {
      await request("remove_layer", { kit_id: selectedKit.id, midi_pitch: pad.midi_pitch, layer_id: layerId });
      await onReload?.();
    } catch (cause) { setError(cause?.message || "Sampler layer could not be removed"); }
    finally { setBusy(false); }
  }

  if (!sampler || !selectedKit) return <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.018] p-4 text-[8px] text-white/25">{busy ? "Loading sampler…" : "Sampler unavailable."}</div>;

  return (
    <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#d6a66a]/65"><Drum className="h-3.5 w-3.5" /> Sampler & Drum Rack V2</div>
          <div className="mt-1 text-[8px] leading-4 text-white/24">Real user-owned samples · velocity layers · round-robin · immutable sources. Trim, tune, gain, pan, reverse and choke remain non-destructive playback settings.</div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={disabled || busy || !drumClip?.notes?.length} onClick={() => void previewNotes(drumClip.notes)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#d6a66a]/20 bg-[#d6a66a]/[0.05] px-2.5 py-1.5 text-[8px] text-[#efd29f]/70 disabled:opacity-20"><Play className="h-3 w-3" /> Play pattern</button>
          <button type="button" disabled={!previewRef.current} onClick={() => void stopPreview()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/8 px-2.5 py-1.5 text-[8px] text-white/35 disabled:opacity-20"><CircleStop className="h-3 w-3" /> Stop</button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {PAD_PITCHES.map((midiPitch) => {
          const pad = selectedKit.pads.find((entry) => entry.midi_pitch === midiPitch);
          if (!pad) return null;
          const layers = pad.layers || [];
          const hasSample = layers.some((layer) => Boolean(layer.sample_asset_id && sampleUrls[layer.sample_asset_id])) || Boolean(pad.sample_asset_id && sampleUrls[pad.sample_asset_id]);
          return <div key={pad.id} className="rounded-xl border border-white/7 bg-black/20 p-2.5">
            <button type="button" disabled={!hasSample || busy} onClick={() => void previewNotes([{ pitch: midiPitch, start_beat: 0, duration_beats: 0.25, velocity: 112 }])} className={`w-full rounded-lg border px-2 py-3 text-left disabled:opacity-35 ${hasSample ? "border-[#d6a66a]/20 bg-[#d6a66a]/[0.05]" : "border-white/7 bg-white/[0.015]"}`}>
              <div className="text-[8px] font-medium text-white/55">{pad.name}</div>
              <div className="mt-1 truncate text-[7px] text-white/20">{layers.length ? `${layers.length} layer${layers.length === 1 ? "" : "s"}` : `MIDI ${midiPitch} · empty`}</div>
            </button>

            <div className="mt-2 grid grid-cols-2 gap-1">
              <label className="flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-white/7 px-2 py-1.5 text-[7px] text-white/30">
                <Upload className="h-3 w-3" /> {uploadingPitch === midiPitch && uploadingMode === "replace" ? "Loading…" : "Replace"}
                <input type="file" accept="audio/*,.wav,.flac,.mp3,.m4a,.aac,.ogg,.opus" disabled={disabled || busy} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadSample(file, midiPitch, "replace"); }} />
              </label>
              <label className="flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-[#d6a66a]/15 px-2 py-1.5 text-[7px] text-[#efd29f]/45">
                <Layers3 className="h-3 w-3" /> {uploadingPitch === midiPitch && uploadingMode === "layer" ? "Loading…" : "Add layer"}
                <input type="file" accept="audio/*,.wav,.flac,.mp3,.m4a,.aac,.ogg,.opus" disabled={disabled || busy} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadSample(file, midiPitch, "layer"); }} />
              </label>
            </div>

            {layers.length ? <div className="mt-2 space-y-1.5 rounded-lg border border-white/[0.055] bg-black/25 p-1.5">
              {layers.map((layer, layerIndex) => <div key={layer.id} className="rounded-md border border-white/[0.05] bg-white/[0.01] p-1.5">
                <div className="flex items-center justify-between gap-1"><span className="min-w-0 truncate text-[6px] text-white/35">L{layerIndex + 1} · {layer.sample_name || "Sample"}</span><button type="button" disabled={disabled || busy} onClick={() => void removeLayer(pad, layer.id)} className="rounded border border-white/7 p-0.5 text-white/20 disabled:opacity-20"><Trash2 className="h-2.5 w-2.5" /></button></div>
                <div className="mt-1 grid grid-cols-3 gap-1 text-[5px] text-white/18">
                  <label>Vel min<input disabled={disabled || busy} type="number" min="1" max="127" value={finite(layer.velocity_min,1)} onChange={(event) => void updateLayer(pad,layer.id,{velocity_min:Math.round(clamp(event.target.value,1,finite(layer.velocity_max,127)))})} className="mt-0.5 w-full rounded border border-white/7 bg-black/25 px-1 py-0.5 text-[6px] text-white/38" /></label>
                  <label>Vel max<input disabled={disabled || busy} type="number" min="1" max="127" value={finite(layer.velocity_max,127)} onChange={(event) => void updateLayer(pad,layer.id,{velocity_max:Math.round(clamp(event.target.value,finite(layer.velocity_min,1),127))})} className="mt-0.5 w-full rounded border border-white/7 bg-black/25 px-1 py-0.5 text-[6px] text-white/38" /></label>
                  <label>RR #<input disabled={disabled || busy} type="number" min="0" max="99" value={finite(layer.round_robin_index,layerIndex)} onChange={(event) => void updateLayer(pad,layer.id,{round_robin_index:Math.max(0,Math.round(finite(event.target.value,0)))})} className="mt-0.5 w-full rounded border border-white/7 bg-black/25 px-1 py-0.5 text-[6px] text-white/38" /></label>
                </div>
              </div>)}
            </div> : null}

            <div className="mt-2 grid grid-cols-2 gap-1 text-[6px] text-white/18">
              <label>Gain dB<input disabled={disabled || busy} type="number" min="-60" max="18" step="0.5" value={finite(pad.gain_db,0)} onChange={(event) => void updatePad(midiPitch,{gain_db:Number(event.target.value)})} className="mt-0.5 w-full rounded border border-white/7 bg-black/25 px-1 py-1 text-[7px] text-white/40" /></label>
              <label>Tune<input disabled={disabled || busy} type="number" min="-24" max="24" step="0.1" value={finite(pad.tune_semitones,0)} onChange={(event) => void updatePad(midiPitch,{tune_semitones:Number(event.target.value)})} className="mt-0.5 w-full rounded border border-white/7 bg-black/25 px-1 py-1 text-[7px] text-white/40" /></label>
              <label>Pan<input disabled={disabled || busy} type="number" min="-1" max="1" step="0.05" value={finite(pad.pan,0)} onChange={(event) => void updatePad(midiPitch,{pan:Number(event.target.value)})} className="mt-0.5 w-full rounded border border-white/7 bg-black/25 px-1 py-1 text-[7px] text-white/40" /></label>
              <label>Release ms<input disabled={disabled || busy} type="number" min="0" max="10000" value={finite(pad.release_ms,80)} onChange={(event) => void updatePad(midiPitch,{release_ms:Number(event.target.value)})} className="mt-0.5 w-full rounded border border-white/7 bg-black/25 px-1 py-1 text-[7px] text-white/40" /></label>
            </div>
            <div className="mt-2 flex flex-wrap gap-1 text-[7px]">
              <button type="button" disabled={disabled || busy} onClick={() => void updatePad(midiPitch,{reverse:pad.reverse!==true})} className={`rounded border px-1.5 py-1 ${pad.reverse ? "border-[#d6a66a]/25 text-[#efd29f]/60" : "border-white/7 text-white/25"}`}>Reverse</button>
              <button type="button" disabled={disabled || busy} onClick={() => void updatePad(midiPitch,{choke_group:pad.choke_group?null:"hihat"})} className={`rounded border px-1.5 py-1 ${pad.choke_group ? "border-[#d6a66a]/25 text-[#efd29f]/60" : "border-white/7 text-white/25"}`}>Choke</button>
              <button type="button" disabled={disabled || busy} onClick={() => void updatePad(midiPitch,{round_robin_enabled:pad.round_robin_enabled===false})} className={`rounded border px-1.5 py-1 ${pad.round_robin_enabled !== false ? "border-emerald-300/15 text-emerald-100/40" : "border-white/7 text-white/25"}`}>Round-robin</button>
            </div>
          </div>;
        })}
      </div>
      <div className="mt-2 text-[7px] text-white/15">Sampler V2 is local WebAudio with no provider job. Velocity selects eligible layers; repeated hits rotate deterministic round-robin variants. Original sample files are never rewritten.</div>
      {error ? <div className="mt-2 rounded-lg border border-red-300/10 bg-red-400/[0.02] px-2 py-1.5 text-[7px] text-red-100/55">{error}</div> : null}
    </div>
  );
}
