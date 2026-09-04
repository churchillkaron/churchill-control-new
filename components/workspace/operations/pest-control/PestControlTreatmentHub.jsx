"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Beaker,
  CheckCircle2,
  Clock3,
  MapPin,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";

function text(value) { return String(value ?? "").trim(); }
function normalized(value) { return text(value).toLowerCase().replace(/[\s-]+/g, "_"); }
function dateValue(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null; }
function formatWhen(value) { const date = dateValue(value); return date ? `${date.toLocaleDateString([], { month: "short", day: "numeric" })} · ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "No schedule"; }
function isTerminal(row) { return ["completed", "cancelled", "canceled", "archived"].includes(normalized(row?.occurrence_status)) || ["completed", "cancelled", "canceled", "archived"].includes(normalized(row?.work_order_status)); }
function scheduledDate(row) { return dateValue(row?.scheduled_start || row?.occurrence_at); }
function isToday(row) { const date = scheduledDate(row); if (!date) return false; const now = new Date(); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate(); }
function isOverdue(row) { const date = scheduledDate(row); return Boolean(date && !isTerminal(row) && date.getTime() < Date.now()); }

function Metric({ label, value, detail, attention = false }) {
  return <div className="rounded-2xl border border-black/[0.07] bg-white px-4 py-3.5"><div className="text-[8px] font-medium uppercase tracking-[0.12em] text-[#918A82]">{label}</div><div className={`mt-2 text-[22px] font-medium tracking-[-0.03em] ${attention && Number(value) > 0 ? "text-[#98513D]" : "text-[#27231F]"}`}>{value}</div><div className="mt-1 text-[8px] leading-4 text-[#9A948C]">{detail}</div></div>;
}

export default function PestControlTreatmentHub({ organizationId }) {
  const [state, setState] = useState({ loading: true, error: "", rows: [] });
  const [view, setView] = useState("active");
  const [query, setQuery] = useState("");

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

  const metrics = useMemo(() => ({
    active: state.rows.filter((row) => !isTerminal(row)).length,
    today: state.rows.filter((row) => !isTerminal(row) && isToday(row)).length,
    overdue: state.rows.filter(isOverdue).length,
    unassigned: state.rows.filter((row) => !isTerminal(row) && !text(row.assigned_to)).length,
    completed: state.rows.filter(isTerminal).length,
  }), [state.rows]);

  const rows = useMemo(() => {
    const needle = text(query).toLowerCase();
    const ordered = [...state.rows].sort((a, b) => {
      if (isOverdue(a) !== isOverdue(b)) return isOverdue(a) ? -1 : 1;
      return new Date(a.scheduled_start || a.occurrence_at || 0) - new Date(b.scheduled_start || b.occurrence_at || 0);
    });
    const viewed = view === "all" ? ordered : view === "completed" ? ordered.filter(isTerminal) : view === "today" ? ordered.filter((row) => !isTerminal(row) && isToday(row)) : ordered.filter((row) => !isTerminal(row));
    if (!needle) return viewed;
    return viewed.filter((row) => [row.customer_name, row.customer_location_name, row.service_name, row.name, row.assigned_to_name].some((value) => text(value).toLowerCase().includes(needle)));
  }, [query, state.rows, view]);

  const fieldServiceHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service`;
  const technicianHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/technician`;

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#191919] md:px-7 lg:px-9 lg:py-7">
      <div className="mx-auto max-w-[1580px]">
        <header className="flex flex-col gap-5 border-b border-black/[0.07] pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link href={fieldServiceHref} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E] hover:text-[#79593A]"><ArrowLeft size={10} /> Pest Control</Link>
            <div className="mt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9A744B]">Treatment execution</div>
            <h1 className="mt-1 text-[27px] font-medium tracking-[-0.04em] text-[#201E1B]">Treatment register</h1>
            <p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#777169]">A working queue for supervisors and technicians: see what needs attention, open the exact visit, record treatment, then hand it into governed evidence and completion.</p>
          </div>
          <div className="flex items-center gap-2"><Link href={technicianHref} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] text-[#625D56]">Technician execution</Link><button type="button" onClick={load} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#806143]" aria-label="Refresh treatment queue"><RefreshCw size={11} className={state.loading ? "animate-spin" : ""} /></button></div>
        </header>

        {state.error ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[10px] text-[#8B4937]"><AlertTriangle size={12} className="mt-0.5" />{state.error}</div> : null}

        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Metric label="Active visits" value={state.loading ? "…" : metrics.active} detail="Treatment can still change" />
          <Metric label="Today" value={state.loading ? "…" : metrics.today} detail="Scheduled for this service day" />
          <Metric label="Overdue" value={state.loading ? "…" : metrics.overdue} detail="Past schedule and still open" attention />
          <Metric label="Unassigned" value={state.loading ? "…" : metrics.unassigned} detail="No accountable technician" attention />
          <Metric label="Completed" value={state.loading ? "…" : metrics.completed} detail="Closed treatment history" />
        </section>

        <section className="mt-4 rounded-2xl border border-black/[0.07] bg-white p-3">
          <div className="flex flex-col gap-3 border-b border-black/[0.055] px-1 pb-3 lg:flex-row lg:items-center lg:justify-between">
            <div><div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#8A867F]">Visit treatment queue</div><div className="mt-0.5 text-[8px] text-[#9A948C]">Overdue work rises first. Treatment remains editable until service completion; stock posts only when governed completion succeeds.</div></div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex h-9 min-w-[220px] items-center gap-2 rounded-xl border border-black/[0.08] bg-[#FBFAF8] px-3"><Search size={10} className="text-[#9A948C]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Customer, site, service…" className="w-full bg-transparent text-[9px] text-[#4A453F] outline-none placeholder:text-[#AAA49C]" /></label>
              <div className="flex rounded-xl bg-[#F4F2EE] p-1">{[["active","Active"],["today","Today"],["completed","Completed"],["all","All"]].map(([value,label]) => <button key={value} type="button" onClick={() => setView(value)} className={`rounded-lg px-3 py-2 text-[8px] font-medium ${view === value ? "bg-white text-[#5C4935] shadow-sm" : "text-[#8D877F]"}`}>{label}</button>)}</div>
            </div>
          </div>

          <div className="divide-y divide-black/[0.055]">
            {!state.loading && rows.length === 0 ? <div className="px-4 py-12 text-center text-[10px] text-[#8D877F]">No service visits match this treatment view.</div> : null}
            {rows.map((row) => {
              const completed = isTerminal(row);
              const overdue = isOverdue(row);
              const route = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/treatment/${encodeURIComponent(row.occurrence_id)}`;
              const statusLabel = completed ? "Completed" : overdue ? "Overdue" : isToday(row) ? "Today" : "Editable";
              const statusTone = completed ? "border-[#748267]/18 bg-[#748267]/[0.05] text-[#607057]" : overdue ? "border-[#B36B52]/20 bg-[#B36B52]/[0.06] text-[#98513D]" : isToday(row) ? "border-[#C08A4A]/20 bg-[#C08A4A]/[0.06] text-[#8A6846]" : "border-black/[0.07] bg-[#F7F6F3] text-[#77736C]";
              return <Link key={row.occurrence_id} href={route} className="grid gap-3 px-3 py-4 transition hover:bg-[#FBFAF8] md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(120px,.6fr)_110px] md:items-center">
                <div className="min-w-0"><div className="truncate text-[11px] font-medium text-[#35312C]">{row.customer_name || "Customer"}</div><div className="mt-0.5 truncate text-[8px] text-[#8E8880]">{row.service_name || row.name || "Service visit"}</div></div>
                <div className="min-w-0 text-[8px] text-[#777169]"><div className="flex items-center gap-1"><MapPin size={9} /><span className="truncate">{row.customer_location_name || "Site not named"}</span></div><div className="mt-1 flex items-center gap-1"><Clock3 size={9} />{formatWhen(row.scheduled_start || row.occurrence_at)}</div></div>
                <div className="min-w-0"><div className="flex items-center gap-1 text-[8px] text-[#777169]"><UserRound size={9} /><span className="truncate">{row.assigned_to_name || row.assigned_to || "Unassigned"}</span></div><span className={`mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[7px] font-medium uppercase tracking-[0.05em] ${statusTone}`}>{completed ? <CheckCircle2 size={8} /> : <Beaker size={8} />}{statusLabel}</span></div>
                <div className="text-right text-[8px] font-medium text-[#76583A]">{completed ? "Review →" : "Open visit →"}</div>
              </Link>;
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
