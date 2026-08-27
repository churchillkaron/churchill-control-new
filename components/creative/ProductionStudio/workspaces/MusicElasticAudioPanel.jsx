"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, RotateCcw, ShieldCheck, Sparkles, Trash2, Waves } from "lucide-react";

function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function blocker(value) { return String(value || "").replace(/^AVANTIQO_MUSIC_ELASTIC_/, "").replaceAll("_", " "); }

export default function MusicElasticAudioPanel({ organizationId, projectId }) {
  const [payload, setPayload] = useState(null);
  const [trackId, setTrackId] = useState("");
  const [clipId, setClipId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [division, setDivision] = useState("1/16");
  const [strength, setStrength] = useState(0.55);
  const [sensitivity, setSensitivity] = useState(0.62);
  const [maxShift, setMaxShift] = useState(90);
  const [readiness, setReadiness] = useState(null);

  async function load() {
    if (!organizationId || !projectId) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/creative/music/multitrack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "load", organization_id: organizationId, creative_project_id: projectId }) });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "Workstation could not load");
      setPayload(body);
      const tracks = (body.session?.tracks || []).filter((track) => track.clips?.length);
      const selectedTrack = tracks.find((track) => track.id === trackId) || tracks[0] || null;
      setTrackId(selectedTrack?.id || "");
      const selectedClip = selectedTrack?.clips?.find((clip) => clip.id === clipId) || selectedTrack?.clips?.[0] || null;
      setClipId(selectedClip?.id || "");
    } catch (cause) { setError(cause?.message || "Workstation could not load"); }
    finally { setBusy(false); }
  }

  async function loadReadiness() {
    if (!organizationId) return;
    try {
      const response = await fetch("/api/creative/music/elastic-audio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "readiness", organization_id: organizationId }) });
      const body = await response.json();
      setReadiness(response.ok && body.success !== false ? body.readiness || null : null);
    } catch { setReadiness(null); }
  }

  useEffect(() => { void Promise.all([load(), loadReadiness()]); }, [organizationId, projectId]);
  const session = payload?.session || null;
  const track = session?.tracks?.find((entry) => entry.id === trackId) || null;
  const clip = track?.clips?.find((entry) => entry.id === clipId) || null;
  useEffect(() => { if (track && !track.clips?.some((entry) => entry.id === clipId)) setClipId(track.clips?.[0]?.id || ""); }, [trackId]);

  const plan = clip?.elastic_audio?.warp_plan || null;
  const request = clip?.elastic_audio?.render_request || null;
  const applied = clip?.elastic_audio?.applied || null;
  const actionable = useMemo(() => (plan?.markers || []).filter((marker) => marker.eligible === true && Math.abs(finite(marker.proposed_shift_ms)) >= 2), [plan]);
  const approved = actionable.filter((marker) => marker.approved === true).length;
  const pending = request?.status === "PENDING";
  const completed = request?.status === "COMPLETED_PENDING_APPLY" && Boolean(request?.derived_asset_id || clip?.elastic_audio?.render_asset_id);
  const isApplied = request?.status === "APPLIED" && Boolean(applied?.derived_asset_id);

  async function action(name, extra = {}) {
    if (!clip || busy) return;
    setBusy(true); setError(""); setStatus(name.toUpperCase());
    try {
      const response = await fetch("/api/creative/music/elastic-audio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: name, organization_id: organizationId, creative_project_id: projectId, track_id: trackId, clip_id: clipId, expected_revision: session.revision || 0, division, strength, sensitivity, max_shift_ms: maxShift, ...extra }) });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "Elastic Audio failed");
      setStatus(body.pending ? "RENDER PENDING" : "UPDATED");
      await Promise.all([load(), loadReadiness()]);
    } catch (cause) { setError(cause?.message || "Elastic Audio failed"); setStatus("BLOCKED"); }
    finally { setBusy(false); }
  }

  return <section className="mx-auto max-w-[1500px] p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-[#d6a66a]/70"><Waves className="h-4 w-4" /> Elastic Audio</div><div className="mt-1 text-lg font-medium text-white/78">Transient-aware pitch-preserving timing</div><div className="mt-1 text-[9px] text-white/25">Analyze → review every move → governed 24-bit render → explicit musician apply. Original audio always remains recoverable.</div></div><div className={`rounded-lg border px-2 py-1 text-[7px] ${readiness?.ready ? "border-emerald-300/15 text-emerald-100/50" : "border-white/7 text-white/25"}`}>{readiness?.ready ? "RENDER READY" : blocker(readiness?.blocker || "ANALYSIS ONLY")}</div></div>

    <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[7px] text-white/22"><div className="mb-1 uppercase">Track</div><select disabled={busy} value={trackId} onChange={(event) => setTrackId(event.target.value)} className="min-w-44 rounded border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45">{(session?.tracks || []).filter((entry) => entry.clips?.length).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
        <label className="text-[7px] text-white/22"><div className="mb-1 uppercase">Clip</div><select disabled={busy} value={clipId} onChange={(event) => setClipId(event.target.value)} className="min-w-36 rounded border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45">{(track?.clips || []).map((entry) => <option key={entry.id} value={entry.id}>{entry.id.slice(0, 8)}</option>)}</select></label>
        <label className="text-[7px] text-white/22"><div className="mb-1 uppercase">Grid</div><select disabled={busy || pending || completed || isApplied} value={division} onChange={(event) => setDivision(event.target.value)} className="rounded border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45">{["1/4", "1/8", "1/16", "1/32"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="text-[7px] text-white/22"><div className="mb-1 uppercase">Sensitivity</div><input disabled={busy || pending || completed || isApplied} type="number" min="0.1" max="1" step=".05" value={sensitivity} onChange={(event) => setSensitivity(Math.max(.1, Math.min(1, finite(event.target.value, .62))))} className="w-20 rounded border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45" /></label>
        <label className="text-[7px] text-white/22"><div className="mb-1 uppercase">Strength</div><input disabled={busy || pending || completed || isApplied} type="number" min="0" max="1" step=".05" value={strength} onChange={(event) => setStrength(Math.max(0, Math.min(1, finite(event.target.value, .55))))} className="w-20 rounded border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45" /></label>
        <label className="text-[7px] text-white/22"><div className="mb-1 uppercase">Max ms</div><input disabled={busy || pending || completed || isApplied} type="number" min="5" max="250" value={maxShift} onChange={(event) => setMaxShift(Math.max(5, Math.min(250, finite(event.target.value, 90))))} className="w-20 rounded border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45" /></label>
        {!isApplied && !pending && !completed ? <button disabled={!clip || busy} onClick={() => void action("analyze")} className="rounded border border-[#d6a66a]/20 bg-[#d6a66a]/[.05] px-3 py-2 text-[8px] text-[#efd29f]/65 disabled:opacity-20">{plan ? "Re-analyze" : "Analyze transients"}</button> : null}
      </div>

      {plan && !isApplied ? <>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[7px] text-white/22"><span>{plan.markers?.length || 0} transients</span><span>{approved}/{actionable.length} proposed moves approved</span><span>render ready {plan.render_ready ? "yes" : "no"}</span></div>
        <div className="mt-2 max-h-[420px] overflow-y-auto rounded-xl border border-white/7 bg-black/20 p-2">{actionable.length ? actionable.slice(0, 128).map((marker) => <div key={marker.id} className="grid grid-cols-[70px_75px_90px_1fr_auto] items-center gap-2 border-b border-white/[.05] px-2 py-1.5 text-[7px]"><span className="text-white/30">{finite(marker.source_seconds).toFixed(3)}s</span><span className="text-white/25">{finite(marker.proposed_shift_ms) > 0 ? "+" : ""}{finite(marker.proposed_shift_ms).toFixed(1)} ms</span><input disabled={busy || pending || completed} type="number" min="0" max={plan.duration_seconds} step=".001" value={finite(marker.target_seconds)} onChange={(event) => void action("review_marker", { marker_id: marker.id, approved: marker.approved === true, target_seconds: finite(event.target.value, marker.target_seconds) })} className="rounded border border-white/7 bg-black/25 px-1 py-1 text-[7px] text-white/38 disabled:opacity-20"/><span className="truncate text-white/18">{marker.safety_reason}</span><button disabled={busy || pending || completed} onClick={() => void action("review_marker", { marker_id: marker.id, approved: marker.approved !== true })} className={`rounded border px-2 py-1 disabled:opacity-15 ${marker.approved ? "border-emerald-300/20 text-emerald-100/50" : "border-white/8 text-white/28"}`}>{marker.approved ? "Approved" : "Approve"}</button></div>) : <div className="px-2 py-3 text-[8px] text-white/24">No safe moves are needed with this analysis. Change grid/strength and analyze again if desired.</div>}</div>
        <div className="mt-2 flex flex-wrap gap-2">{actionable.length > approved && !pending && !completed ? <button disabled={busy} onClick={() => void action("review_all", { approved: true })} className="inline-flex items-center gap-1 rounded border border-emerald-300/15 px-2.5 py-1.5 text-[7px] text-emerald-100/45"><Check className="h-3 w-3"/> Approve all safe moves</button> : null}{!pending && !completed ? <button disabled={busy} onClick={() => void action("clear")} className="inline-flex items-center gap-1 rounded border border-white/8 px-2.5 py-1.5 text-[7px] text-white/25"><Trash2 className="h-3 w-3"/> Clear plan</button> : null}</div>
        {plan.render_ready && !pending && !completed ? <div className="mt-3 rounded-xl border border-[#d6a66a]/14 bg-[#d6a66a]/[.025] p-3"><div className="flex items-center gap-2 text-[8px] text-[#efd29f]/55"><ShieldCheck className="h-3.5 w-3.5"/> Reviewed warp ready for render</div><div className="mt-1 text-[7px] text-white/18">Rendering uses the governed owned service. It cannot run until certification, organization service and production pricing are ready.</div><button disabled={busy || readiness?.ready !== true} onClick={() => void action("submit_render")} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded border border-[#d6a66a]/20 px-3 py-2 text-[8px] text-[#efd29f]/60 disabled:opacity-20"><Sparkles className="h-3.5 w-3.5"/> Render 24-bit elastic audio</button>{readiness?.ready !== true ? <div className="mt-2 text-[7px] text-amber-100/40">Blocked: {blocker(readiness?.blocker || "CERTIFICATION OR PRICING NOT READY")}</div> : null}</div> : null}
        {pending ? <div className="mt-3 rounded-xl border border-white/7 bg-black/20 p-3"><div className="text-[8px] text-white/35">Elastic render is pending. The source clip is unchanged.</div><button disabled={busy} onClick={() => void action("render_status", { request_id: request.id })} className="mt-2 w-full rounded border border-white/8 px-3 py-2 text-[8px] text-white/35">Check render status</button></div> : null}
        {completed ? <div className="mt-3 rounded-xl border border-emerald-300/12 bg-emerald-300/[.02] p-3"><div className="text-[8px] text-emerald-100/50">Render complete — original source still active.</div><div className="mt-1 text-[7px] text-white/18">Listen/review, then explicitly apply. Applying creates a reversible source-lineage step.</div><button disabled={busy} onClick={() => void action("apply_render")} className="mt-2 w-full rounded border border-emerald-300/18 px-3 py-2 text-[8px] text-emerald-100/55">Apply reviewed render to clip</button></div> : null}
      </> : null}

      {isApplied ? <div className="mt-3 rounded-xl border border-emerald-300/12 bg-emerald-300/[.02] p-3"><div className="flex items-center gap-2 text-[8px] text-emerald-100/50"><ShieldCheck className="h-3.5 w-3.5"/> Elastic render applied</div><div className="mt-1 text-[7px] text-white/18">The derived 24-bit source is active; original asset, offset and duration are preserved.</div><button disabled={busy} onClick={() => void action("revert_render")} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded border border-white/8 px-3 py-2 text-[8px] text-white/35"><RotateCcw className="h-3.5 w-3.5"/> Revert to original source</button></div> : null}
      {status ? <div className="mt-2 text-[7px] uppercase tracking-[.12em] text-white/18">{status}</div> : null}
      {error ? <div className="mt-2 rounded-lg border border-red-300/10 bg-red-400/[.02] px-3 py-2 text-[8px] text-red-100/50">{error}</div> : null}
      <div className="mt-3 text-[7px] leading-3 text-white/14">Static audits do not certify DSP listening quality. Elastic rendering stays fail-closed until its dedicated owned renderer is certified and priced.</div>
    </div>
  </section>;
}
