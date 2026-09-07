"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldAlert,
  UserRound,
  Wrench,
} from "lucide-react";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

function normalized(value) { return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_"); }
function formatDate(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date) : "—"; }
function severityTone(value) {
  const severity = normalized(value);
  if (severity === "critical") return "border-[#B7654C]/25 bg-[#B7654C]/[0.08] text-[#914B38]";
  if (severity === "high") return "border-[#C08A4A]/25 bg-[#C08A4A]/[0.07] text-[#805D35]";
  if (severity === "medium") return "border-[#8A765D]/18 bg-[#8A765D]/[0.05] text-[#725F47]";
  return "border-black/[0.08] bg-black/[0.025] text-[#777169]";
}
function stageLabel(stage) {
  return ({ needs_review: "Needs review", needs_approval: "Needs approval", ready_for_corrective_visit: "Approved · create visit", needs_assignment: "Needs technician", assigned: "Assigned", released_to_technician: "Released", corrective_in_progress: "In progress", completed_pending_resolution: "Checking resolution", resolved: "Resolved" }[stage] || String(stage || "").replaceAll("_", " "));
}
function stageTone(stage) {
  if (stage === "resolved") return "border-[#748267]/18 bg-[#748267]/[0.06] text-[#607057]";
  if (["needs_review", "needs_approval", "ready_for_corrective_visit"].includes(stage)) return "border-[#C08A4A]/20 bg-[#C08A4A]/[0.06] text-[#76583A]";
  if (["corrective_in_progress", "released_to_technician", "assigned"].includes(stage)) return "border-[#7D8890]/20 bg-[#7D8890]/[0.06] text-[#637079]";
  return "border-black/[0.08] bg-black/[0.025] text-[#777169]";
}

