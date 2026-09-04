"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ChevronRight, Clock3, MapPin, RefreshCw, ShieldCheck } from "lucide-react";

const TERMINAL = new Set(["complete", "completed", "cancelled", "canceled", "archived"]);
function text(value) { return String(value ?? "").trim(); }
function normalized(value) { return text(value).toLowerCase().replace(/[\s-]+/g, "_"); }
function isTerminal(row) { return TERMINAL.has(normalized(row?.work_order_status)) || normalized(row?.occurrence_status) === "completed"; }
function formatDateTime(value) { const d = value ? new Date(value) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Unscheduled"; }

export default function PestControlMonitoringRounds({ organizationId }) {
  const [state, setState] = useState({ loading: true, error: "", rows: [] });
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/service-management/technician?organizationId=${encodeURIComponent(organizationId)}&limit=500`, { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || "Monitoring rounds could not be loaded.");
      setState({ loading: false, error: "", rows: (body.rows || []).filter((row) => !isTerminal(row) && normalized(row.industry_key) === "pest_control") });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message || "Monitoring rounds could not be loaded." }));
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const needle = text(query).toLowerCase();
    return state.rows.filter((row) => !needle || [row.customer_name, row.customer_location_name, row.service_name, row.name].some((value) => text(value).toLowerCase().includes(needle)));
  }, [query, state.rows]);

  const fieldServiceHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service`;
  return <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#191919] md:px-7 lg:px-9 lg:py-7"><div className="mx-auto max-w-[1380px]">
    <header className="flex flex-col gap-4 border-b border-black/[0.07] pb-5 lg:flex-row lg:items-end lg:justify-between"><div><Link href={fieldServiceHref} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E]"><ArrowLeft size={10}/> Pest Control</Link><div className="mt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9A744B]">Monitoring execution</div><h1 className="mt-1 text-[27px] font-medium tracking-[-0.04em] text-[#201E1B]">Visit monitoring rounds</h1><p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#777169]">Open the exact customer visit, see which monitoring points are due, and complete the round without relying on memory or station lists outside Avantiqo.</p></div><button type="button" onClick={load} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#806143]"><RefreshCw size={11} className={state.loading ? "animate-spin" : ""}/></button></header>
    {state.error ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[10px] text-[#8B4937]"><AlertTriangle size={12}/>{state.error}</div> : null}
    <div className="mt-4 rounded-2xl border border-black/[0.07] bg-white p-3"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Customer, site or service" className="w-full rounded-xl border border-black/[0.08] bg-[#FAF9F7] px-3 py-2.5 text-[10px] outline-none"/></div>
    <section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((row) => <Link key={row.occurrence_id} href={`/workspace/${encodeURIComponent(organizationId)}/operations/field-service/monitoring-round/${encodeURIComponent(row.occurrence_id)}`} className="rounded-2xl border border-black/[0.07] bg-white p-4 transition hover:border-[#C7A071]/55"><div className="flex items-start justify-between gap-3"><div><div className="text-[12px] font-medium text-[#2E2A26]">{row.customer_name || "Customer"}</div><div className="mt-1 text-[9px] text-[#8E8880]">{row.service_name || row.name || "Service visit"}</div></div><ChevronRight size={12} className="text-[#9A744B]"/></div><div className="mt-4 grid gap-2"><div className="flex items-center gap-1.5 text-[8px] text-[#817B73]"><MapPin size={9}/>{row.customer_location_name || "Site not named"}</div><div className="flex items-center gap-1.5 text-[8px] text-[#817B73]"><Clock3 size={9}/>{formatDateTime(row.scheduled_start || row.occurrence_at)}</div><div className="flex items-center gap-1.5 text-[8px] text-[#817B73]"><ShieldCheck size={9}/> Governed visit coverage</div></div></Link>)}{!state.loading && !rows.length ? <div className="rounded-2xl border border-dashed border-black/[0.09] bg-white/60 px-5 py-10 text-center text-[9px] text-[#938D85]">No active Pest Control visits match this view.</div> : null}</section>
  </div></main>;
}
