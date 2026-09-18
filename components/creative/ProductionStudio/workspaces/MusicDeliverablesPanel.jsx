"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Disc3, Download, FileAudio, RefreshCw, ShieldCheck } from "lucide-react";

function text(value) { return String(value ?? "").trim(); }
function when(value) { if (!value) return ""; const d = new Date(value); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(); }
function labelFor(asset = {}) {
  const type = text(asset.asset_type || asset.kind).toUpperCase();
  if (type === "MASTER") return "Release Master";
  if (type === "MIX_RENDER") return "Pre-master";
  if (type.includes("BACKING")) return "Backing Track";
  if (type.includes("STEM")) return "Stem";
  if (type.includes("RESTORED")) return "Cleaned Audio";
  if (type.includes("MUSIC")) return "Music";
  return type.replaceAll("_", " ") || "Audio";
}

export default function MusicDeliverablesPanel({ organizationId, projectId = null, missionId = null }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resolved, setResolved] = useState({});
  const [postPackage, setPostPackage] = useState(null);
  const [deliveryLanguage, setDeliveryLanguage] = useState("en");
  const [deliverySeal, setDeliverySeal] = useState(null);
  const [staleDeliverySeal, setStaleDeliverySeal] = useState(null);
  const [sealing, setSealing] = useState(false);
  const [versionMatrix, setVersionMatrix] = useState(null);
  const [printmasterPlan, setPrintmasterPlan] = useState(null);
  const [printmasterBlocker, setPrintmasterBlocker] = useState("");
  const [printmasterInputs, setPrintmasterInputs] = useState({});
  const [printmasterEvaluations, setPrintmasterEvaluations] = useState([]);
  const [printmasterSeal, setPrintmasterSeal] = useState(null);
  const [printmasterBusy, setPrintmasterBusy] = useState("");
  const [packageManifest, setPackageManifest] = useState(null);
  const [exportingManifest, setExportingManifest] = useState(false);
  const [listeningNote, setListeningNote] = useState("");
  const [reviewingDialogue, setReviewingDialogue] = useState(false);
  const [downloadingPackage, setDownloadingPackage] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId || !projectId) return;
    setBusy(true); setError("");
    try {
      const [historyResponse, mastersResponse, postResponse, matrixResponse, printmasterResponse] = await Promise.all([
        fetch("/api/creative/music/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "history", organization_id: organizationId, creative_project_id: projectId, creative_mission_id: missionId }) }),
        fetch("/api/creative/music/master-library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organization_id: organizationId, creative_project_id: projectId }) }),
        fetch("/api/creative/music/audio-post-delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organization_id: organizationId, creative_project_id: projectId, language: deliveryLanguage }) }),
        fetch("/api/creative/music/audio-post-delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "matrix", organization_id: organizationId, creative_project_id: projectId }) }),
        fetch("/api/creative/music/audio-post-delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "printmaster_plan", organization_id: organizationId, creative_project_id: projectId, language: deliveryLanguage }) }),
      ]);
      const history = await historyResponse.json();
      const masters = await mastersResponse.json();
      const post = await postResponse.json();
      const matrix = await matrixResponse.json();
      const printmasters = await printmasterResponse.json();
      if (!historyResponse.ok || history.success === false) throw new Error(history.error || "Deliverables could not load");
      const studioAssets = Array.isArray(history.assets) ? history.assets : [];
      const releases = mastersResponse.ok && masters.success !== false && Array.isArray(masters.releases) ? masters.releases : [];
      const normalizedReleases = releases.map((item) => ({ ...item, asset_type: item.kind, title: item.name, file_url: item.primary_url, playback_url: item.primary_url, source: "release" }));
      const merged = [...studioAssets.map((item) => ({ ...item, source: "studio" })), ...normalizedReleases];
      setItems([...new Map(merged.map((item) => [item.id || `${item.asset_type}:${item.file_url}`, item])).values()]);
      setPostPackage(postResponse.ok && post.success !== false ? post.package : null);
      setDeliverySeal(postResponse.ok && post.success !== false ? post.current_seal || null : null);
      setStaleDeliverySeal(postResponse.ok && post.success !== false ? post.stale_seal || null : null);
      setVersionMatrix(matrixResponse.ok && matrix.success !== false ? matrix.matrix || null : null);
      setPrintmasterPlan(printmasterResponse.ok && printmasters.success !== false ? printmasters.plan || null : null);
      setPrintmasterBlocker(printmasterResponse.ok && printmasters.success !== false ? printmasters.blocker || "" : "PRINTMASTER_PLAN_UNAVAILABLE");
      setPrintmasterEvaluations(printmasterResponse.ok && printmasters.success !== false ? printmasters.evaluations || [] : []);
      setPrintmasterSeal(printmasterResponse.ok && printmasters.success !== false ? printmasters.current_seal || null : null);
    } catch (cause) { setError(cause.message || "Deliverables could not load"); }
    finally { setBusy(false); }
  }, [organizationId, projectId, missionId, deliveryLanguage]);

  useEffect(() => { void load(); }, [load]);

  async function reviewPrintmaster(variant) {
    const input = printmasterInputs[variant.id] || {};
    if (!input.rendered_asset_id || printmasterBusy) return;
    setPrintmasterBusy(variant.id); setError("");
    try {
      const response = await fetch("/api/creative/music/audio-post-delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "printmaster_review", organization_id: organizationId, creative_project_id: projectId, language: deliveryLanguage, variant_id: variant.id, rendered_asset_id: input.rendered_asset_id, technical_qc_passed: input.technical_qc_passed === true, listening_review_approved: input.listening_review_approved === true, cinema_monitor_reviewed: variant.id === "THEATRICAL" && input.monitor_reviewed === true, near_field_monitor_reviewed: variant.id !== "THEATRICAL" && input.monitor_reviewed === true }) });
      const body = await response.json(); if (!response.ok || body.success === false) throw new Error(body.error || "Printmaster review could not save");
      setPrintmasterEvaluations((current) => [...current.filter((row) => row.variant_id !== body.evaluation.variant_id), body.evaluation]); void load();
    } catch (cause) { setError(cause?.message || "Printmaster review could not save"); } finally { setPrintmasterBusy(""); }
  }
  async function sealPrintmasters() {
    if (printmasterBusy) return; setPrintmasterBusy("SEAL"); setError("");
    try {
      const response = await fetch("/api/creative/music/audio-post-delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "printmaster_seal", organization_id: organizationId, creative_project_id: projectId, language: deliveryLanguage }) });
      const body = await response.json(); if (!response.ok || body.success === false) throw new Error(body.error || "Printmaster set could not seal");
      setPrintmasterSeal(body.seal); void load();
    } catch (cause) { setError(cause?.message || "Printmaster set could not seal"); } finally { setPrintmasterBusy(""); }
  }

  async function sealDeliveryPackage() {
    if (!postPackage?.release_ready || sealing) return;
    setSealing(true); setError("");
    try {
      const response = await fetch("/api/creative/music/audio-post-delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "seal", organization_id: organizationId, creative_project_id: projectId, language: deliveryLanguage }) });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "Delivery package could not be sealed");
      setPostPackage(body.package); setDeliverySeal(body.seal);
      void load();
    } catch (cause) { setError(cause?.message || "Delivery package could not be sealed"); }
    finally { setSealing(false); }
  }

  async function submitDialogueReview(status) {
    if (!postPackage || reviewingDialogue) return;
    setReviewingDialogue(true); setError("");
    try {
      const response = await fetch("/api/creative/music/audio-post-delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "review_dialogue", organization_id: organizationId, creative_project_id: projectId, language: deliveryLanguage, status, note: listeningNote }) });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "Dialogue listening review could not save");
      setPostPackage(body.package); setListeningNote("");
      void load();
    } catch (cause) { setError(cause?.message || "Dialogue listening review could not save"); }
    finally { setReviewingDialogue(false); }
  }

  async function downloadDeliveryPackage() {
    if (!deliverySeal || downloadingPackage) return;
    setDownloadingPackage(true); setError("");
    try {
      const response = await fetch("/api/creative/music/audio-post-delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "download_package", organization_id: organizationId, creative_project_id: projectId, language: deliveryLanguage }) });
      if (!response.ok) { const body = await response.json().catch(()=>({})); throw new Error(body.error || "Delivery ZIP could not be assembled"); }
      const blob = await response.blob(), disposition=response.headers.get("content-disposition")||"", match=disposition.match(/filename=\"([^\"]+)\"/i), fileName=match?.[1]||`audio-post-${deliveryLanguage}.zip`, url=URL.createObjectURL(blob), anchor=document.createElement("a");
      anchor.href=url; anchor.download=fileName; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (cause) { setError(cause?.message || "Delivery ZIP could not be assembled"); }
    finally { setDownloadingPackage(false); }
  }

  async function exportPackageManifest() {
    if (!deliverySeal || exportingManifest) return;
    setExportingManifest(true); setError("");
    try {
      const response = await fetch("/api/creative/music/audio-post-delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "export_manifest", organization_id: organizationId, creative_project_id: projectId, language: deliveryLanguage }) });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "Package manifest could not export");
      setPackageManifest(body);
      void load();
    } catch (cause) { setError(cause?.message || "Package manifest could not export"); }
    finally { setExportingManifest(false); }
  }

  async function resolve(item) {
    if (item.playback_url || resolved[item.id]) return item.playback_url || resolved[item.id];
    if (item.source === "release" || !item.id) return item.file_url || "";
    const response = await fetch("/api/creative/music/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resolve_asset", organization_id: organizationId, asset_id: item.id }) });
    const body = await response.json();
    if (!response.ok || body.success === false) throw new Error(body.error || "File could not be opened");
    const url = body.asset?.playback_url || "";
    setResolved((current) => ({ ...current, [item.id]: url }));
    return url;
  }

  const groups = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const label = labelFor(item);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(item);
    }
    return [...map.entries()];
  }, [items]);

  return <div className="mx-auto max-w-7xl p-6">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/[0.08] pb-5">
      <div><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9A744B]"><Disc3 className="h-4 w-4" /> Deliverables</div><h2 className="mt-2 text-[24px] font-medium tracking-[-0.04em] text-[#1B1A18]">Everything ready to take with you</h2><p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#817B73]">Masters, pre-masters, stems, backing tracks, restored audio and generated music attached to this project. Production evidence stays in the specialist tools; this page is for the files.</p></div>
      <button type="button" onClick={() => load()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-[9px] font-semibold text-[#716B63] disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh</button>
    </div>
    {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[10px] text-red-700">{error}</div> : null}
    {printmasterPlan ? <section className="mt-5 rounded-2xl border border-[#B98A57]/20 bg-[#FFFDF8] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">Film Printmasters</div><div className="mt-1 text-[13px] font-semibold text-[#413C36]">Separate theatrical, near-field and streaming masters</div><div className="mt-1 text-[8px] text-[#817B73]">Same approved premixes · independent render, QC and listening review per destination · no one-master-fits-all shortcut.</div></div><div className="rounded-full border border-[#B98A57]/20 bg-white px-2.5 py-1 text-[8px] text-[#745435]">Source · {printmasterPlan.source_master_asset_id}</div></div><div className="mt-3 grid gap-2 md:grid-cols-3">{printmasterPlan.variants?.map(v=>{const evaluation=printmasterEvaluations.find(row=>row.variant_id===v.id),input=printmasterInputs[v.id]||{};return <div key={v.id} className={"rounded-xl border bg-white p-3 "+(evaluation?.passed?"border-emerald-700/15":"border-black/[0.06]")}><div className="flex items-center justify-between gap-2"><div><div className="text-[10px] font-semibold text-[#514B44]">{v.label}</div><div className="mt-1 text-[7px] uppercase tracking-[0.11em] text-[#9A948B]">{v.monitor_environment}</div></div><span className={"rounded-full border px-2 py-1 text-[7px] "+(evaluation?.passed?"border-emerald-700/12 text-emerald-800":"border-amber-300 text-amber-800")}>{evaluation?.passed?"PASS":"REVIEW REQUIRED"}</span></div><div className="mt-2 space-y-1 text-[8px] text-[#817B73]"><div>Dynamic range · {v.dynamic_range}</div><div>Layout · {v.target_layout}</div></div><input value={input.rendered_asset_id||evaluation?.rendered_asset_id||""} onChange={e=>setPrintmasterInputs(cur=>({...cur,[v.id]:{...(cur[v.id]||{}),rendered_asset_id:e.target.value}}))} placeholder="Rendered printmaster asset ID" className="mt-3 w-full rounded-lg border border-black/[0.08] bg-[#FCFBF8] px-2 py-2 text-[8px] text-[#514B44]"/><div className="mt-2 space-y-1.5"><label className="flex items-center gap-2 text-[8px] text-[#716B63]"><input type="checkbox" checked={input.technical_qc_passed===true} onChange={e=>setPrintmasterInputs(cur=>({...cur,[v.id]:{...(cur[v.id]||{}),technical_qc_passed:e.target.checked}}))}/> Technical QC passed</label><label className="flex items-center gap-2 text-[8px] text-[#716B63]"><input type="checkbox" checked={input.listening_review_approved===true} onChange={e=>setPrintmasterInputs(cur=>({...cur,[v.id]:{...(cur[v.id]||{}),listening_review_approved:e.target.checked}}))}/> Listening review approved</label><label className="flex items-center gap-2 text-[8px] text-[#716B63]"><input type="checkbox" checked={input.monitor_reviewed===true} onChange={e=>setPrintmasterInputs(cur=>({...cur,[v.id]:{...(cur[v.id]||{}),monitor_reviewed:e.target.checked}}))}/> {v.id==="THEATRICAL"?"Cinema monitor reviewed":"Near-field monitor reviewed"}</label></div><button type="button" disabled={printmasterBusy!==""||!(input.rendered_asset_id||evaluation?.rendered_asset_id)} onClick={()=>reviewPrintmaster(v)} className="mt-3 rounded-lg border border-[#8A633C]/20 bg-[#FFFDF8] px-2.5 py-1.5 text-[8px] font-semibold text-[#745435] disabled:opacity-30">{printmasterBusy===v.id?"Reviewing…":"Save independent review"}</button>{evaluation?.failures?.length?<div className="mt-2 text-[7px] leading-4 text-amber-800">{evaluation.failures.join(" · ")}</div>:null}</div>})}</div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><div className="text-[7px] text-[#918B83]">{printmasterSeal?"Immutable printmaster set sealed · "+printmasterSeal.seal_hash.slice(0,24)+"…":"All three variants must independently pass before set sealing."}</div><button type="button" disabled={Boolean(printmasterSeal)||printmasterBusy!==""||!printmasterPlan.variants?.every(v=>printmasterEvaluations.find(e=>e.variant_id===v.id)?.passed===true)} onClick={sealPrintmasters} className="rounded-lg border border-emerald-700/15 bg-white px-2.5 py-1.5 text-[8px] font-semibold text-emerald-800 disabled:opacity-30">{printmasterBusy==="SEAL"?"Sealing…":printmasterSeal?"PRINTMASTER SET SEALED":"Seal printmaster set"}</button></div></section> : printmasterBlocker ? <section className="mt-5 rounded-2xl border border-amber-300 bg-amber-50/60 p-4"><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-800">Film Printmasters</div><div className="mt-1 text-[9px] text-amber-800/80">Create and approve the current Full Mix first. Theatrical, near-field and streaming versions stay blocked until that exact master exists.</div></section> : null}
    {versionMatrix?.language_count ? <section className={`mt-5 rounded-2xl border p-4 ${versionMatrix.all_versions_current ? "border-emerald-700/15 bg-emerald-50/50" : "border-amber-300 bg-amber-50/60"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">Language Delivery Matrix</div><div className="mt-1 text-[12px] font-semibold text-[#413C36]">{versionMatrix.language_count} sealed language version{versionMatrix.language_count===1?"":"s"}</div><div className="mt-1 text-[8px] text-[#817B73]">Same picture/revision · language-specific Full Mix + DX/VO/ADR · shared MX/FX/Foley/Ambience/M&E</div></div><div className={`rounded-full border px-2.5 py-1 text-[8px] ${versionMatrix.all_versions_current?"border-emerald-700/12 text-emerald-800":"border-amber-300 text-amber-800"}`}>{versionMatrix.all_versions_current?"ALL CURRENT":"DRIFT DETECTED"}</div></div><div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">{versionMatrix.languages.map(row=><div key={row.language} className="rounded-xl border border-black/[0.06] bg-white/70 p-3"><div className="text-[10px] font-semibold uppercase text-[#514B44]">{row.language}</div><div className="mt-1 text-[7px] text-[#918B83]">Full Mix · {row.full_mix_asset_id||"missing"}</div><div className="mt-1 text-[7px] text-[#918B83]">M&E · {row.me_asset_id||"missing"}</div><div className={`mt-2 text-[7px] ${row.current?"text-emerald-700":"text-amber-700"}`}>{row.current?"Current / sealed":row.failures.join(" · ")}</div></div>)}</div><div className="mt-3 text-[7px] text-[#918B83]">Shared asset reuse · {versionMatrix.shared_asset_reuse_verified?"verified":"mismatch"}</div></section> : null}
    {postPackage ? <section className={`mt-5 rounded-2xl border p-4 ${postPackage.release_ready ? "border-emerald-700/15 bg-emerald-50/60" : "border-amber-300 bg-amber-50/60"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">Audio Post delivery package</div><div className="mt-1 text-[13px] font-semibold text-[#413C36]">{postPackage.release_ready ? "Package release-ready" : "Package incomplete"}</div><div className="mt-1 text-[9px] text-[#817B73]">Picture lock · editorial approval · Full Mix · DX/VO/ADR/MX/FX/Foley/Ambience · M&E · current revision QC</div></div><div className="flex flex-wrap items-center gap-2"><label className="text-[8px] uppercase tracking-[0.12em] text-[#918B83]">Language <input value={deliveryLanguage} onChange={e=>setDeliveryLanguage(e.target.value)} className="ml-2 w-16 rounded-lg border border-black/[0.08] bg-white px-2 py-1.5 text-[9px] normal-case text-[#514B44]"/></label><button type="button" disabled={!postPackage.release_ready || sealing} onClick={()=>sealDeliveryPackage()} className="rounded-lg border border-emerald-700/15 bg-white px-2.5 py-1.5 text-[8px] font-semibold text-emerald-800 disabled:opacity-30">{sealing ? "Sealing…" : "Seal delivery package"}</button><button type="button" disabled={!deliverySeal || exportingManifest} onClick={()=>exportPackageManifest()} className="rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-[8px] font-semibold text-[#5F5951] disabled:opacity-30">{exportingManifest ? "Exporting…" : "Export package manifest"}</button><button type="button" disabled={!deliverySeal || downloadingPackage} onClick={()=>downloadDeliveryPackage()} className="rounded-lg border border-[#8A633C]/20 bg-[#FFFDF8] px-2.5 py-1.5 text-[8px] font-semibold text-[#745435] disabled:opacity-30">{downloadingPackage ? "Assembling…" : "Download delivery ZIP"}</button></div></div><div className="mt-3 rounded-xl border border-black/[0.06] bg-white/70 p-3"><div className="text-[8px] font-semibold uppercase tracking-[0.13em] text-[#7B6A58]">Final post QC</div><div className="mt-2 flex flex-wrap gap-1.5"><span className={`rounded-lg border px-2 py-1 text-[8px] ${postPackage.final_qc?.passed ? "border-emerald-700/12 text-emerald-800" : "border-amber-300 text-amber-800"}`}>Overall · {postPackage.final_qc?.passed ? "pass" : "blocked"}</span><span className={`rounded-lg border px-2 py-1 text-[8px] ${postPackage.final_qc?.fold_down_qc?.passed ? "border-emerald-700/12 text-emerald-800" : "border-black/[0.07] text-[#777]"}`}>Fold-down · {postPackage.final_qc?.fold_down_qc?.required ? (postPackage.final_qc?.fold_down_qc?.passed ? "pass" : "required") : "n/a"}</span><span className={`rounded-lg border px-2 py-1 text-[8px] ${postPackage.final_qc?.me_coherence?.passed ? "border-emerald-700/12 text-emerald-800" : "border-amber-300 text-amber-800"}`}>M&E coherence · {postPackage.final_qc?.me_coherence?.passed ? "pass" : "check"}</span><span className={`rounded-lg border px-2 py-1 text-[8px] ${(postPackage.final_qc?.language_version?.mismatch_count||0)===0 ? "border-emerald-700/12 text-emerald-800" : "border-amber-300 text-amber-800"}`}>Language · {(postPackage.final_qc?.language_version?.mismatch_count||0)===0 ? "pass" : "mismatch"}</span></div>{postPackage.final_qc?.dialogue_intelligibility?.human_listening_review_required ? <div className="mt-2 rounded-lg border border-[#B98A57]/15 bg-[#FFFDF9] p-2.5"><div className="text-[7px] leading-4 text-[#8A633C]">Dialogue intelligibility requires independent listening review; Avantiqo does not claim semantic intelligibility from technical meters alone.</div><div className="mt-2 flex flex-wrap items-center gap-2"><input value={listeningNote} onChange={e=>setListeningNote(e.target.value)} placeholder="Listening note" className="min-w-[220px] flex-1 rounded-lg border border-black/[0.08] bg-white px-2 py-1.5 text-[8px] text-[#514B44]"/><button type="button" disabled={reviewingDialogue} onClick={()=>submitDialogueReview("APPROVED")} className="rounded-lg border border-emerald-700/12 bg-white px-2.5 py-1.5 text-[8px] text-emerald-800 disabled:opacity-30">Approve listening</button><button type="button" disabled={reviewingDialogue||!listeningNote.trim()} onClick={()=>submitDialogueReview("REJECTED")} className="rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-[8px] text-red-700 disabled:opacity-30">Reject / repair</button></div><div className="mt-1 text-[7px] text-[#918B83]">Status · {postPackage.listening_review?.status||"MISSING"}{postPackage.listening_review?.reviewed_at?` · ${postPackage.listening_review.reviewed_at}`:""}</div></div> : null}</div>
    <div className="mt-3 flex flex-wrap gap-1.5">{postPackage.stems?.map(stem=><span key={stem.delivery_code} className={`rounded-lg border px-2 py-1 text-[8px] ${stem.technical_qc_passed ? "border-emerald-700/12 bg-white text-emerald-800" : "border-amber-300 bg-white text-amber-800"}`}>{stem.delivery_code} · {stem.technical_qc_passed ? "ready" : "missing/QC"}</span>)}</div>{postPackage.failures?.length ? <div className="mt-3 text-[8px] leading-4 text-amber-800">{postPackage.failures.join(" · ")}</div> : null}{deliverySeal ? <div className="mt-3 rounded-lg border border-emerald-700/10 bg-white/70 px-3 py-2 font-mono text-[7px] text-emerald-900/65">SEALED · {deliverySeal.manifest_hash?.slice(0,24)}… · revision {deliverySeal.project_revision} · {deliverySeal.language}</div> : null}{packageManifest ? <div className="mt-2 rounded-lg border border-black/[0.06] bg-white/70 px-3 py-2 text-[7px] text-[#756F67]">PACKAGE MANIFEST · {packageManifest.manifest?.manifest_file_name} · {packageManifest.reused ? "reused" : "created"} · audio files referenced, not copied</div> : null}{staleDeliverySeal ? <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[8px] text-red-700">Previous delivery seal is stale after picture/session change. Re-render, re-QC and seal the current revision.</div> : null}</section> : null}
    <div className="mt-5 space-y-5">
      {groups.map(([group, assets]) => <section key={group}><div className="mb-2 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8A867F]"><FileAudio className="h-3.5 w-3.5" /> {group} <span className="text-[#AAA39A]">{assets.length}</span></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{assets.map((item) => { const url = item.playback_url || resolved[item.id] || (item.source === "release" ? item.file_url : ""); return <article key={item.id || item.file_url} className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-[11px] font-semibold text-[#403C37]">{item.title || item.name || item.file_name || group}</div><div className="mt-1 text-[8px] text-[#918B83]">{when(item.created_at)}{item.metadata?.stem ? ` · ${item.metadata.stem}` : ""}</div></div>{item.release_candidate ? <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700/60" /> : null}</div>{url ? <><audio controls preload="none" src={url} className="mt-3 h-9 w-full" /><a href={url} download className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] px-2.5 py-1.5 text-[8px] font-semibold text-[#5F5951]"><Download className="h-3 w-3" /> Download</a></> : <button type="button" onClick={async () => { try { await resolve(item); } catch (cause) { setError(cause.message || "File could not be opened"); } }} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] px-2.5 py-1.5 text-[8px] font-semibold text-[#5F5951]">Open file</button>}</article>; })}</div></section>)}
      {!busy && !groups.length ? <div className="rounded-2xl border border-dashed border-black/[0.09] bg-white px-6 py-12 text-center text-[10px] text-[#918B83]">No finished audio files are attached to this project yet.</div> : null}
    </div>
  </div>;
}