export default function CorrectiveServiceControlPage() {
  const params = useParams();
  const { organization, loading: organizationLoading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";
  const [state, setState] = useState({ loading: true, error: "", rows: [], counts: {} });
  const [tab, setTab] = useState("open");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/service-management/corrective-control?organizationId=${encodeURIComponent(organizationId)}&limit=1000`, { cache: "no-store", credentials: "include" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Corrective service control could not be loaded.");
      setState({ loading: false, error: "", rows: json.rows || [], counts: json.counts || {} });
    } catch (error) { setState((current) => ({ ...current, loading: false, error: error?.message || "Corrective service control could not be loaded." })); }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => state.rows.filter((row) => tab === "all" ? true : tab === "resolved" ? row.stage === "resolved" : tab === "overdue" ? row.overdue : row.stage !== "resolved").sort((a, b) => {
    const aUrgent = Number(a.overdue) * 10 + ({ critical: 4, high: 3, medium: 2, low: 1 }[a.severity] || 0);
    const bUrgent = Number(b.overdue) * 10 + ({ critical: 4, high: 3, medium: 2, low: 1 }[b.severity] || 0);
    if (aUrgent !== bUrgent) return bUrgent - aUrgent;
    return new Date(a.sla_due_at || 8640000000000000) - new Date(b.sla_due_at || 8640000000000000);
  }), [state.rows, tab]);

  async function runRequestCommand(row, command) {
    setBusy(`${row.work_request_id}:${command}`); setNotice("");
    try {
      const response = await fetch(`/api/operations/work-requests/commands/${command}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, id: row.work_request_id, record_id: row.work_request_id, ...(command === "approve" ? { approval_note: "Approved from Pest Control corrective service control." } : {}) }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || `${command} failed.`);
      setNotice(command === "submit" ? "Follow-up sent for approval." : "Follow-up approved. It can now become a corrective service visit.");
      await load();
    } catch (error) { setNotice(error?.message || `${command} failed.`); }
    finally { setBusy(""); }
  }

  async function createCorrectiveVisit(row) {
    setBusy(`${row.work_request_id}:convert`); setNotice("");
    try {
      const response = await fetch(`/api/operations/work-requests/${encodeURIComponent(row.work_request_id)}/convert-service-follow-up`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Corrective visit could not be created.");
      setNotice("Corrective service visit created. Assign and release it through Work Control, then the technician executes the new occurrence.");
      await load();
    } catch (error) { setNotice(error?.message || "Corrective visit could not be created."); }
    finally { setBusy(""); }
  }

  function actionFor(row) {
    const status = normalized(row.work_request_status);
    if (row.stage === "needs_review") return { label: "Send for approval", action: () => runRequestCommand(row, "submit") };
    if (row.stage === "needs_approval") return { label: "Approve follow-up", action: () => runRequestCommand(row, "approve") };
    if (row.stage === "ready_for_corrective_visit") return { label: "Create corrective visit", action: () => createCorrectiveVisit(row) };
    if (row.corrective_work_order_id && ["needs_assignment", "assigned"].includes(row.stage)) return { label: row.stage === "assigned" ? "Release / manage visit" : "Assign technician", href: `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/work-control?workOrderId=${encodeURIComponent(row.corrective_work_order_id)}` };
    if (row.corrective_work_order_id && row.corrective_occurrence_id && ["released_to_technician", "corrective_in_progress"].includes(row.stage)) return { label: row.stage === "corrective_in_progress" ? "Continue corrective visit" : "Open technician visit", href: `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/technician?workOrderId=${encodeURIComponent(row.corrective_work_order_id)}&occurrenceId=${encodeURIComponent(row.corrective_occurrence_id)}` };
    if (row.stage === "resolved") return { label: "Resolved", disabled: true };
    if (status === "approved" && row.corrective_work_order_id) return { label: "Open Work Control", href: `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/work-control?workOrderId=${encodeURIComponent(row.corrective_work_order_id)}` };
    return null;
  }

  if (organizationLoading) return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing corrective service control…</div>;

  return <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#201E1B] md:px-7 lg:px-9 lg:py-7"><div className="mx-auto max-w-[1580px]">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.07] pb-5"><div><Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/field-service`} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E]"><ArrowLeft size={10} /> Pest Control</Link><div className="mt-3 text-[9px] font-medium uppercase tracking-[0.16em] text-[#9A744B]">Corrective service</div><h1 className="mt-1 text-[28px] font-medium tracking-[-0.04em]">Close every callback</h1><p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#777169]">One queue from technician issue to approval, corrective visit and verified resolution. Nothing disappears because the original visit was already completed.</p></div><button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[9px]"><RefreshCw size={10} className={state.loading ? "animate-spin" : ""} />Refresh</button></header>

    {state.error ? <div className="mt-4 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[10px] text-[#8B4937]">{state.error}</div> : null}
    {notice ? <div className={`mt-4 rounded-xl border px-4 py-3 text-[10px] ${/failed|could not|error/i.test(notice) ? "border-[#B36B52]/20 bg-[#B36B52]/[0.05] text-[#8B4937]" : "border-[#748267]/18 bg-[#748267]/[0.05] text-[#607057]"}`}>{notice}</div> : null}

    <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{[["Open", state.counts.open || 0, "Need human ownership"], ["Overdue", state.counts.overdue || 0, "Past corrective target"], ["Critical", state.counts.critical || 0, "Urgent site risk"], ["Approval", state.counts.needs_approval || 0, "Waiting decision"], ["Field work", state.counts.in_field || 0, "Corrective visit active"], ["Resolved", state.counts.resolved || 0, "Verified closed loop"]].map(([label, value, detail]) => <div key={label} className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[8px] uppercase tracking-[0.1em] text-[#948D84]">{label}</div><div className="mt-2 text-[24px] font-medium">{value}</div><div className="mt-1 text-[8px] text-[#9B948C]">{detail}</div></div>)}</section>

    <section className="mt-5 rounded-2xl border border-black/[0.07] bg-white p-2.5"><div className="flex flex-wrap gap-1">{[["open", "Open", state.counts.open || 0], ["overdue", "Overdue", state.counts.overdue || 0], ["resolved", "Resolved", state.counts.resolved || 0], ["all", "All", state.counts.total || 0]].map(([id, label, count]) => <button key={id} onClick={() => setTab(id)} className={`rounded-xl px-3.5 py-2 text-[9px] ${tab === id ? "bg-[#2E2A25] text-white" : "text-[#746D65]"}`}>{label}<span className="ml-1.5 opacity-60">{count}</span></button>)}</div></section>

    <section className="mt-4 overflow-hidden rounded-2xl border border-black/[0.07] bg-white"><div className="grid grid-cols-[minmax(0,1.5fr)_120px_160px_150px_190px] gap-3 border-b border-black/[0.06] bg-[#FBFAF8] px-5 py-3 text-[8px] uppercase tracking-[0.08em] text-[#948D84]"><span>Customer / issue</span><span>Severity</span><span>Stage</span><span>Target</span><span>Next action</span></div><div className="divide-y divide-black/[0.05]">{rows.map((row) => { const action = actionFor(row); return <div key={row.work_request_id} className={`grid grid-cols-[minmax(0,1.5fr)_120px_160px_150px_190px] gap-3 px-5 py-4 text-[9px] ${row.overdue ? "bg-[#B7654C]/[0.025]" : ""}`}><div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate text-[11px] font-medium">{row.customer_name || "Customer"}</span>{row.overdue ? <span className="rounded-full border border-[#B7654C]/20 bg-[#B7654C]/[0.06] px-2 py-0.5 text-[7px] uppercase text-[#914B38]">overdue</span> : null}</div><div className="mt-1 truncate text-[8px] text-[#817A72]">{row.customer_location_name || "Site not named"} · {row.service_name}</div><div className="mt-2 line-clamp-2 text-[9px] leading-4 text-[#5F5952]">{row.summary || "No issue summary recorded."}</div>{row.next_action ? <div className="mt-1 text-[8px] text-[#9A744B]">Next: {row.next_action.replaceAll("_", " ")}</div> : null}</div><div><span className={`inline-flex rounded-full border px-2 py-1 text-[7px] uppercase tracking-[0.07em] ${severityTone(row.severity)}`}>{row.severity}</span></div><div><span className={`inline-flex rounded-full border px-2 py-1 text-[7px] uppercase tracking-[0.07em] ${stageTone(row.stage)}`}>{stageLabel(row.stage)}</span>{row.corrective_assigned_to ? <div className="mt-2 flex items-center gap-1 text-[8px] text-[#817A72]"><UserRound size={8} /> Assigned</div> : null}</div><div><div className={`flex items-center gap-1 text-[8px] ${row.overdue ? "text-[#914B38]" : "text-[#817A72]"}`}><Clock3 size={9} />{formatDate(row.sla_due_at)}</div>{row.resolved_at ? <div className="mt-2 flex items-center gap-1 text-[8px] text-[#607057]"><CheckCircle2 size={9} />{formatDate(row.resolved_at)}</div> : null}</div><div className="flex items-center justify-end">{action?.href ? <Link href={action.href} className="inline-flex items-center gap-1.5 rounded-lg bg-[#2C2925] px-3 py-2 text-[8px] font-medium text-white"><Wrench size={9} />{action.label}</Link> : action?.disabled ? <span className="inline-flex items-center gap-1.5 text-[8px] text-[#607057]"><CheckCircle2 size={10} />Resolved</span> : action ? <button disabled={Boolean(busy)} onClick={action.action} className="rounded-lg bg-[#2C2925] px-3 py-2 text-[8px] font-medium text-white disabled:opacity-35">{busy.startsWith(row.work_request_id) ? "Working…" : action.label}</button> : <span className="inline-flex items-center gap-1 text-[8px] text-[#98513D]"><AlertTriangle size={9} />Review state</span>}</div></div>; })}{!state.loading && rows.length === 0 ? <div className="p-12 text-center"><CheckCircle2 className="mx-auto text-[#748267]" size={20} /><div className="mt-2 text-[11px] font-medium">No corrective work in this view</div><div className="mt-1 text-[9px] text-[#817A72]">When a technician records a site exception, it will enter this lifecycle automatically.</div></div> : null}</div></section>

    <div className="mt-4 flex items-start gap-2 rounded-xl border border-black/[0.06] bg-white p-4 text-[9px] leading-4 text-[#777169]"><ShieldAlert size={12} className="mt-0.5 shrink-0 text-[#9A744B]" /><span>Corrective targets are attention signals, not automatic closure. Critical defaults to 4 hours, high to 24 hours, medium to 72 hours and low to 7 days. Resolution is only recorded after the corrective occurrence completes through the same technician, treatment, monitoring and proof gates.</span></div>
  </div></main>;
}