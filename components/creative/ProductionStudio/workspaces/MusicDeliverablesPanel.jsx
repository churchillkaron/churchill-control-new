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

  const load = useCallback(async () => {
    if (!organizationId || !projectId) return;
    setBusy(true); setError("");
    try {
      const [historyResponse, mastersResponse, postResponse] = await Promise.all([
        fetch("/api/creative/music/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "history", organization_id: organizationId, creative_project_id: projectId, creative_mission_id: missionId }) }),
        fetch("/api/creative/music/master-library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organization_id: organizationId, creative_project_id: projectId }) }),
        fetch("/api/creative/music/audio-post-delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organization_id: organizationId, creative_project_id: projectId, language: deliveryLanguage }) }),
      ]);
      const history = await historyResponse.json();
      const masters = await mastersResponse.json();
      const post = await postResponse.json();
      if (!historyResponse.ok || history.success === false) throw new Error(history.error || "Deliverables could not load");
      const studioAssets = Array.isArray(history.assets) ? history.assets : [];
      const releases = mastersResponse.ok && masters.success !== false && Array.isArray(masters.releases) ? masters.releases : [];
      const normalizedReleases = releases.map((item) => ({ ...item, asset_type: item.kind, title: item.name, file_url: item.primary_url, playback_url: item.primary_url, source: "release" }));
      const merged = [...studioAssets.map((item) => ({ ...item, source: "studio" })), ...normalizedReleases];
      setItems([...new Map(merged.map((item) => [item.id || `${item.asset_type}:${item.file_url}`, item])).values()]);
      setPostPackage(postResponse.ok && post.success !== false ? post.package : null);
      setDeliverySeal(postResponse.ok && post.success !== false ? post.current_seal || null : null);
      setStaleDeliverySeal(postResponse.ok && post.success !== false ? post.stale_seal || null : null);
    } catch (cause) { setError(cause.message || "Deliverables could not load"); }
    finally { setBusy(false); }
  }, [organizationId, projectId, missionId, deliveryLanguage]);

  useEffect(() => { void load(); }, [load]);

  async function sealDeliveryPackage() {
    if (!postPackage?.release_ready || sealing) return;
    setSealing(true); setError("");
    try {
      const response = await fetch("/api/creative/music/audio-post-delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "seal", organization_id: organizationId, creative_project_id: projectId, language: deliveryLanguage }) });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "Delivery package could not be sealed");
      setPostPackage(body.package); setDeliverySeal(body.seal);
    } catch (cause) { setError(cause?.message || "Delivery package could not be sealed"); }
    finally { setSealing(false); }
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
    {postPackage ? <section className={`mt-5 rounded-2xl border p-4 ${postPackage.release_ready ? "border-emerald-700/15 bg-emerald-50/60" : "border-amber-300 bg-amber-50/60"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">Audio Post delivery package</div><div className="mt-1 text-[13px] font-semibold text-[#413C36]">{postPackage.release_ready ? "Package release-ready" : "Package incomplete"}</div><div className="mt-1 text-[9px] text-[#817B73]">Picture lock · editorial approval · Full Mix · DX/VO/ADR/MX/FX/Foley/Ambience · M&E · current revision QC</div></div><div className="flex flex-wrap items-center gap-2"><label className="text-[8px] uppercase tracking-[0.12em] text-[#918B83]">Language <input value={deliveryLanguage} onChange={e=>setDeliveryLanguage(e.target.value)} className="ml-2 w-16 rounded-lg border border-black/[0.08] bg-white px-2 py-1.5 text-[9px] normal-case text-[#514B44]"/></label><button type="button" disabled={!postPackage.release_ready || sealing} onClick={()=>sealDeliveryPackage()} className="rounded-lg border border-emerald-700/15 bg-white px-2.5 py-1.5 text-[8px] font-semibold text-emerald-800 disabled:opacity-30">{sealing ? "Sealing…" : "Seal delivery package"}</button></div></div><div className="mt-3 rounded-xl border border-black/[0.06] bg-white/70 p-3"><div className="text-[8px] font-semibold uppercase tracking-[0.13em] text-[#7B6A58]">Final post QC</div><div className="mt-2 flex flex-wrap gap-1.5"><span className={`rounded-lg border px-2 py-1 text-[8px] ${postPackage.final_qc?.passed ? "border-emerald-700/12 text-emerald-800" : "border-amber-300 text-amber-800"}`}>Overall · {postPackage.final_qc?.passed ? "pass" : "blocked"}</span><span className={`rounded-lg border px-2 py-1 text-[8px] ${postPackage.final_qc?.fold_down_qc?.passed ? "border-emerald-700/12 text-emerald-800" : "border-black/[0.07] text-[#777]"}`}>Fold-down · {postPackage.final_qc?.fold_down_qc?.required ? (postPackage.final_qc?.fold_down_qc?.passed ? "pass" : "required") : "n/a"}</span><span className={`rounded-lg border px-2 py-1 text-[8px] ${postPackage.final_qc?.me_coherence?.passed ? "border-emerald-700/12 text-emerald-800" : "border-amber-300 text-amber-800"}`}>M&E coherence · {postPackage.final_qc?.me_coherence?.passed ? "pass" : "check"}</span><span className={`rounded-lg border px-2 py-1 text-[8px] ${(postPackage.final_qc?.language_version?.mismatch_count||0)===0 ? "border-emerald-700/12 text-emerald-800" : "border-amber-300 text-amber-800"}`}>Language · {(postPackage.final_qc?.language_version?.mismatch_count||0)===0 ? "pass" : "mismatch"}</span></div>{postPackage.final_qc?.dialogue_intelligibility?.human_listening_review_required ? <div className="mt-2 text-[7px] leading-4 text-[#8A633C]">Dialogue intelligibility still requires independent listening review; Avantiqo does not claim semantic intelligibility from technical meters alone.</div> : null}</div>
    <div className="mt-3 flex flex-wrap gap-1.5">{postPackage.stems?.map(stem=><span key={stem.delivery_code} className={`rounded-lg border px-2 py-1 text-[8px] ${stem.technical_qc_passed ? "border-emerald-700/12 bg-white text-emerald-800" : "border-amber-300 bg-white text-amber-800"}`}>{stem.delivery_code} · {stem.technical_qc_passed ? "ready" : "missing/QC"}</span>)}</div>{postPackage.failures?.length ? <div className="mt-3 text-[8px] leading-4 text-amber-800">{postPackage.failures.join(" · ")}</div> : null}{deliverySeal ? <div className="mt-3 rounded-lg border border-emerald-700/10 bg-white/70 px-3 py-2 font-mono text-[7px] text-emerald-900/65">SEALED · {deliverySeal.manifest_hash?.slice(0,24)}… · revision {deliverySeal.project_revision} · {deliverySeal.language}</div> : null}{staleDeliverySeal ? <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[8px] text-red-700">Previous delivery seal is stale after picture/session change. Re-render, re-QC and seal the current revision.</div> : null}</section> : null}
    <div className="mt-5 space-y-5">
      {groups.map(([group, assets]) => <section key={group}><div className="mb-2 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8A867F]"><FileAudio className="h-3.5 w-3.5" /> {group} <span className="text-[#AAA39A]">{assets.length}</span></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{assets.map((item) => { const url = item.playback_url || resolved[item.id] || (item.source === "release" ? item.file_url : ""); return <article key={item.id || item.file_url} className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-[11px] font-semibold text-[#403C37]">{item.title || item.name || item.file_name || group}</div><div className="mt-1 text-[8px] text-[#918B83]">{when(item.created_at)}{item.metadata?.stem ? ` · ${item.metadata.stem}` : ""}</div></div>{item.release_candidate ? <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700/60" /> : null}</div>{url ? <><audio controls preload="none" src={url} className="mt-3 h-9 w-full" /><a href={url} download className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] px-2.5 py-1.5 text-[8px] font-semibold text-[#5F5951]"><Download className="h-3 w-3" /> Download</a></> : <button type="button" onClick={async () => { try { await resolve(item); } catch (cause) { setError(cause.message || "File could not be opened"); } }} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] px-2.5 py-1.5 text-[8px] font-semibold text-[#5F5951]">Open file</button>}</article>; })}</div></section>)}
      {!busy && !groups.length ? <div className="rounded-2xl border border-dashed border-black/[0.09] bg-white px-6 py-12 text-center text-[10px] text-[#918B83]">No finished audio files are attached to this project yet.</div> : null}
    </div>
  </div>;
}
