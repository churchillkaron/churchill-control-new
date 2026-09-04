"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Barcode,
  CheckCircle2,
  CircleDot,
  MapPin,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

function text(value) { return String(value ?? "").trim(); }
function normalized(value) { return text(value).toLowerCase().replace(/[\s-]+/g, "_"); }
function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}
function dueLabel(value) {
  if (value === "never_checked") return "Never checked";
  if (value === "overdue") return "Overdue";
  if (value === "due_today") return "Due today";
  if (value === "upcoming") return "Upcoming";
  return "No cadence";
}
function dueTone(value) {
  if (["never_checked", "overdue"].includes(value)) return "border-[#B36B52]/25 bg-[#B36B52]/[0.07] text-[#8B4937]";
  if (value === "due_today") return "border-[#D6A66A]/35 bg-[#D6A66A]/[0.10] text-[#806143]";
  return "border-[#6F8B77]/25 bg-[#6F8B77]/[0.08] text-[#55705D]";
}

function Metric({ label, value, detail, attention = false }) {
  return <div className="rounded-2xl border border-black/[0.07] bg-white px-4 py-3.5"><div className="text-[8px] font-medium uppercase tracking-[0.12em] text-[#918A82]">{label}</div><div className={`mt-2 text-[22px] font-medium tracking-[-0.03em] ${attention && Number(value) > 0 ? "text-[#98513D]" : "text-[#27231F]"}`}>{value}</div><div className="mt-1 text-[8px] leading-4 text-[#9A948C]">{detail}</div></div>;
}

