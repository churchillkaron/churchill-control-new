"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Cpu, Database, Gauge, HardDrive, RefreshCw, Server, Zap } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function number(value, digits = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : "—";
}

function Metric({ label, value, detail, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-white/45">
        <span>{label}</span><Icon size={14} className="text-[#D6A66A]" />
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-white">{value}</div>
      <div className="mt-1 text-[10px] text-white/40">{detail}</div>
    </div>
  );
}

function StatePill({ online, children }) {
  return <span className={`rounded-full border px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.08em] ${online ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-red-400/20 bg-red-400/10 text-red-200"}`}>{children}</span>;
}

export default function ComputeAdministrationPage() {
  const business = useBusinessContext() || {};
  const organizationId = business.organization_id || business.organization?.id || null;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/workspace/administration/compute?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store", credentials: "include" });
      const json = await response.json();
      if (!response.ok || json?.success === false) throw new Error(json?.error || "Compute status unavailable");
      setData(json);
    } catch (e) {
      setError(e?.message || "Compute status unavailable");
    } finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, [load]);
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  const active = useMemo(() => jobs.filter((job) => ["QUEUED", "RUNNING"].includes(job.status)), [jobs]);
  return (
    <div className="mx-auto max-w-[1750px] space-y-5 pb-10 text-white">
      <section className="rounded-[26px] border border-white/10 bg-[#090909] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.28)] md:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-[#D6A66A]">Administration · Compute</div>
            <h1 className="mt-2 text-[31px] font-semibold tracking-[-0.04em]">Avantiqo Compute Control</h1>
            <p className="mt-2 max-w-3xl text-[12px] leading-6 text-white/50">
              Live owned compute, GPU capacity, local models, queue state and Modal overflow routing.
            </p>
          </div>
          <button onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 text-[11px] text-white/75 hover:bg-white/[0.08] disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-[11px] text-red-100">{error}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Nodes online" value={`${data?.metrics?.nodes_online || 0}/${data?.metrics?.nodes_total || 0}`} detail="Owned Avantiqo workers" icon={Server} />
        <Metric label="Queue" value={data?.metrics?.queue_depth || 0} detail={`${active.filter((job) => job.status === "RUNNING").length} running`} icon={Activity} />
        <Metric label="Avg latency" value={data?.metrics?.average_latency_ms ? `${number(data.metrics.average_latency_ms)} ms` : "—"} detail="Recent completed local jobs" icon={Gauge} />
        <Metric label="Completed" value={data?.metrics?.completed_jobs || 0} detail="Recent organization jobs" icon={Database} />
        <Metric label="Failed" value={data?.metrics?.failed_jobs || 0} detail="Recent local failures" icon={Zap} />
      </section>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <div className="space-y-3">
          {nodes.map((node) => {
            const meta = node.metadata || {};
            const gpu = meta.gpu || {};
            const memory = meta.memory || {};
            const disk = meta.disk || {};
            const models = Array.isArray(meta.models) ? meta.models : [];
            return (
              <div key={node.id} className="rounded-[24px] border border-white/10 bg-[#0C0C0C] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div><div className="text-[10px] uppercase tracking-[0.16em] text-white/35">{node.id}</div><div className="mt-1 text-lg font-semibold">{node.display_name}</div></div>
                  <StatePill online={node.online}>{node.online ? "Online" : "Offline"}</StatePill>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3"><div className="text-[9px] uppercase tracking-[0.13em] text-white/35">GPU</div><div className="mt-1 text-[12px] font-medium">{gpu.name || "—"}</div><div className="mt-1 text-[10px] text-white/40">Driver {gpu.driver || "—"}</div></div>
                  <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3"><div className="text-[9px] uppercase tracking-[0.13em] text-white/35">VRAM</div><div className="mt-1 text-[12px] font-medium">{number(gpu.vram_used_mb)} / {number(gpu.vram_total_mb)} MB</div><div className="mt-1 text-[10px] text-white/40">GPU {number(gpu.utilization_pct)}% · {number(gpu.temperature_c)}°C</div></div>
                  <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3"><div className="text-[9px] uppercase tracking-[0.13em] text-white/35">System</div><div className="mt-1 text-[12px] font-medium">{meta.cpu?.name || "—"}</div><div className="mt-1 text-[10px] text-white/40">RAM {number(memory.free_mb)} MB free · Disk {number(disk.c_free_gb,1)} GB free</div></div>
                  <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3"><div className="text-[9px] uppercase tracking-[0.13em] text-white/35">Power</div><div className="mt-1 text-[12px] font-medium">{gpu.power_w != null ? `${number(gpu.power_w,1)} W` : "—"}</div><div className="mt-1 text-[10px] text-white/40">Heartbeat {node.heartbeat_age_seconds != null ? `${node.heartbeat_age_seconds}s ago` : "—"}</div></div>
                </div>
                <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between"><div className="text-[9px] uppercase tracking-[0.13em] text-white/35">Local models</div><div className="text-[9px] text-[#D6A66A]">Ollama {meta.ollama_version || "—"}</div></div>
                  <div className="mt-2 flex flex-wrap gap-2">{models.length ? models.map((model) => <span key={model} className="rounded-full border border-[#D6A66A]/20 bg-[#D6A66A]/10 px-2.5 py-1 text-[9px] text-[#E6C79C]">{model}</span>) : <span className="text-[10px] text-white/35">No model telemetry</span>}</div>
                </div>
              </div>
            );
          })}
          {!nodes.length && !loading ? <div className="rounded-2xl border border-white/10 bg-[#0C0C0C] p-8 text-center text-[11px] text-white/40">No owned compute nodes registered.</div> : null}
        </div>

        <div className="rounded-[24px] border border-white/10 bg-[#0C0C0C] p-5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Routing policy</div>
          <div className="mt-4 space-y-3 text-[11px]">
            <div className="flex items-center justify-between border-b border-white/8 pb-3"><span className="text-white/55">Normal intelligence</span><span className="text-emerald-200">Local first</span></div>
            <div className="flex items-center justify-between border-b border-white/8 pb-3"><span className="text-white/55">Deep intelligence</span><span className="text-[#D6A66A]">Modal</span></div>
            <div className="flex items-center justify-between border-b border-white/8 pb-3"><span className="text-white/55">Image / video / music</span><span className="text-[#D6A66A]">Modal</span></div>
            <div className="flex items-center justify-between"><span className="text-white/55">Local transport</span><span className="text-white/70">Supabase pull queue</span></div>
          </div>
        </div>
      </section>
      <section className="rounded-[24px] border border-white/10 bg-[#0C0C0C] p-5">
        <div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Recent local work</div><h2 className="mt-1 text-lg font-semibold">Compute jobs</h2></div><Cpu size={17} className="text-[#D6A66A]" /></div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-[10px]">
            <thead className="text-white/35"><tr><th className="pb-2 pr-4 font-medium">Status</th><th className="pb-2 pr-4 font-medium">Lane</th><th className="pb-2 pr-4 font-medium">Workload</th><th className="pb-2 pr-4 font-medium">Model</th><th className="pb-2 pr-4 font-medium">Node</th><th className="pb-2 font-medium">Latency</th></tr></thead>
            <tbody className="divide-y divide-white/8">
              {jobs.slice(0, 30).map((job) => <tr key={job.id} className="text-white/65"><td className="py-2.5 pr-4">{job.status}</td><td className="py-2.5 pr-4">{job.lane}</td><td className="py-2.5 pr-4">{job.workload}</td><td className="py-2.5 pr-4">{job.model || "—"}</td><td className="py-2.5 pr-4">{job.node_id || "—"}</td><td className="py-2.5">{job.metrics?.elapsed_ms ? `${number(job.metrics.elapsed_ms)} ms` : "—"}</td></tr>)}
            </tbody>
          </table>
          {!jobs.length ? <div className="py-8 text-center text-[10px] text-white/35">No local compute jobs for this organization yet.</div> : null}
        </div>
      </section>
    </div>
  );
}
