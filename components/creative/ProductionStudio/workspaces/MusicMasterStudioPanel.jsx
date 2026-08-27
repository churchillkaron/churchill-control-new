"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Disc3, Download, RefreshCw, ShieldCheck, TriangleAlert, Waves } from "lucide-react";

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function db(value, suffix = "dB") {
  const number = finite(value, null);
  return number === null ? "—" : `${number.toFixed(1)} ${suffix}`;
}

function kindLabel(kind) {
  const labels = {
    MASTER: "Release Master",
    MIX_RENDER: "Pre-master",
    TRACK_STEM_RENDER: "Track Stem",
    GROUP_STEM_RENDER: "Group Stem",
    INSTRUMENTAL: "Instrumental",
    ACAPELLA: "Acapella",
  };
  return labels[kind] || kind;
}

function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function MusicMasterStudioPanel({ organizationId, projectId }) {
  const [library, setLibrary] = useState({ current_revision: 0, releases: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");

  const load = useCallback(async () => {
    if (!organizationId || !projectId) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/creative/music/master-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, creative_project_id: projectId }),
      });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "Master library could not load");
      setLibrary(body);
    } catch (cause) {
      setError(cause?.message || "Master library could not load");
    } finally {
      setBusy(false);
    }
  }, [organizationId, projectId]);

  useEffect(() => { void load(); }, [load]);

  const releases = useMemo(() => {
    const all = Array.isArray(library.releases) ? library.releases : [];
    return filter === "ALL" ? all : all.filter((item) => item.kind === filter);
  }, [library.releases, filter]);

  const masters = (library.releases || []).filter((item) => item.kind === "MASTER");
  const currentMaster = masters.find((item) => item.current_revision && item.release_candidate) || masters.find((item) => item.current_revision) || null;
  const currentPreMaster = (library.releases || []).find((item) => item.kind === "MIX_RENDER" && item.current_revision) || null;

  if (!projectId) return <div className="p-8 text-sm text-white/42">Open or create a Music project before using Master Studio.</div>;

  return (
    <div className="mx-auto max-w-7xl p-6 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.22em] text-[#d6a66a]/70"><Disc3 className="h-4 w-4" /> Master Studio</div>
          <h2 className="mt-2 text-xl font-medium text-white/82">Release masters & QC</h2>
          <p className="mt-1 max-w-2xl text-[10px] leading-5 text-white/30">Inspect saved pre-masters, certified release masters, stems and alternate mixes. LUFS and true-peak certification belongs to release masters only.</p>
        </div>
        <button type="button" disabled={busy} onClick={() => load()} className="inline-flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-[9px] text-white/42 disabled:opacity-25"><RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh</button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
          <div className="text-[8px] uppercase tracking-[0.14em] text-white/20">Current project</div>
          <div className="mt-2 text-lg font-medium text-white/60">Revision {library.current_revision || 0}</div>
          <div className="mt-1 text-[8px] text-white/20">Masters from older revisions remain historical and are never presented as current.</div>
        </div>
        <div className={`rounded-2xl border p-4 ${currentPreMaster ? "border-emerald-300/10 bg-emerald-300/[0.02]" : "border-white/8 bg-black/25"}`}>
          <div className="text-[8px] uppercase tracking-[0.14em] text-white/20">Current pre-master</div>
          <div className="mt-2 text-sm font-medium text-white/60">{currentPreMaster ? currentPreMaster.name : "Not rendered"}</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[8px] text-white/28"><span>Peak {db(currentPreMaster?.peak_dbfs, "dBFS")}</span><span>RMS {db(currentPreMaster?.rms_dbfs, "dBFS")}</span></div>
        </div>
        <div className={`rounded-2xl border p-4 ${currentMaster?.release_candidate ? "border-emerald-300/14 bg-emerald-300/[0.025]" : "border-white/8 bg-black/25"}`}>
          <div className="flex items-center justify-between"><div className="text-[8px] uppercase tracking-[0.14em] text-white/20">Current master</div>{currentMaster?.release_candidate ? <ShieldCheck className="h-4 w-4 text-emerald-100/55" /> : null}</div>
          <div className="mt-2 text-sm font-medium text-white/60">{currentMaster ? currentMaster.name : "Not certified"}</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[8px] text-white/28"><span>{db(currentMaster?.integrated_lufs, "LUFS")}</span><span>{db(currentMaster?.true_peak_dbtp, "dBTP")}</span></div>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-300/12 bg-red-400/[0.025] px-4 py-3 text-[9px] text-red-100/65">{error}</div> : null}

      <div className="mt-5 flex flex-wrap gap-1.5">
        {["ALL", "MASTER", "MIX_RENDER", "TRACK_STEM_RENDER", "GROUP_STEM_RENDER", "INSTRUMENTAL", "ACAPELLA"].map((id) => (
          <button key={id} type="button" onClick={() => setFilter(id)} className={`rounded-lg border px-2.5 py-1.5 text-[8px] ${filter === id ? "border-[#d6a66a]/30 bg-[#d6a66a]/10 text-[#efd29f]/75" : "border-white/7 text-white/28"}`}>{id === "ALL" ? "All" : kindLabel(id)}</button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {releases.map((item) => (
          <div key={item.id} className={`rounded-2xl border p-4 ${item.current_revision ? "border-white/10 bg-white/[0.018]" : "border-white/6 bg-black/18 opacity-70"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#d6a66a]/55">{kindLabel(item.kind)}</span>
                  <span className={`rounded-md border px-1.5 py-0.5 text-[7px] ${item.current_revision ? "border-emerald-300/12 text-emerald-100/45" : "border-amber-300/10 text-amber-100/40"}`}>{item.current_revision ? `CURRENT R${item.project_revision}` : `HISTORICAL R${item.project_revision}`}</span>
                  {item.release_candidate ? <span className="rounded-md border border-emerald-300/12 px-1.5 py-0.5 text-[7px] text-emerald-100/45">RELEASE CANDIDATE</span> : null}
                </div>
                <div className="mt-1 truncate text-sm font-medium text-white/65">{item.name}</div>
                <div className="mt-1 text-[7px] text-white/17">{dateLabel(item.created_at)}{item.mastering_profile ? ` · ${item.mastering_profile}` : ""}{item.stem_stage ? ` · ${item.stem_stage}` : ""}</div>
              </div>
              <div className="flex gap-2">
                {item.primary_url ? <a href={item.primary_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/8 px-2.5 py-1.5 text-[8px] text-white/38"><Download className="h-3 w-3" /> Audio</a> : null}
                {item.waveform_url ? <a href={item.waveform_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/8 px-2.5 py-1.5 text-[8px] text-white/38"><Waves className="h-3 w-3" /> Waveform</a> : null}
              </div>
            </div>

            {item.primary_url ? <audio controls preload="none" src={item.primary_url} className="mt-3 h-9 w-full opacity-70" /> : null}

            <div className="mt-3 grid grid-cols-2 gap-2 text-[8px] text-white/25 sm:grid-cols-4">
              <div className="rounded-lg border border-white/6 p-2"><div className="text-[7px] uppercase text-white/15">LUFS</div><div className="mt-1 text-white/42">{item.kind === "MASTER" ? db(item.integrated_lufs, "LUFS") : "not certified"}</div></div>
              <div className="rounded-lg border border-white/6 p-2"><div className="text-[7px] uppercase text-white/15">True peak</div><div className="mt-1 text-white/42">{item.kind === "MASTER" ? db(item.true_peak_dbtp, "dBTP") : "not certified"}</div></div>
              <div className="rounded-lg border border-white/6 p-2"><div className="text-[7px] uppercase text-white/15">Peak</div><div className="mt-1 text-white/42">{db(item.peak_dbfs, "dBFS")}</div></div>
              <div className="rounded-lg border border-white/6 p-2"><div className="text-[7px] uppercase text-white/15">Headroom</div><div className="mt-1 text-white/42">{db(item.headroom_db, "dB")}</div></div>
            </div>

            {item.kind === "MASTER" && (!item.release_limiter_applied || !item.true_peak_certified) ? <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300/10 bg-amber-300/[0.015] p-2 text-[8px] leading-4 text-amber-100/50"><TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />This master record does not contain complete limiter/true-peak certification evidence.</div> : null}

            {item.deliveries?.length ? <div className="mt-3 flex flex-wrap gap-1.5">{item.deliveries.map((delivery, index) => delivery.url ? <a key={`${delivery.name}-${index}`} href={delivery.url} target="_blank" rel="noreferrer" className="rounded-lg border border-white/7 px-2 py-1.5 text-[8px] text-white/32">{delivery.name || delivery.mime_type || `Delivery ${index + 1}`}</a> : null)}</div> : null}

            {item.render_plan_fingerprint ? <div className="mt-3 font-mono text-[7px] text-white/12">Plan {item.render_plan_fingerprint.slice(0, 20)}…</div> : null}
          </div>
        ))}
        {!releases.length ? <div className="rounded-2xl border border-dashed border-white/8 px-6 py-12 text-center text-[10px] text-white/22">No Music release artifacts for this filter yet. Save the Workstation, then use Release Render to create a pre-master/master or stem.</div> : null}
      </div>
    </div>
  );
}