export default function PestControlVisitMonitoringRound({ organizationId, occurrenceId }) {
  const [state, setState] = useState({ loading: true, error: "", round: null });
  const load = useCallback(async () => {
    if (!organizationId || !occurrenceId) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/service-management/monitoring-round?organizationId=${encodeURIComponent(organizationId)}&occurrenceId=${encodeURIComponent(occurrenceId)}`, { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || "Monitoring round could not be loaded.");
      setState({ loading: false, error: "", round: body.round || null });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message || "Monitoring round could not be loaded." }));
    }
  }, [occurrenceId, organizationId]);

  useEffect(() => { load(); }, [load]);
  const round = state.round;
  const required = useMemo(() => (round?.points || []).filter((point) => point.required_for_visit), [round]);
  const optional = useMemo(() => (round?.points || []).filter((point) => !point.required_for_visit), [round]);
  const technicianHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/technician`;

  function scanHref(point) {
    const params = new URLSearchParams({ occurrenceId, lookup: point.barcode || point.code });
    return `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/monitoring-points/visit-scan?${params.toString()}`;
  }

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#191919] md:px-7 lg:px-9 lg:py-7">
      <div className="mx-auto max-w-[1420px]">
        <header className="flex flex-col gap-4 border-b border-black/[0.07] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href={technicianHref} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E] hover:text-[#79593A]"><ArrowLeft size={10} /> Technician execution</Link>
            <div className="mt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9A744B]">Visit monitoring round</div>
            <h1 className="mt-1 text-[27px] font-medium tracking-[-0.04em] text-[#201E1B]">Required monitoring coverage</h1>
            <p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#777169]">Check every point that is due, overdue or has never been inspected at this exact customer site. Upcoming points stay visible but do not force unnecessary service.</p>
          </div>
          <button type="button" onClick={load} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#806143]" aria-label="Refresh monitoring round"><RefreshCw size={11} className={state.loading ? "animate-spin" : ""} /></button>
        </header>

        {state.error ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[10px] text-[#8B4937]"><AlertTriangle size={12} className="mt-0.5" />{state.error}</div> : null}

        {round ? <>
          <section className="mt-5 rounded-2xl border border-black/[0.07] bg-white p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#92704C]">{round.customer_name || "Customer"}</div><h2 className="mt-1 text-[20px] font-medium text-[#28231F]">{round.customer_location_name || "Customer site"}</h2><div className="mt-1 flex items-center gap-1.5 text-[9px] text-[#8B847C]"><MapPin size={10} /> Service date {formatDate(round.reference_at)}</div></div><div className={`rounded-full border px-3 py-1.5 text-[8px] font-medium uppercase tracking-[0.08em] ${round.completion_ready ? "border-[#6F8B77]/25 bg-[#6F8B77]/[0.08] text-[#55705D]" : "border-[#B36B52]/25 bg-[#B36B52]/[0.07] text-[#8B4937]"}`}>{round.completion_ready ? "Coverage ready" : `${round.pending_required_points} required pending`}</div></div>
          </section>

          <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Active points" value={round.active_points || 0} detail="Installed at this site" />
            <Metric label="Required" value={round.required_points || 0} detail="Due / overdue / never checked" />
            <Metric label="Checked" value={round.checked_required_points || 0} detail="Required points covered this visit" />
            <Metric label="Pending" value={round.pending_required_points || 0} detail="Blocks visit completion" attention />
          </section>

          <section className="mt-4 rounded-2xl border border-black/[0.07] bg-white p-4">
            <div className="flex items-center gap-2"><ShieldCheck size={13} className="text-[#987249]" /><div><div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#8B837A]">Required this visit</div><div className="mt-0.5 text-[8px] text-[#9B948C]">Completion cannot close while a required point is missing.</div></div></div>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">{required.map((point) => <div key={point.id} className={`rounded-xl border p-3.5 ${point.checked_in_visit ? "border-[#6F8B77]/20 bg-[#6F8B77]/[0.04]" : "border-[#B36B52]/20 bg-[#B36B52]/[0.035]"}`}><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="text-[11px] font-medium text-[#342F2A]">{point.code}</span><span className={`rounded-full border px-2 py-0.5 text-[7px] uppercase tracking-[0.06em] ${dueTone(point.due_state)}`}>{dueLabel(point.due_state)}</span></div><div className="mt-1 text-[8px] text-[#8F887F]">{point.point_type_label || point.point_type || "Monitoring point"}{point.area ? ` · ${point.area}` : ""}</div><div className="mt-1 text-[8px] text-[#A09A92]">{point.checked_in_visit ? `Checked · ${normalized(point.latest_visit_check?.condition).replaceAll("_", " ")} · ${normalized(point.latest_visit_check?.activity_level)} activity` : `Next due ${formatDate(point.next_check_at)}`}</div></div>{point.checked_in_visit ? <CheckCircle2 size={15} className="text-[#657B69]" /> : <CircleDot size={15} className="text-[#A05B48]" />}</div>{!point.checked_in_visit ? <Link href={scanHref(point)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#2A251F] px-3 py-2 text-[8px] font-medium text-white"><Barcode size={10} /> Scan & check</Link> : null}</div>)}{!required.length ? <div className="rounded-xl border border-[#6F8B77]/15 bg-[#6F8B77]/[0.04] px-4 py-5 text-[9px] text-[#607057]">No monitoring points are due for this visit. The technician can still inspect upcoming points if needed.</div> : null}</div>
          </section>

          {optional.length ? <section className="mt-4 rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#8B837A]">Upcoming / optional</div><div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{optional.map((point) => <div key={point.id} className="rounded-xl border border-black/[0.06] bg-[#FBFAF8] p-3"><div className="flex items-center justify-between gap-2"><div className="text-[10px] font-medium text-[#4A4540]">{point.code}</div><span className="text-[7px] uppercase tracking-[0.06em] text-[#8A847C]">{dueLabel(point.due_state)}</span></div><div className="mt-1 text-[8px] text-[#99938B]">{point.area || point.point_type_label || "Monitoring point"}</div><Link href={scanHref(point)} className="mt-2 inline-flex items-center gap-1 text-[8px] font-medium text-[#7B5D3E]"><Barcode size={9} /> Inspect anyway</Link></div>)}</div></section> : null}
        </> : null}
      </div>
    </main>
  );
}
