"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CalendarClock, Cpu, Gauge, Gpu, RefreshCw, Server, Zap } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function number(value, digits = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : "—";
}

function Metric({ label, value, detail, icon: Icon }) {
  return <div className="rounded-2xl border border-black/[0.07] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)]"><div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.14em] text-[#817D76]"><span>{label}</span><Icon size={14} className="text-[#A37849]" /></div><div className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-[#1B1A18]">{value}</div><div className="mt-1 text-[10px] text-[#8A867F]">{detail}</div></div>;
}

function dateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("en-GB", { timeZone: "Asia/Bangkok", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "—";
}

function jobWhen(value) {
  if (!value) return { date: "—", time: "—" };
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { date: "—", time: "—" };
  return {
    date: date.toLocaleDateString("en-GB", { timeZone: "Asia/Bangkok", day: "2-digit", month: "short", year: "numeric" }),
    time: date.toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
  };
}

function computeLabel(job = {}) {
  if (job.execution_resource === "LOCAL_GPU") return "Node01 GPU";
  if (job.execution_resource === "LOCAL_CPU") return "Node01 CPU";
  if (String(job.execution_path || "").startsWith("LOCAL")) return "Node01 local";
  return job.execution_resource || "—";
}

function computeClass(job = {}) {
  if (job.execution_resource === "LOCAL_GPU" || String(job.execution_path || "").startsWith("LOCAL")) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (job.execution_resource === "LOCAL_CPU") return "border-[#A37849]/20 bg-[#FBF7F1] text-[#76532D]";
  return "border-[#D8D2C9] bg-[#F7F5F2] text-[#6F6B64]";
}


function liveClock(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return { date: "—", time: "—" };
  return {
    date: date.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" }),
    time: date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
  };
}

function money(value, currency = "THB") {
  const n = Number(value || 0);
  return `${number(n, 3)} ${currency || "THB"}`;
}

function StatePill({ online, stale = false, children }) {
  const classes = stale
    ? "border-amber-700/15 bg-amber-50 text-amber-800"
    : online
      ? "border-emerald-700/15 bg-emerald-50 text-emerald-800"
      : "border-red-700/15 bg-red-50 text-red-800";
  return <span className={`rounded-full border px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.08em] ${classes}`}>{children}</span>;
}

function Detail({ label, value, detail }) {
  return <div className="rounded-xl border border-black/[0.065] bg-[#FCFBF9] p-3"><div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#918B83]">{label}</div><div className="mt-1 text-[12px] font-medium text-[#37342F]">{value || "—"}</div>{detail ? <div className="mt-1 text-[10px] text-[#918B83]">{detail}</div> : null}</div>;
}

export default function ComputeAdministrationPage() {
  const business = useBusinessContext() || {};
  const organizationId = business.organization_id || business.organization?.id || null;
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [stale, setStale] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const cacheKey = organizationId ? `avantiqo.compute.last-good:${organizationId}` : "";
  useEffect(() => {
    if (!cacheKey || typeof window === "undefined") return;
    try {
      const cached = JSON.parse(window.sessionStorage.getItem(cacheKey) || "null");
      if (cached?.success === true && cached?.generated_at) {
        setData(cached);
        setStale(true);
      }
    } catch {}
  }, [cacheKey]);
  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/workspace/administration/compute?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store", credentials: "include" });
      const json = await response.json();
      if (!response.ok || json?.success === false) throw new Error(json?.error || "Compute status unavailable");
      setData(json);
      setStale(false);
      if (cacheKey && typeof window !== "undefined") {
        try { window.sessionStorage.setItem(cacheKey, JSON.stringify(json)); } catch {}
      }
    } catch (e) {
      setError(e?.message || "Compute status unavailable");
      setStale(true);
    } finally {
      setLoading(false);
    }
  }, [organizationId, cacheKey]);
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, [load]);
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const jobs = useMemo(() => (Array.isArray(data?.jobs) ? data.jobs : []), [data?.jobs]);
  const modalUsage = Array.isArray(data?.modal_usage) ? data.modal_usage : [];
  const operationalJobs = useMemo(() => jobs.filter((job) => job.job_class !== "CERTIFICATION"), [jobs]);
  const certificationJobs = useMemo(() => jobs.filter((job) => job.job_class === "CERTIFICATION"), [jobs]);
  const productionJobs = useMemo(() => operationalJobs
    .map((job) => ({ ...job, source: "LOCAL", occurred_at: job.completed_at || job.started_at || job.created_at }))
    .sort((a, b) => new Date(b.occurred_at || 0).getTime() - new Date(a.occurred_at || 0).getTime()), [operationalJobs]);
  const active = useMemo(() => productionJobs.filter((job) => ["QUEUED", "RUNNING"].includes(job.status)), [productionJobs]);
  const clock = liveClock(now);
  return <div className="mx-auto max-w-[1750px] space-y-5 pb-10 text-[#1B1A18]">
    <section className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.055)] md:p-7"><div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><div className="text-[11px] font-medium uppercase tracking-[0.24em] text-[#A37849]">Administration · Compute</div><h1 className="mt-2 text-[31px] font-semibold tracking-[-0.04em]">Avantiqo Compute Control</h1><p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#6F6B64]">Owned compute, model routing, live capacity, queue state and overflow control.</p></div><div className="flex flex-wrap items-center gap-2"><a href={`/workspace/${organizationId}/developers`} className="inline-flex h-10 items-center rounded-xl border border-black/[0.07] bg-white px-3.5 text-[11px] font-medium text-[#5F5A53]">← Developer Portal</a><div className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/[0.07] bg-[#FCFBF9] px-3.5 text-[11px] text-[#5F5A53]"><CalendarClock size={14} className="text-[#A37849]" /><span className="font-medium text-[#37342F]">{clock.date}</span><span className="font-mono text-[10px] text-[#76532D]">{clock.time}</span></div><button onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#A37849]/25 bg-[#FBF7F1] px-3.5 text-[11px] font-medium text-[#76532D] hover:bg-[#F7F0E8] disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh</button></div></div></section>
    {error ? <div className="rounded-2xl border border-amber-700/15 bg-amber-50 p-4 text-[11px] text-amber-900">{data ? `Live compute refresh failed. Showing the last known-good snapshot from ${dateTime(data.generated_at)}. ${error}` : `Live compute status is unavailable. Capacity is unknown; it is not being reported as zero. ${error}`}</div> : null}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Metric label="Nodes online" value={data ? `${number(data?.metrics?.nodes_online)}/${number(data?.metrics?.nodes_total)}` : "—"} detail={stale && data ? "Last known-good owned worker state" : "Owned Avantiqo workers"} icon={Server} /><Metric label="Local GPU" value={data ? number(data?.metrics?.local_gpu_jobs) : "—"} detail={data ? `${number(data?.metrics?.local_gpu_completed_jobs)} completed · managed GPU lane` : "Live status unavailable"} icon={Gpu} /><Metric label="Local CPU" value={data ? number(data?.metrics?.local_cpu_jobs) : "—"} detail={data ? `${number(data?.metrics?.local_cpu_completed_jobs)} completed · media/DSP` : "Live status unavailable"} icon={Cpu} /><Metric label="Queue" value={data ? number(data?.metrics?.queue_depth) : "—"} detail={data ? `${active.filter((job) => job.status === "RUNNING").length} running · priority aware` : "Live status unavailable"} icon={Activity} /><Metric label="Local today" value={data ? `${number(data?.metrics?.local_compute_hours_today, 3)} h` : "—"} detail={data?.metrics?.active_product ? `Active: ${data.metrics.active_product}` : stale && data ? "Last known-good owned compute runtime" : "Owned compute runtime"} icon={Gauge} /><Metric label="Avoided supplier cost" value={data ? money(data?.metrics?.estimated_avoided_supplier_cost_30d, data?.metrics?.estimated_avoided_supplier_cost_currency) : "—"} detail={data ? `${number(data?.metrics?.estimated_avoided_supplier_cost_comparable_jobs)} comparable local jobs · cloud fallback disabled` : "Live status unavailable"} icon={Zap} /></section>
    <section className="grid gap-4 xl:grid-cols-3"><div className="rounded-[22px] border border-black/[0.075] bg-white p-4"><div className="text-[9px] uppercase tracking-[0.14em] text-[#918B83]">Scheduler</div><div className="mt-2 text-sm font-semibold">Resource-aware priority</div><div className="mt-1 text-[10px] leading-5 text-[#6F6B64]">Interactive Business Partner and Voice work outrank background work. GPU specialist models are exclusive; CPU media runs independently below normal priority.</div></div><div className="rounded-[22px] border border-black/[0.075] bg-white p-4"><div className="text-[9px] uppercase tracking-[0.14em] text-[#918B83]">GPU residency</div><div className="mt-2 text-sm font-semibold">Qwen warm while idle</div><div className="mt-1 text-[10px] leading-5 text-[#6F6B64]">Qwen stays resident for fast Business Partner responses and yields VRAM only when Whisper, Swin2SR, Demucs or torchcrepe needs the card.</div></div><div className="rounded-[22px] border border-black/[0.075] bg-white p-4"><div className="text-[9px] uppercase tracking-[0.14em] text-[#918B83]">Night learning</div><div className="mt-2 text-sm font-semibold">{number(data?.metrics?.idle_learning_receipts_total || 0)} durable evaluations</div><div className="mt-1 text-[10px] leading-5 text-[#6F6B64]">01:00–06:00 · after 15 minutes idle · queued GPU work is claimed first. {data?.metrics?.idle_learning_last_topic ? `Last: ${data.metrics.idle_learning_last_topic} · ${dateTime(data.metrics.idle_learning_last_evaluated_at)}.` : "No durable evaluation yet."} Automatic knowledge/model promotion remains forbidden.</div></div></section>
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]"><div className="space-y-3">{nodes.map((node) => { const meta=node.metadata||{}, gpu=meta.gpu||{}, memory=meta.memory||{}, disk=meta.disk||{}, models=Array.isArray(meta.models)?meta.models:[]; return <div key={node.id} className="rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] uppercase tracking-[0.16em] text-[#918B83]">{node.id}</div><div className="mt-1 text-lg font-semibold">{node.display_name}</div></div><StatePill online={node.online} stale={stale}>{stale ? (node.online ? "Last known online" : "Last known offline") : node.online ? "Online" : "Offline"}</StatePill></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Detail label="GPU-backed intelligence" value={gpu.name ? `${gpu.name} · ACTIVE` : "—"} detail={`Qwen 4B local GPU · Driver ${gpu.driver || "—"}`} /><Detail label="VRAM" value={`${number(gpu.vram_used_mb)} / ${number(gpu.vram_total_mb)} MB`} detail={`GPU ${number(gpu.utilization_pct)}% · ${number(gpu.temperature_c)}°C`} /><Detail label="System" value={meta.cpu?.name} detail={`RAM ${number(memory.free_mb)} MB free · Disk ${number(disk.c_free_gb,1)} GB free`} /><Detail label="Power" value={gpu.power_w != null ? `${number(gpu.power_w,1)} W` : "—"} detail={`Heartbeat ${node.heartbeat_age_seconds != null ? `${node.heartbeat_age_seconds}s ago` : "—"}`} /></div><div className="mt-4 rounded-xl border border-black/[0.065] bg-[#FCFBF9] p-3"><div className="flex items-center justify-between"><div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#918B83]">Local models</div><div className="text-[9px] text-[#A37849]">Ollama {meta.ollama_version || "—"}</div></div><div className="mt-2 flex flex-wrap gap-2">{models.length ? models.map((model) => <span key={model} className="rounded-full border border-[#A37849]/20 bg-[#F7F0E8] px-2.5 py-1 text-[9px] text-[#76532D]">{model}</span>) : <span className="text-[10px] text-[#918B83]">No model telemetry</span>}</div></div></div>; })}</div>
      <div className="rounded-[24px] border border-black/[0.075] bg-white p-5"><div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#918B83]">Routing policy · product use</div><div className="mt-4 space-y-3 text-[11px]"><div className="flex items-center justify-between border-b border-black/[0.06] pb-3"><span className="text-[#6F6B64]">Business Partner / Intelligence</span><span className="font-medium text-emerald-700">Local GPU · Qwen 4B</span></div><div className="flex items-center justify-between border-b border-black/[0.06] pb-3"><span className="text-[#6F6B64]">Creative Studio reasoning</span><span className="font-medium text-emerald-700">Local GPU first</span></div><div className="flex items-center justify-between border-b border-black/[0.06] pb-3"><span className="text-[#6F6B64]">Voice / speech-to-text</span><span className="font-medium text-emerald-700">Local GPU · Whisper Large v3 Turbo</span></div><div className="flex items-center justify-between border-b border-black/[0.06] pb-3"><span className="text-[#6F6B64]">Voice / text-to-speech</span><span className="font-medium text-[#A37849]">Local GPU only</span></div><div className="flex items-center justify-between border-b border-black/[0.06] pb-3"><span className="text-[#6F6B64]">Music / Audio DSP</span><span className="font-medium text-emerald-700">Local CPU first</span></div><div className="flex items-center justify-between border-b border-black/[0.06] pb-3"><span className="text-[#6F6B64]">Video / Media post-production</span><span className="font-medium text-emerald-700">Local CPU · FFmpeg first</span></div><div className="flex items-center justify-between border-b border-black/[0.06] pb-3"><span className="text-[#6F6B64]">Image upscaling</span><span className="font-medium text-[#A37849]">Local GPU · Swin2SR 4×</span></div><div className="flex items-center justify-between border-b border-black/[0.06] pb-3"><span className="text-[#6F6B64]">Music stems / vocal correction</span><span className="font-medium text-emerald-700">Local GPU first · Demucs / torchcrepe</span></div><div className="flex items-center justify-between border-b border-black/[0.06] pb-3"><span className="text-[#6F6B64]">Image / video generation & vision</span><span className="font-medium text-[#A37849]">Node01 local only</span></div><div className="flex items-center justify-between border-b border-black/[0.06] pb-3"><span className="text-[#6F6B64]">Deep / long-context creative reasoning</span><span className="font-medium text-[#A37849]">Node01 local only</span></div><div className="flex items-center justify-between"><span className="text-[#6F6B64]">Local transport</span><span className="text-[#4A4640]">Supabase pull queue</span></div></div></div></section>
    <section className="rounded-[24px] border border-black/[0.075] bg-white p-5"><div className="flex items-center justify-between"><div><div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#918B83]">Operational compute</div><h2 className="mt-1 text-lg font-semibold">Production jobs</h2><p className="mt-1 text-[10px] text-[#918B83]">Current Node01 production workload only. Times are shown in Thailand time (ICT / UTC+7). Certification, migration and canary runs are excluded.</p></div><Cpu size={17} className="text-[#A37849]" /></div><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-[10px]"><thead className="text-[#918B83]"><tr><th className="pb-2 pr-4 font-medium">Date & time</th><th className="pb-2 pr-4 font-medium">Status</th><th className="pb-2 pr-4 font-medium">Product</th><th className="pb-2 pr-4 font-medium">Lane</th><th className="pb-2 pr-4 font-medium">Workload</th><th className="pb-2 pr-4 font-medium">Model</th><th className="pb-2 pr-4 font-medium">Compute</th><th className="pb-2 pr-4 font-medium">Runtime path</th><th className="pb-2 pr-4 font-medium">Latency</th><th className="pb-2 font-medium">Failure reason</th></tr></thead><tbody className="divide-y divide-black/[0.055]">{productionJobs.slice(0,50).map((job)=>{ const when=jobWhen(job.occurred_at); return <tr key={`${job.source || "job"}:${job.id}`} className="text-[#5F5A53]"><td className="py-2.5 pr-4 whitespace-nowrap"><div className="font-medium text-[#37342F]">{when.date}</div><div className="mt-0.5 font-mono text-[9px] text-[#918B83]">{when.time} ICT</div></td><td className={`py-2.5 pr-4 font-medium ${job.status === "FAILED" ? "text-red-700" : ""}`}>{job.status}</td><td className="py-2.5 pr-4"><span className="rounded-full border border-[#A37849]/15 bg-[#FBF7F1] px-2 py-1 text-[9px] font-medium text-[#76532D]">{job.product_area || "Platform / Other"}</span></td><td className="py-2.5 pr-4">{job.lane || "—"}</td><td className="py-2.5 pr-4">{job.workload || "—"}</td><td className="py-2.5 pr-4"><div className="font-medium text-[#37342F]">{job.runtime_model || job.model || "—"}</div><div className="mt-0.5 text-[9px] text-[#9A948C]">{job.model && job.runtime_model !== job.model ? `requested ${job.model}` : "runtime model"}</div></td><td className="py-2.5 pr-4"><span className={`rounded-full border px-2 py-1 text-[9px] font-medium ${computeClass(job)}`}>{computeLabel(job)}</span></td><td className="py-2.5 pr-4 font-mono text-[9px]">{job.execution_path || "—"}</td><td className="py-2.5 pr-4">{job.metrics?.elapsed_ms ? `${number(job.metrics.elapsed_ms)} ms` : "—"}</td><td className="max-w-[420px] py-2.5 text-[9px] text-red-700">{job.status === "FAILED" ? (job.error_code || "Unknown failure") : "—"}</td></tr>;})}</tbody></table>{!productionJobs.length ? <div className="py-8 text-center text-[10px] text-[#918B83]">No production compute jobs for this organization yet.</div> : null}</div></section>
    <section className="rounded-[24px] border border-black/[0.075] bg-[#FCFBF9] p-5"><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#918B83]">Certification & migration</div><h2 className="mt-1 text-lg font-semibold">Test history</h2><p className="mt-1 text-[10px] text-[#918B83]">Canaries, probes, migration certification and debugging runs. These do not count toward production failure rate.</p></div><div className="text-right text-[10px] text-[#918B83]">{number(data?.metrics?.certification_jobs || 0)} runs · {number(data?.metrics?.certification_failed_jobs || 0)} failed</div></div><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-[10px]"><thead className="text-[#918B83]"><tr><th className="pb-2 pr-4 font-medium">Status</th><th className="pb-2 pr-4 font-medium">Usage / test</th><th className="pb-2 pr-4 font-medium">Workload</th><th className="pb-2 pr-4 font-medium">Model</th><th className="pb-2 pr-4 font-medium">Latency</th><th className="pb-2 font-medium">Failure reason</th></tr></thead><tbody className="divide-y divide-black/[0.055]">{certificationJobs.slice(0,40).map((job)=><tr key={job.id} className="text-[#6F6B64]"><td className={`py-2.5 pr-4 font-medium ${job.status === "FAILED" ? "text-red-700" : ""}`}>{job.status}</td><td className="py-2.5 pr-4 font-mono text-[9px]">{job.usage_id || "—"}</td><td className="py-2.5 pr-4">{job.workload || "—"}</td><td className="py-2.5 pr-4">{job.runtime_model || job.model || "—"}</td><td className="py-2.5 pr-4">{job.metrics?.elapsed_ms ? `${number(job.metrics.elapsed_ms)} ms` : "—"}</td><td className="max-w-[520px] py-2.5 text-[9px] text-red-700">{job.status === "FAILED" ? (job.error_code || "Unknown failure") : "—"}</td></tr>)}</tbody></table>{!certificationJobs.length ? <div className="py-8 text-center text-[10px] text-[#918B83]">No certification or migration jobs in recent history.</div> : null}</div></section>
    <section className="rounded-[24px] border border-black/[0.075] bg-white p-5"><div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#918B83]">Local candidate matrix</div><h2 className="mt-1 text-lg font-semibold">All engine execution on Node01</h2><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-[10px]"><thead className="text-[#918B83]"><tr><th className="pb-2 pr-4 font-medium">Product</th><th className="pb-2 pr-4 font-medium">Capability</th><th className="pb-2 pr-4 font-medium">Model</th><th className="pb-2 pr-4 font-medium">Resource</th><th className="pb-2 font-medium">Decision</th></tr></thead><tbody className="divide-y divide-black/[0.055]">{(data?.local_candidate_matrix || []).map((row)=><tr key={`${row.capability}-${row.model}`}><td className="py-2.5 pr-4">{row.product}</td><td className="py-2.5 pr-4 font-mono text-[9px]">{row.capability}</td><td className="py-2.5 pr-4">{row.model}</td><td className="py-2.5 pr-4">{row.resource}</td><td className={`py-2.5 font-medium ${row.status === "CERTIFIED_LOCAL" ? "text-emerald-700" : "text-[#A37849]"}`}>{row.status === "CERTIFIED_LOCAL" ? "Node 01 certified" : row.status === "CERTIFIED_LOCAL_BACKGROUND_MODAL_INTERACTIVE" ? "Node 01 certified" : "Local worker pending"}</td></tr>)}</tbody></table></div></section>
    <section className="rounded-[24px] border border-black/[0.075] bg-white p-5">
      <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#918B83]">Historical cloud audit · retired</div><h2 className="mt-1 text-lg font-semibold">Legacy supplier-compute evidence</h2><p className="mt-1 text-[10px] text-[#918B83]">Read-only historical records from before the Node01-only policy. These rows are not eligible execution routes and are never merged into current production jobs.</p></div><Server size={17} className="text-[#A37849]" /></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Detail label="Historical calls" value={number(data?.metrics?.modal_calls_30d || 0)} detail={`${number(data?.metrics?.modal_failed_calls_30d || 0)} failed historically`} /><Detail label="Historical supplier cost" value={money(data?.metrics?.modal_supplier_cost_30d || 0, data?.metrics?.modal_currency)} detail="Retained audit evidence only" /><Detail label="Historical avg latency" value={data?.metrics?.modal_average_latency_ms_30d ? `${number(data.metrics.modal_average_latency_ms_30d)} ms` : "—"} detail="Retired supplier calls" /><Detail label="Last historical use" value={dateTime(data?.metrics?.modal_last_used_at)} detail="Cloud execution is now disabled" /></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3"><Detail label="Cloud fallback" value="Disabled" detail="All AI/media execution is local-only" /><Detail label="Node01 policy" value="Enforced" detail="Unsupported capabilities fail closed" /><Detail label="Supplier compute" value="0" detail="No cloud GPU routing is permitted" /></div>
      {data?.metrics?.modal_telemetry_available === false ? <div className="mt-4 rounded-xl border border-[#A37849]/15 bg-[#FBF7F1] p-3 text-[10px] text-[#76532D]">Historical cloud ledger is not available in this environment. Current Node01 telemetry remains live.</div> : null}
      <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-[10px]"><thead className="text-[#918B83]"><tr><th className="pb-2 pr-4 font-medium">When</th><th className="pb-2 pr-4 font-medium">Product</th><th className="pb-2 pr-4 font-medium">Provider / capability</th><th className="pb-2 pr-4 font-medium">Model</th><th className="pb-2 pr-4 font-medium">Historical path</th><th className="pb-2 pr-4 font-medium">Routing class</th><th className="pb-2 pr-4 font-medium">Cost</th><th className="pb-2 pr-4 font-medium">Latency</th><th className="pb-2 font-medium">Status</th></tr></thead><tbody className="divide-y divide-black/[0.055]">{modalUsage.slice(0,40).map((row)=><tr key={row.id} className="text-[#5F5A53]"><td className="py-2.5 pr-4 whitespace-nowrap">{dateTime(row.created_at)}</td><td className="py-2.5 pr-4"><span className="rounded-full border border-[#A37849]/15 bg-[#FBF7F1] px-2 py-1 text-[9px] font-medium text-[#76532D]">{row.product_area || "Platform / Other"}</span></td><td className="py-2.5 pr-4"><div className="font-medium text-[#37342F]">{row.provider || "—"}</div><div className="mt-0.5 text-[9px] text-[#9A948C]">{row.capability || row.operation || "—"}</div></td><td className="py-2.5 pr-4 font-medium text-[#37342F]">{row.model || "—"}</td><td className="py-2.5 pr-4 font-mono text-[9px]">{row.request_path || "retired-cloud"}</td><td className="py-2.5 pr-4"><div className="font-medium text-[#37342F]">{row.routing_class || "—"}</div><div className="mt-0.5 text-[9px] text-[#9A948C]">{row.routing_reason || "—"}</div></td><td className="py-2.5 pr-4">{money(row.supplier_cost, row.currency)}</td><td className="py-2.5 pr-4">{row.latency_ms ? `${number(row.latency_ms)} ms` : "—"}</td><td className="py-2.5 font-medium">{row.status || "—"}</td></tr>)}</tbody></table>{!modalUsage.length ? <div className="py-8 text-center text-[10px] text-[#918B83]">No historical cloud-backed usage in the retained window.</div> : null}</div>
    </section>
  </div>;
}
