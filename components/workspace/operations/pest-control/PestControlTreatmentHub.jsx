"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Beaker, CheckCircle2, Clock3, MapPin, RefreshCw } from "lucide-react";

function text(value) { return String(value ?? "").trim(); }
function normalized(value) { return text(value).toLowerCase().replace(/[\s-]+/g, "_"); }
function dateValue(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null; }
function formatWhen(value) { const date = dateValue(value); return date ? `${date.toLocaleDateString([], { month: "short", day: "numeric" })} · ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "No schedule"; }
function isTerminal(row) { return ["completed", "cancelled", "canceled", "archived"].includes(normalized(row?.occurrence_status)) || ["completed", "cancelled", "canceled", "archived"].includes(normalized(row?.work_order_status)); }

export default function PestControlTreatmentHub({ organizationId }) {
  const [state, setState] = useState({ loading: true, error: "", rows: [] });
  const [view, setView] = useState("active");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/service-management/technician?organizationId=${encodeURIComponent(organizationId)}&limit=500`, { cache: "no-store", credentials: "include" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Treatment visit queue could not be loaded.");
      setState({ loading: false, error: "", rows: Array.isArray(json.rows) ? json.rows : [] });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Treatment visit queue could not be loaded.", rows: [] });
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const ordered = [...state.rows].sort((a, b) => new Date(a.scheduled_start || a.occurrence_at || 0) - new Date(b.scheduled_start || b.occurrence_at || 0));
    if (view === "all") return ordered;
    if (view === "completed") return ordered.filter(isTerminal);
    return ordered.filter((row) => !isTerminal(row));
  }, [state.rows, view]);

  const fieldServiceHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service`;
  const technicianHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/technician`;

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#191919] md:px-7 lg:px-9 lg:py-7">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.07] pb-5">
          <div>
            <Link href={fieldServiceHref} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E] hover:text-[#79593A]"><ArrowLeft size={10} /> Pest Control</Link>
            <div className="mt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9A744B]">Treatment execution</div>
            <h1 className="mt-1 text-[27px] font-medium tracking-[-0.04em] text-[#201E1B]">Treatment register</h1>
            <p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#777169]">Record pest activity and every treatment application against the exact visit. Supply Chain remains the authoritative product and stock source.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={technicianHref} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] text-[#625D56]">Technician execution</Link>
            <button type="button" onClick={load} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#806143]" aria-label="Refresh treatment queue"><RefreshCw size={11} className={state.loading ? "animate-spin" : ""} /></button>
          </div>
        </header>

        {state.error ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[10px] text-[#8B4937]"><AlertTriangle size={12} className="mt-0.5" />{state.error}</div> : null}

        <section className="mt-5 rounded-2xl border border-black/[0.07] bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3">
            <div><div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#8A867F]">Visit treatment</div><div className="mt-0.5 text-[8px] text-[#9A948C]">Treatment is editable until service completion; stock is posted only at completion.</div></div>
            <div className="flex rounded-xl bg-[#F4F2EE] p-1">{[["active","Active"],["completed","Completed"],["all","All visits"]].map(([value,label]) => <button key={value} type="button" onClick={() => setView(value)} className={`rounded-lg px-3 py-2 text-[8px] font-medium ${view === value ? "bg-white text-[#5C4935] shadow-sm" : "text-[#8D877F]"}`}>{label}</button>)}</div>
          </div>
          <div className="divide-y divide-black/[0.055]">
            {!state.loading && rows.length === 0 ? <div className="px-4 py-12 text-center text-[10px] text-[#8D877F]">No service visits in this treatment view.</div> : null}
            {rows.map((row) => {
              const completed = isTerminal(row);
              const route = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/treatment/${encodeURIComponent(row.occurrence_id)}`;
              return <Link key={row.occurrence_id} href={route} className="grid gap-3 px-3 py-4 transition hover:bg-[#FBFAF8] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_150px_120px] md:items-center">
                <div className="min-w-0"><div className="truncate text-[11px] font-medium text-[#35312C]">{row.customer_name || "Customer"}</div><div className="mt-0.5 truncate text-[8px] text-[#8E8880]">{row.service_name || row.name || "Service visit"}</div></div>
                <div className="min-w-0 text-[8px] text-[#777169]"><div className="flex items-center gap-1"><MapPin size={9} /><span className="truncate">{row.customer_location_name || "Site not named"}</span></div><div className="mt-1 flex items-center gap-1"><Clock3 size={9} />{formatWhen(row.scheduled_start || row.occurrence_at)}</div></div>
                <div><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[7px] font-medium uppercase tracking-[0.05em] ${completed ? "border-[#748267]/18 bg-[#748267]/[0.05] text-[#607057]" : "border-[#C08A4A]/20 bg-[#C08A4A]/[0.05] text-[#8A6846]"}`}>{completed ? <CheckCircle2 size={8} /> : <Beaker size={8} />}{completed ? "Completed" : "Editable"}</span></div>
                <div className="text-right text-[8px] font-medium text-[#76583A]">{completed ? "Review →" : "Record treatment →"}</div>
              </Link>;
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
