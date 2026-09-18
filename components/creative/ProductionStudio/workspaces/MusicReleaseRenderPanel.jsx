"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Disc3, ShieldCheck, TriangleAlert } from "lucide-react";

import { renderMusicMultitrackOffline } from "@/lib/creative/music/client/MusicOfflineMixRenderRuntime";
import { renderMusicSurroundPremasterOffline } from "@/lib/creative/music/client/MusicOfflineSurroundRenderRuntime";
import MusicStemExportPanel from "./MusicStemExportPanel";
import { audioPostSessionHasLanguageRoles, buildAudioPostLanguageSession } from "@/lib/creative/music/runtime/CreativeAudioPostVersionRuntime";
import { listProfessionalAudioDeliveryProfiles } from "@/lib/creative/music/runtime/CreativeProfessionalAudioDeliveryProfileRuntime";

const DELIVERY_PROFILES = listProfessionalAudioDeliveryProfiles();

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
  const [professionalRelease, setProfessionalRelease] = useState(null);
  const [deliveryLanguage, setDeliveryLanguage] = useState("en");
  const [deliveryProfileId, setDeliveryProfileId] = useState(session?.picture_lock?.picture_lock_digest ? "picture_post" : "music_release");
  const [deliveryTargetLufs, setDeliveryTargetLufs] = useState("");
  const [deliveryTruePeak, setDeliveryTruePeak] = useState("");
  const [longFormPlan, setLongFormPlan] = useState(null);
  const [longFormWorker, setLongFormWorker] = useState(null);
  const [longFormJob, setLongFormJob] = useState(null);
  const [longFormBusy, setLongFormBusy] = useState(false);

  const revision = Math.max(0, Math.round(finite(session?.revision, 0)));
  const languageVersioned = audioPostSessionHasLanguageRoles(session || {});
  const renderSession = useMemo(() => languageVersioned ? buildAudioPostLanguageSession(session || {}, deliveryLanguage) : session, [session, languageVersioned, deliveryLanguage]);
  const explicitDeliveryTarget = ["broadcast_handoff","cinema_handoff"].includes(deliveryProfileId);
  const options = useMemo(() => ({ mastering: { profile, ...(explicitDeliveryTarget && deliveryTargetLufs !== "" ? { target_lufs: Number(deliveryTargetLufs) } : {}), ...(explicitDeliveryTarget && deliveryTruePeak !== "" ? { true_peak_dbtp: Number(deliveryTruePeak) } : {}) }, delivery_profile: deliveryProfileId, release_mp3: releaseMp3, track_stems: true, group_stems: true }), [profile, deliveryProfileId, explicitDeliveryTarget, deliveryTargetLufs, deliveryTruePeak, releaseMp3]);

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

  async function surroundValidationRequest(payload) {
    const response = await fetch("/api/creative/music/surround-validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok || body.success === false) throw new Error(body.error || `Surround validation failed: ${(body.validation?.failures || []).join(", ") || "TECHNICAL QC"}`);
    return body;
  }

  async function surroundFinishRequest(payload) {
    const response = await fetch("/api/creative/music/surround-finish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok || body.success === false) throw new Error(body.error || "Surround finishing failed");
    return body;
  }

  async function professionalRequest(payload) {
    const response = await fetch("/api/creative/music/professional-release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok || body.success === false) throw new Error(body.error || "Professional Release request failed");
    return body;
  }

  async function refreshPlan() {
    if (!organizationId || !projectId || !session) return;
    setError("");
    try {
      const [response, professional] = await Promise.all([
        request({ action: "plan", organization_id: organizationId, creative_project_id: projectId, delivery_language: languageVersioned ? deliveryLanguage : null, options }),
        professionalRequest({ action: "status", organization_id: organizationId, creative_project_id: projectId }).catch(() => null),
      ]);
      const nextPlan=response.plan||null; setPlan(nextPlan);
      setProfessionalRelease(professional?.active ? professional : null);
      if(nextPlan?.long_form_delivery?.server_render_required){const lf=await fetch("/api/creative/music/long-form-render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"plan",organization_id:organizationId,creative_project_id:projectId,delivery_language:languageVersioned?deliveryLanguage:null,options})}).then(r=>r.json());setLongFormPlan(lf.long_form_plan||null);setLongFormWorker(lf.worker||null);}else{setLongFormPlan(null);setLongFormWorker(null);}
    } catch (cause) {
      setError(cause?.message || "Release plan could not be prepared.");
    }
  }

  useEffect(() => {
    void refreshPlan();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, projectId, revision, profile, deliveryProfileId, deliveryTargetLufs, deliveryTruePeak, releaseMp3, deliveryLanguage]);

  async function startLongFormRender() {
    if(!longFormWorker?.ready||longFormBusy)return; setLongFormBusy(true); setError("");
    try{const response=await fetch("/api/creative/music/long-form-render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"start",organization_id:organizationId,creative_project_id:projectId,delivery_language:languageVersioned?deliveryLanguage:null,options})}),body=await response.json();if(!response.ok||body.success===false)throw new Error(body.error||"Long-form render could not start");setLongFormJob({job_id:body.job_id,job_hash:body.job_hash,status:body.worker_response?.status||"SUBMITTED",progress_percent:body.worker_response?.progress_percent??0});}catch(cause){setError(cause?.message||"Long-form render could not start");}finally{setLongFormBusy(false);}
  }

  useEffect(() => {
    if (!longFormJob?.job_id || !longFormJob?.job_hash || ["COMPLETED", "FAILED"].includes(longFormJob.status)) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/creative/music/long-form-render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", organization_id: organizationId, creative_project_id: projectId, delivery_language: languageVersioned ? deliveryLanguage : null, options, job_id: longFormJob.job_id, job_hash: longFormJob.job_hash }) });
        const body = await response.json();
        if (!response.ok || body.success === false) throw new Error(body.error || "Long-form render status failed");
        if (cancelled) return;
        const result = body.result || {};
        const next = { ...longFormJob, status: result.status || longFormJob.status, status_detail: result.status_detail || null, progress_percent: result.progress_percent ?? longFormJob.progress_percent, asset_id: result.asset_id || result.output?.asset_id || null, storage_reference: result.storage_reference || result.output?.storage_reference || null, error: result.error || null };
        setLongFormJob(next);
        if (next.status === "COMPLETED" && next.asset_id) { setStatus("LONG-FORM PRE-MASTER REGISTERED"); await onReleased?.({ long_form: true, ...next }); }
        if (next.status === "FAILED") setError(next.error || "Long-form render failed");
      } catch (cause) { if (!cancelled) setError(cause?.message || "Long-form render status failed"); }
    }, 2000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [longFormJob, organizationId, projectId, deliveryLanguage, languageVersioned, options, onReleased]);

  async function renderAndMaster() {
    if (!session || busy || disabled) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setStatus("CHECKING RELEASE PLAN");
      const planned = await request({ action: "plan", organization_id: organizationId, creative_project_id: projectId, delivery_language: languageVersioned ? deliveryLanguage : null, options });
      const currentPlan = planned.plan;
      setPlan(currentPlan);
      if (!currentPlan?.readiness?.release_render_ready) {
        const codes = (currentPlan?.readiness?.blockers || []).map((item) => item.code).join(", ") || "NOT READY";
        throw new Error(`Release blocked: ${codes}`);
      }

      const surround = currentPlan?.spatial_audio?.surround_enabled === true;
      setStatus(surround ? `OFFLINE RENDERING ${currentPlan.channel_layout} PRE-MASTER` : "OFFLINE RENDERING FULL MIX");
      const rendered = surround
        ? await renderMusicSurroundPremasterOffline({ session: renderSession, assetUrls, expectedDurationSeconds: currentPlan.duration_seconds })
        : await renderMusicMultitrackOffline({ session: renderSession, assetUrls, expectedDurationSeconds: currentPlan.duration_seconds });

      const safeTitle = String(session.title || "music")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "music";
      const languageSuffix = languageVersioned ? `-${deliveryLanguage.toLowerCase()}` : "";
      const fileName = `${safeTitle}${languageSuffix}-premaster-r${revision}.wav`;

      setStatus("PREPARING SECURE UPLOAD");
      const target = await request({
        action: "prepare_upload",
        organization_id: organizationId,
        creative_project_id: projectId,
        delivery_language: languageVersioned ? deliveryLanguage : null,
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
        delivery_language: languageVersioned ? deliveryLanguage : null,
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

      if (currentPlan?.spatial_audio?.surround_enabled === true) {
        setStatus(`${rendered.channel_layout} SERVER QC · CHANNELS / LFE / DOWNMIX`);
        const technical = await surroundValidationRequest({ organization_id: organizationId, creative_project_id: projectId, asset_id: registered.asset_id });
        setStatus(`${rendered.channel_layout} MASTERING · TWO-PASS LOUDNESS / TRUE PEAK`);
        const finished = await surroundFinishRequest({ organization_id: organizationId, creative_project_id: projectId, premaster_asset_id: registered.asset_id, delivery_language: languageVersioned ? deliveryLanguage : null, options });
        const surroundResult = { ...registered, ...finished, surround_premaster: false, surround_master: true, channel_layout: rendered.channel_layout, channels: rendered.channels, speaker_order: rendered.speaker_order, stereo_downmix_qc: rendered.stereo_downmix_qc, per_speaker_levels: rendered.per_speaker_levels, premaster_surround_validation: technical.validation, surround_validation: finished.surround_validation, surround_validation_passed: finished.surround_validation?.passed === true, dolby_branded: false };
        setResult(surroundResult);
        setStatus(`${rendered.channel_layout} SURROUND MASTER · QC PASS`);
        await onReleased?.(surroundResult);
      } else if (professionalRelease?.active) {
        if (professionalRelease?.next_stage?.stage_id !== "MIX_ENGINEERING") {
          throw new Error(`Professional Release is at ${professionalRelease?.next_stage?.stage_id || "another stage"}; mastering must continue through the Professional Release gate.`);
        }
        setStatus("ACCEPTING PROFESSIONAL PRE-MASTER");
        const accepted = await professionalRequest({
          action: "continue",
          organization_id: organizationId,
          creative_project_id: projectId,
          source_asset_id: professionalRelease.source_asset_id,
          authorized_stage: "MIX_ENGINEERING",
          mix_asset_id: registered.asset_id,
        });
        const professionalResult = { ...accepted, mix_asset_id: registered.asset_id, professional_release: true };
        setResult(professionalResult);
        setProfessionalRelease(accepted?.active ? accepted : { ...professionalRelease, ...accepted });
        setStatus("PRE-MASTER REGISTERED · QC NEXT");
        await onReleased?.(professionalResult);
      } else {
        setStatus("MASTERING + TRUE-PEAK QC");
        const mastered = await request({
          action: "finish",
          organization_id: organizationId,
          creative_project_id: projectId,
          delivery_language: languageVersioned ? deliveryLanguage : null,
          mix_asset_id: registered.asset_id,
          options,
        });
        setResult(mastered);
        setStatus("RELEASE MASTER CERTIFIED");
        await onReleased?.(mastered);
      }
    } catch (cause) {
      setError(cause?.message || "Release render failed.");
      setStatus("RELEASE BLOCKED");
    } finally {
      setBusy(false);
    }
  }

  const professionalStage = professionalRelease?.next_stage?.stage_id || null;
  const professionalMixStage = professionalRelease?.active === true && professionalStage === "MIX_ENGINEERING";
  const professionalLocked = professionalRelease?.active === true && !professionalMixStage;
  const ready = plan?.readiness?.release_render_ready === true && !professionalLocked;
  const blockers = plan?.readiness?.blockers || [];

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#d6a66a]/65"><Disc3 className="h-3.5 w-3.5" /> Release render</div>
          <div className="mt-1 text-[8px] leading-4 text-white/22">{plan?.spatial_audio?.surround_enabled ? `${plan.channel_layout} discrete surround: exact speaker render → stereo downmix QC → multichannel finishing. Dolby branding remains off until a licensed Dolby toolchain is present.` : professionalRelease?.active ? "Professional Release: same mix graph offline → immutable 24-bit pre-master → separate QC/mastering gates." : "Same Music mix graph offline → immutable 24-bit pre-master → local loudness / true-peak finishing."}</div>
        </div>
        <div className={`rounded-lg border px-2 py-1 text-[8px] ${ready ? "border-emerald-300/15 text-emerald-100/55" : "border-amber-300/15 text-amber-100/55"}`}>{ready ? "READY" : "CHECK"}</div>
      </div>

      {languageVersioned ? <div className="mt-4 rounded-xl border border-[#d6a66a]/12 bg-[#d6a66a]/[0.02] p-3"><label className="flex items-center justify-between gap-3 text-[8px] uppercase tracking-[0.13em] text-[#efd29f]/50"><span>Full Mix language version</span><input value={deliveryLanguage} onChange={e=>setDeliveryLanguage(e.target.value.trim().toLowerCase())} className="w-24 rounded-lg border border-white/8 bg-black/25 px-2 py-1.5 text-[9px] normal-case tracking-normal text-white/55"/></label><div className="mt-1 text-[7px] text-white/18">Only DX / VO / ADR clips matching this language enter the Full Mix. M&E/common sound remains shared.</div></div> : null}

      <div className="mt-4 rounded-xl border border-white/7 bg-black/15 p-3"><label className="block"><div className="mb-1 text-[8px] uppercase tracking-[0.14em] text-white/22">Delivery profile</div><select disabled={disabled || busy} value={deliveryProfileId} onChange={e=>setDeliveryProfileId(e.target.value)} className="w-full rounded-lg border border-white/8 bg-[#0a0a0a] px-2 py-2 text-[9px] text-white/55">{DELIVERY_PROFILES.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><div className="mt-2 text-[7px] text-white/18">{plan?.delivery_profile ? `${plan.delivery_profile.label} · ${plan.delivery_profile.bwf_required ? "BWF required" : "BWF optional"} · ${plan.delivery_profile.required_sample_rate ? `${plan.delivery_profile.required_sample_rate/1000} kHz` : "session sample rate"} · ${plan.delivery_profile.allowed_layouts.join(" / ")}` : "Select a handoff contract."}</div>{explicitDeliveryTarget ? <div className="mt-3 grid grid-cols-2 gap-2"><label><div className="mb-1 text-[7px] uppercase tracking-[0.12em] text-white/18">Target LUFS</div><input type="number" step="0.1" value={deliveryTargetLufs} onChange={e=>setDeliveryTargetLufs(e.target.value)} placeholder="required" className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-1.5 text-[9px] text-white/55"/></label><label><div className="mb-1 text-[7px] uppercase tracking-[0.12em] text-white/18">True peak dBTP</div><input type="number" step="0.1" value={deliveryTruePeak} onChange={e=>setDeliveryTruePeak(e.target.value)} placeholder="required" className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-1.5 text-[9px] text-white/55"/></label><div className="col-span-2 text-[7px] text-amber-100/35">Broadcast/Cinema targets are explicit delivery requirements; Avantiqo does not silently assume one global regional standard.</div></div> : null}</div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block"><div className="mb-1 text-[8px] uppercase tracking-[0.14em] text-white/22">Master profile</div><select disabled={disabled || busy} value={profile} onChange={(event) => setProfile(event.target.value)} className="w-full rounded-lg border border-white/8 bg-[#0a0a0a] px-2 py-2 text-[9px] text-white/55 disabled:opacity-25">{PROFILES.map(([id, label, detail]) => <option key={id} value={id}>{label} · {detail}</option>)}</select></label>
        <label className="flex items-center gap-2 self-end rounded-lg border border-white/7 px-3 py-2 text-[9px] text-white/38"><input type="checkbox" disabled={disabled || busy} checked={releaseMp3} onChange={(event) => setReleaseMp3(event.target.checked)} className="accent-[#d6a66a]" /> 320k MP3 + WAV</label>
      </div>

      {longFormPlan ? <div className="mt-3 rounded-xl border border-[#d6a66a]/14 bg-[#d6a66a]/[0.025] p-3"><div className="flex items-center justify-between gap-3"><div><div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#efd29f]/55">Long-form server render</div><div className="mt-1 text-[8px] text-white/26">{longFormPlan.chunk_count} chunks · {longFormPlan.chunk_body_seconds}s bodies · {longFormPlan.context_seconds}s DSP context · {longFormPlan.rf64_auto?"RF64 auto":"RIFF"}</div></div><div className={`rounded-full border px-2 py-1 text-[7px] ${longFormWorker?.ready?"border-emerald-300/15 text-emerald-100/55":"border-amber-300/15 text-amber-100/55"}`}>{longFormWorker?.ready?"PARITY WORKER READY":"WORKER BLOCKED"}</div></div><div className="mt-2 text-[7px] leading-3 text-white/18">Chunk loudness/limiting is forbidden. Chunks render with graph-state context, sample-exact trim and absolute automation time; whole-program mastering/QC happens only after assembly.</div>{!longFormWorker?.ready?<div className="mt-2 text-[7px] text-amber-100/40">{longFormWorker?.blocking_reason||"Parity-capable long-form audio worker not configured."} · FFmpeg-only fallback is forbidden.</div>:<button type="button" disabled={longFormBusy} onClick={()=>startLongFormRender()} className="mt-3 rounded-lg border border-[#d6a66a]/25 bg-[#d6a66a]/10 px-3 py-2 text-[8px] text-[#efd29f]/70 disabled:opacity-30">{longFormBusy?"Submitting…":"Start long-form render"}</button>}{longFormJob?<div className="mt-2 rounded-lg border border-white/6 bg-black/15 px-2 py-2 font-mono text-[7px] text-white/28"><div>{longFormJob.status_detail||longFormJob.status} · {Number(longFormJob.progress_percent||0).toFixed(1)}%</div><div className="mt-1 text-white/15">{longFormJob.job_id}</div>{longFormJob.asset_id?<div className="mt-1 text-emerald-100/45">IMMUTABLE PRE-MASTER · {longFormJob.asset_id}</div>:null}</div>:null}</div> : null}

      {blockers.length ? <div className="mt-3 rounded-xl border border-amber-300/12 bg-amber-300/[0.02] p-3"><div className="flex items-center gap-2 text-[9px] text-amber-100/65"><TriangleAlert className="h-3.5 w-3.5" /> Release blockers</div><div className="mt-2 space-y-1">{blockers.map((item, index) => <div key={`${item.code}-${index}`} className="text-[8px] leading-4 text-white/28"><span className="text-amber-100/50">{item.code}</span> — {item.message}</div>)}</div></div> : null}

      {plan ? <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg border border-white/6 p-2"><div className="text-[7px] uppercase text-white/18">Sources</div><div className="mt-1 text-[10px] text-white/45">{plan.source_asset_ids?.length || 0}</div></div><div className="rounded-lg border border-white/6 p-2"><div className="text-[7px] uppercase text-white/18">Duration</div><div className="mt-1 text-[10px] text-white/45">{finite(plan.duration_seconds, 0).toFixed(1)}s</div></div><div className="rounded-lg border border-white/6 p-2"><div className="text-[7px] uppercase text-white/18">Revision</div><div className="mt-1 text-[10px] text-white/45">{plan.project_revision}</div></div></div> : null}

      <button type="button" disabled={disabled || busy || !ready} onClick={renderAndMaster} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#d6a66a]/30 bg-[#d6a66a]/10 px-4 py-3 text-[10px] font-medium text-[#efd29f] disabled:opacity-25"><ShieldCheck className="h-4 w-4" /> {busy ? status || "WORKING" : professionalMixStage ? "Render professional pre-master" : professionalLocked ? `Professional stage: ${professionalStage}` : "Render + certify release master"}</button>

      {result ? <div className="mt-3 rounded-xl border border-emerald-300/12 bg-emerald-300/[0.025] p-3"><div className="flex items-center gap-2 text-[9px] text-emerald-100/65"><CheckCircle2 className="h-3.5 w-3.5" /> {result.professional_release ? "Professional pre-master registered" : "Certified release candidate"}</div><div className="mt-2 grid grid-cols-2 gap-2 text-[8px] text-white/30"><div>LUFS {Number.isFinite(result.integrated_lufs) ? result.integrated_lufs.toFixed(1) : "certified"}</div><div>True peak {Number.isFinite(result.true_peak_dbtp) ? `${result.true_peak_dbtp.toFixed(2)} dBTP` : "certified"}</div><div>Deliveries {result.deliveries?.length || 0}</div><div>Master asset saved</div></div></div> : null}
      {error ? <div className="mt-3 rounded-xl border border-red-300/12 bg-red-400/[0.025] px-3 py-2 text-[8px] leading-4 text-red-100/65">{error}</div> : null}

      {plan ? <div className="mt-4"><MusicStemExportPanel
        organizationId={organizationId}
        projectId={projectId}
        session={session}
        assetUrls={assetUrls}
        plan={plan}
        disabled={disabled || busy || !ready}
        deliveryLanguage={deliveryLanguage}
        deliveryProfileId={deliveryProfileId}
      /></div> : null}

      <div className="mt-3 text-[7px] leading-3 text-white/15">No provider generation is used. Original takes/assets remain immutable. Release masters alone receive final limiter/loudness and true-peak certification. Track/group stems are 24-bit pre-Master engineering exports; Instrumental/Acapella preserve the mix graph but remain un-limited derived alternates unless separately mastered.</div>
    </div>
  );
}
