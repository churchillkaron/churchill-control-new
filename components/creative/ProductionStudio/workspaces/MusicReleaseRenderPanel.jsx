"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Disc3, ShieldCheck, TriangleAlert } from "lucide-react";

import { renderMusicMultitrackOffline } from "@/lib/creative/music/client/MusicOfflineMixRenderRuntime";
import MusicStemExportPanel from "./MusicStemExportPanel";

const PROFILES = [
  ["streaming", "Streaming", "-14 LUFS · -1 dBTP"],
  ["club", "Club", "-9 LUFS · -0.8 dBTP"],
  ["broadcast", "Broadcast", "-16 LUFS · -1 dBTP"],
];

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export default function MusicReleaseRenderPanel({
  organizationId,
  projectId,
  session,
  assetUrls,
  disabled = false,
  onReleased,
}) {
  const [profile, setProfile] = useState("streaming");
  const [releaseMp3, setReleaseMp3] = useState(true);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const revision = Math.max(0, Math.round(finite(session?.revision, 0)));
  const options = useMemo(() => ({ mastering: { profile }, release_mp3: releaseMp3, track_stems: true, group_stems: true }), [profile, releaseMp3]);

  async function request(payload) {
    const response = await fetch("/api/creative/music/release-render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok || body.success === false) throw new Error(body.error || "Music release request failed");
    return body;
  }

  async function refreshPlan() {
    if (!organizationId || !projectId || !session) return;
    setError("");
    try {
      const response = await request({ action: "plan", organization_id: organizationId, creative_project_id: projectId, options });
      setPlan(response.plan || null);
    } catch (cause) {
      setError(cause?.message || "Release plan could not be prepared.");
    }
  }

  useEffect(() => {
    void refreshPlan();
  }, [organizationId, projectId, revision, profile, releaseMp3]);

  async function renderAndMaster() {
    if (!session || busy || disabled) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setStatus("CHECKING RELEASE PLAN");
      const planned = await request({ action: "plan", organization_id: organizationId, creative_project_id: projectId, options });
      const currentPlan = planned.plan;
      setPlan(currentPlan);
      if (!currentPlan?.readiness?.release_render_ready) {
        const codes = (currentPlan?.readiness?.blockers || []).map((item) => item.code).join(", ") || "NOT READY";
        throw new Error(`Release blocked: ${codes}`);
      }

      setStatus("OFFLINE RENDERING FULL MIX");
      const rendered = await renderMusicMultitrackOffline({ session, assetUrls, expectedDurationSeconds: currentPlan.duration_seconds });

      const safeTitle = String(session.title || "music")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "music";
      const fileName = `${safeTitle}-premaster-r${revision}.wav`;

      setStatus("PREPARING SECURE UPLOAD");
      const target = await request({
        action: "prepare_upload",
        organization_id: organizationId,
        creative_project_id: projectId,
        expected_revision: revision,
        file_name: fileName,
        size_bytes: rendered.blob.size,
        options,
      });
      if (target.render_plan_fingerprint !== planned.render_plan_fingerprint) throw new Error("CREATIVE_MUSIC_RELEASE_PLAN_CHANGED_BEFORE_UPLOAD");

      setStatus("UPLOADING 24-BIT PRE-MASTER");
      const upload = await fetch(target.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "audio/wav" },
        body: rendered.blob,
      });
      if (!upload.ok) throw new Error(`CREATIVE_MUSIC_RELEASE_UPLOAD_${upload.status}`);

      setStatus("REGISTERING MIX LINEAGE");
      const registered = await request({
        action: "register",
        organization_id: organizationId,
        creative_project_id: projectId,
        expected_revision: revision,
        render_plan_fingerprint: target.render_plan_fingerprint,
        storage_reference: target.storage_reference,
        file_name: fileName,
        title: `${session.title || "Music Project"} — Pre-master`,
        source_asset_ids: currentPlan.source_asset_ids,
        program_duration_seconds: rendered.program_duration_seconds,
        render_duration_seconds: rendered.render_duration_seconds,
        sample_rate: rendered.sample_rate,
        channels: rendered.channels,
        levels: rendered.levels,
        offline_render_contract: rendered.contract,
        options,
      });

      setStatus("MASTERING + TRUE-PEAK QC");
      const mastered = await request({
        action: "finish",
        organization_id: organizationId,
        creative_project_id: projectId,
        mix_asset_id: registered.asset_id,
        options,
      });
      setResult(mastered);
      setStatus("RELEASE MASTER CERTIFIED");
      await onReleased?.(mastered);
    } catch (cause) {
      setError(cause?.message || "Release render failed.");
      setStatus("RELEASE BLOCKED");
    } finally {
      setBusy(false);
    }
  }

  const ready = plan?.readiness?.release_render_ready === true;
  const blockers = plan?.readiness?.blockers || [];

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#d6a66a]/65"><Disc3 className="h-3.5 w-3.5" /> Release render</div>
          <div className="mt-1 text-[8px] leading-4 text-white/22">Same Music mix graph offline → immutable 24-bit pre-master → local loudness / true-peak finishing.</div>
        </div>
        <div className={`rounded-lg border px-2 py-1 text-[8px] ${ready ? "border-emerald-300/15 text-emerald-100/55" : "border-amber-300/15 text-amber-100/55"}`}>{ready ? "READY" : "CHECK"}</div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block"><div className="mb-1 text-[8px] uppercase tracking-[0.14em] text-white/22">Master profile</div><select disabled={disabled || busy} value={profile} onChange={(event) => setProfile(event.target.value)} className="w-full rounded-lg border border-white/8 bg-[#0a0a0a] px-2 py-2 text-[9px] text-white/55 disabled:opacity-25">{PROFILES.map(([id, label, detail]) => <option key={id} value={id}>{label} · {detail}</option>)}</select></label>
        <label className="flex items-center gap-2 self-end rounded-lg border border-white/7 px-3 py-2 text-[9px] text-white/38"><input type="checkbox" disabled={disabled || busy} checked={releaseMp3} onChange={(event) => setReleaseMp3(event.target.checked)} className="accent-[#d6a66a]" /> 320k MP3 + WAV</label>
      </div>

      {blockers.length ? <div className="mt-3 rounded-xl border border-amber-300/12 bg-amber-300/[0.02] p-3"><div className="flex items-center gap-2 text-[9px] text-amber-100/65"><TriangleAlert className="h-3.5 w-3.5" /> Release blockers</div><div className="mt-2 space-y-1">{blockers.map((item, index) => <div key={`${item.code}-${index}`} className="text-[8px] leading-4 text-white/28"><span className="text-amber-100/50">{item.code}</span> — {item.message}</div>)}</div></div> : null}

      {plan ? <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg border border-white/6 p-2"><div className="text-[7px] uppercase text-white/18">Sources</div><div className="mt-1 text-[10px] text-white/45">{plan.source_asset_ids?.length || 0}</div></div><div className="rounded-lg border border-white/6 p-2"><div className="text-[7px] uppercase text-white/18">Duration</div><div className="mt-1 text-[10px] text-white/45">{finite(plan.duration_seconds, 0).toFixed(1)}s</div></div><div className="rounded-lg border border-white/6 p-2"><div className="text-[7px] uppercase text-white/18">Revision</div><div className="mt-1 text-[10px] text-white/45">{plan.project_revision}</div></div></div> : null}

      <button type="button" disabled={disabled || busy || !ready} onClick={renderAndMaster} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#d6a66a]/30 bg-[#d6a66a]/10 px-4 py-3 text-[10px] font-medium text-[#efd29f] disabled:opacity-25"><ShieldCheck className="h-4 w-4" /> {busy ? status || "WORKING" : "Render + certify release master"}</button>

      {result ? <div className="mt-3 rounded-xl border border-emerald-300/12 bg-emerald-300/[0.025] p-3"><div className="flex items-center gap-2 text-[9px] text-emerald-100/65"><CheckCircle2 className="h-3.5 w-3.5" /> Certified release candidate</div><div className="mt-2 grid grid-cols-2 gap-2 text-[8px] text-white/30"><div>LUFS {Number.isFinite(result.integrated_lufs) ? result.integrated_lufs.toFixed(1) : "certified"}</div><div>True peak {Number.isFinite(result.true_peak_dbtp) ? `${result.true_peak_dbtp.toFixed(2)} dBTP` : "certified"}</div><div>Deliveries {result.deliveries?.length || 0}</div><div>Master asset saved</div></div></div> : null}
      {error ? <div className="mt-3 rounded-xl border border-red-300/12 bg-red-400/[0.025] px-3 py-2 text-[8px] leading-4 text-red-100/65">{error}</div> : null}

      {plan ? <div className="mt-4"><MusicStemExportPanel
        organizationId={organizationId}
        projectId={projectId}
        session={session}
        assetUrls={assetUrls}
        plan={plan}
        disabled={disabled || busy || !ready}
      /></div> : null}

      <div className="mt-3 text-[7px] leading-3 text-white/15">No provider generation is used. Original takes/assets remain immutable. Release masters alone receive final limiter/loudness and true-peak certification. Track/group stems are 24-bit pre-Master engineering exports; Instrumental/Acapella preserve the mix graph but remain un-limited derived alternates unless separately mastered.</div>
    </div>
  );
}
