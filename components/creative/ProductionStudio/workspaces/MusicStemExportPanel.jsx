"use client";

import { useMemo, useState } from "react";
import { Layers3, Mic2, Music2, Split } from "lucide-react";

import {
  renderMusicGroupStemOffline,
  renderMusicTrackStemOffline,
  renderMusicVariantMixOffline,
} from "@/lib/creative/music/client/MusicOfflineStemRenderRuntime";

function safeFile(value) {
  return String(value || "music-stem")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "music-stem";
}

export default function MusicStemExportPanel({
  organizationId,
  projectId,
  session,
  assetUrls,
  plan,
  disabled = false,
}) {
  const tracks = useMemo(() => (session?.tracks || []).filter((track) => track.mute !== true), [session]);
  const groups = useMemo(() => (session?.buses || []).filter((bus) => bus.type === "group" && bus.mute !== true), [session]);
  const [trackId, setTrackId] = useState(tracks[0]?.id || "");
  const [groupId, setGroupId] = useState(groups[0]?.id || "");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [lastExport, setLastExport] = useState(null);

  const revision = Math.max(0, Math.round(Number(session?.revision) || 0));
  const stemOptions = useMemo(() => ({ mastering: plan?.master?.mastering || { profile: "streaming" }, release_mp3: false, track_stems: true, group_stems: true }), [plan]);

  async function request(payload) {
    const response = await fetch("/api/creative/music/stem-render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok || body.success === false) throw new Error(body.error || "Stem render request failed");
    return body;
  }

  async function exportStem(kind, targetId, label) {
    if (disabled || busy) return;
    setBusy(kind);
    setError("");
    setLastExport(null);
    try {
      setStatus(`RENDERING ${label.toUpperCase()}`);
      let rendered;
      if (kind === "TRACK_STEM") {
        rendered = await renderMusicTrackStemOffline({ session, assetUrls, trackId: targetId, expectedDurationSeconds: plan?.duration_seconds });
      } else if (kind === "GROUP_STEM") {
        rendered = await renderMusicGroupStemOffline({ session, assetUrls, groupId: targetId, expectedDurationSeconds: plan?.duration_seconds });
      } else {
        rendered = await renderMusicVariantMixOffline({ session, assetUrls, variant: kind === "ACAPELLA" ? "acapella" : "instrumental", expectedDurationSeconds: plan?.duration_seconds });
      }
      const fileName = `${safeFile(session?.title)}-${safeFile(label)}-r${revision}.wav`;
      setStatus("PREPARING STEM UPLOAD");
      const target = await request({
        action: "prepare_upload",
        organization_id: organizationId,
        creative_project_id: projectId,
        expected_revision: revision,
        render_kind: kind,
        target_id: targetId,
        file_name: fileName,
        size_bytes: rendered.blob.size,
        options: stemOptions,
      });
      setStatus("UPLOADING 24-BIT STEM");
      const upload = await fetch(target.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "audio/wav" },
        body: rendered.blob,
      });
      if (!upload.ok) throw new Error(`CREATIVE_MUSIC_STEM_UPLOAD_${upload.status}`);
      setStatus("REGISTERING STEM LINEAGE");
      const registered = await request({
        action: "register",
        organization_id: organizationId,
        creative_project_id: projectId,
        expected_revision: revision,
        render_kind: kind,
        target_id: targetId,
        render_plan_fingerprint: target.render_plan_fingerprint,
        storage_reference: target.storage_reference,
        file_name: fileName,
        title: `${session?.title || "Music Project"} — ${label}`,
        source_asset_ids: target.stem.source_asset_ids,
        render_duration_seconds: rendered.render_duration_seconds,
        sample_rate: rendered.sample_rate,
        channels: rendered.channels,
        levels: rendered.levels,
        options: stemOptions,
      });
      setLastExport({ ...registered, label });
      setStatus(`${label.toUpperCase()} SAVED`);
    } catch (cause) {
      setError(cause?.message || "Stem export failed.");
      setStatus("STEM EXPORT BLOCKED");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="rounded-xl border border-white/7 bg-black/15 p-3">
      <div className="flex items-center justify-between gap-3">
        <div><div className="flex items-center gap-2 text-[9px] font-medium text-white/45"><Split className="h-3.5 w-3.5" /> Stem & alternate exports</div><div className="mt-1 text-[7px] leading-3 text-white/17">24-bit derived assets · no release limiter · originals preserved</div></div>
        {busy ? <div className="text-[7px] text-[#efd29f]/55">{status}</div> : null}
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <select disabled={disabled || Boolean(busy) || !tracks.length} value={tracks.some((track) => track.id === trackId) ? trackId : tracks[0]?.id || ""} onChange={(event) => setTrackId(event.target.value)} className="min-w-0 rounded-lg border border-white/7 bg-[#0a0a0a] px-2 py-2 text-[8px] text-white/45 disabled:opacity-25">{tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}</select>
        <button type="button" disabled={disabled || Boolean(busy) || !tracks.length} onClick={() => { const id = tracks.some((track) => track.id === trackId) ? trackId : tracks[0]?.id; const track = tracks.find((entry) => entry.id === id); void exportStem("TRACK_STEM", id, `${track?.name || "Track"} Stem`); }} className="rounded-lg border border-white/8 px-3 py-2 text-[8px] text-white/42 disabled:opacity-25">Track stem</button>
      </div>

      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
        <select disabled={disabled || Boolean(busy) || !groups.length} value={groups.some((group) => group.id === groupId) ? groupId : groups[0]?.id || ""} onChange={(event) => setGroupId(event.target.value)} className="min-w-0 rounded-lg border border-white/7 bg-[#0a0a0a] px-2 py-2 text-[8px] text-white/45 disabled:opacity-25">{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
        <button type="button" disabled={disabled || Boolean(busy) || !groups.length} onClick={() => { const id = groups.some((group) => group.id === groupId) ? groupId : groups[0]?.id; const group = groups.find((entry) => entry.id === id); void exportStem("GROUP_STEM", id, `${group?.name || "Group"} Stem`); }} className="rounded-lg border border-white/8 px-3 py-2 text-[8px] text-white/42 disabled:opacity-25">Group stem</button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" disabled={disabled || Boolean(busy) || !tracks.some((track) => track.type !== "vocal")} onClick={() => exportStem("INSTRUMENTAL", "instrumental", "Instrumental")} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/8 px-3 py-2 text-[8px] text-white/42 disabled:opacity-25"><Music2 className="h-3 w-3" /> Instrumental</button>
        <button type="button" disabled={disabled || Boolean(busy) || !tracks.some((track) => track.type === "vocal")} onClick={() => exportStem("ACAPELLA", "acapella", "Acapella")} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/8 px-3 py-2 text-[8px] text-white/42 disabled:opacity-25"><Mic2 className="h-3 w-3" /> Acapella</button>
      </div>

      {lastExport ? <div className="mt-2 flex items-center gap-2 text-[8px] text-emerald-100/50"><Layers3 className="h-3 w-3" /> {lastExport.label} saved as a derived 24-bit Music asset.</div> : null}
      {error ? <div className="mt-2 text-[8px] leading-4 text-red-100/60">{error}</div> : null}
    </div>
  );
}
