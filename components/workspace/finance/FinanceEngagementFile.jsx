"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  FileCheck2,
  FileText,
  FolderOpen,
  History,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

import FinanceEngagementClientDependencyPanel from "@/components/workspace/finance/FinanceEngagementClientDependencyPanel";
import FinanceEngagementWorkProgram from "@/components/workspace/finance/FinanceEngagementWorkProgram";

const FILE_TABS = [
  { id: "work", label: "Work", icon: FileCheck2 },
  { id: "evidence", label: "Evidence", icon: FileText },
  { id: "review", label: "Review", icon: ShieldCheck },
  { id: "history", label: "History", icon: History },
];

function label(value) {
  return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
function date(value) { return value ? String(value).slice(0, 10) : "—"; }
function hours(minutes) { return `${Math.round((Number(minutes || 0) / 60) * 10) / 10}h`; }
function tone(status) {
  const value = String(status || "").toUpperCase();
  if (["COMPLETE", "ACCEPTED", "CLEARED", "LOCKED", "VERIFIED"].includes(value)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (["BLOCKED", "CHANGES_REQUESTED"].includes(value)) return "border-red-700/15 bg-red-50 text-red-800";
  if (["READY_FOR_REVIEW", "SUBMITTED", "REVIEWED", "NEEDS_REVERIFICATION", "NOT_VERIFIED"].includes(value)) return "border-amber-700/15 bg-amber-50 text-amber-800";
  return "border-black/[0.08] bg-[#F7F6F3] text-[#716B63]";
}

function Metric({ title, value, detail, warning = false }) {
  return <div className="rounded-xl border border-black/[0.07] bg-white px-3.5 py-3"><div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#8C877F]">{title}</div><div className={`mt-2 text-[22px] font-semibold tracking-[-0.035em] ${warning ? "text-[#9A533D]" : "text-[#2A2723]"}`}>{value}</div><div className="mt-0.5 text-[9px] text-[#99938A]">{detail}</div></div>;
}
function Signal({ title, value, detail, warning = false }) {
  return <div className="min-w-0 rounded-xl border border-black/[0.06] bg-white/90 px-3 py-2.5"><div className="flex items-baseline justify-between gap-2"><span className="truncate text-[8px] font-medium uppercase tracking-[0.11em] text-[#918B83]">{title}</span><span className={`shrink-0 text-[13px] font-semibold tabular-nums ${warning ? "text-[#9A533D]" : "text-[#37342F]"}`}>{value}</span></div><div className="mt-0.5 truncate text-[8px] text-[#A09A92]">{detail}</div></div>;
}
function StaffCard({ title, person }) {
  const capacity = person?.capacity;
  return <div className="rounded-xl border border-black/[0.07] bg-white p-3"><div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#8C877F]">{title}</div><div className="mt-2 text-[12px] font-semibold text-[#37342F]">{person?.name || "Unassigned"}</div><div className="mt-1 text-[9px] text-[#908B83]">{capacity ? `${hours(capacity.weekly_capacity_minutes)} weekly · ${Math.round(Number(capacity.utilization_target || 0) * 100)}% target` : "No capacity profile"}</div></div>;
}

function ReviewTruthPanel({ portfolio, run }) {
  if (!run) return <section className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.14em] text-[#8A633C]"><ShieldCheck size={11} /> Engagement review truth</div><div className="mt-3 text-[10px] text-[#918B83]">Create an accounting cycle before engagement-wide review clearance can be evaluated.</div></section>;
  const total = Number(portfolio?.review_item_count || 0);
  const reviewed = Number(portfolio?.reviewed_record_count || 0);
  const cleared = Number(portfolio?.cleared_record_count || 0);
  const openPoints = Number(portfolio?.unresolved_note_count || 0);
  const signoffs = portfolio?.signoff_counts || {};
  const fullyCleared = portfolio?.fully_cleared === true;
  const blockers = Array.isArray(portfolio?.blockers) ? portfolio.blockers : [];
  return <section className={`rounded-2xl border p-4 ${fullyCleared ? "border-emerald-700/15 bg-emerald-50/55" : "border-amber-700/15 bg-[#FFF9EF]"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.14em] text-[#8A633C]"><ShieldCheck size={11} /> Engagement review truth</div><div className="mt-1.5 text-[15px] font-semibold text-[#312D28]">{fullyCleared ? "Review fully cleared" : portfolio?.current_stage_label || "Review clearance pending"}</div><div className="mt-1 text-[9px] text-[#817A71]">Organization, legal entity and accounting period remain inside the same governed review scope.</div></div><span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[8px] font-semibold uppercase ${fullyCleared ? "border-emerald-700/15 bg-white text-emerald-800" : "border-amber-700/15 bg-white text-amber-800"}`}>{fullyCleared ? <CheckCircle2 size={11} /> : <CircleDot size={11} />}{fullyCleared ? "Cleared" : label(portfolio?.current_stage || "Pending")}</span></div>
    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7"><Metric title="Review records" value={total} detail="In scoped engagement" /><Metric title="Reviewed" value={`${reviewed}/${total}`} detail="Reviewer-level status" warning={total > 0 && reviewed < total} /><Metric title="Cleared" value={`${cleared}/${total}`} detail="Partner-level status" warning={total > 0 && cleared < total} /><Metric title="Open points" value={openPoints} detail="Must clear before final" warning={openPoints > 0} /><Metric title="Preparer" value={`${Number(signoffs.PREPARER || 0)}/${total}`} detail="Active sign-offs" /><Metric title="Reviewer" value={`${Number(signoffs.REVIEWER || 0)}/${total}`} detail="Active sign-offs" /><Metric title="Partner" value={`${Number(signoffs.PARTNER || 0)}/${total}`} detail="Active sign-offs" /></div>
    {blockers.length ? <div className="mt-3 rounded-xl border border-red-700/10 bg-white p-3"><div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#965640]"><AlertTriangle size={11} /> What blocks clearance now</div><div className="mt-2 grid gap-1.5 md:grid-cols-2">{blockers.slice(0, 8).map((blocker, index) => <div key={`${blocker.code || "blocker"}-${index}`} className="rounded-lg bg-red-50/70 px-2.5 py-2 text-[9px] text-red-800"><div className="font-medium">{blocker.record_label || blocker.message}</div>{blocker.record_label ? <div className="mt-0.5 text-[8px] text-red-700/80">{blocker.message}</div> : null}</div>)}</div></div> : null}
  </section>;
}

export default function FinanceEngagementFile({ organizationId, engagementId, onClose }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [activeTab, setActiveTab] = useState("work");

  async function load() {
    if (!organizationId || !engagementId) return null;
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/workspace/finance/engagement-file", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("engagementId", engagementId);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load engagement file");
      setState({ loading: false, error: "", data: body });
      return body;
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || "Unable to load engagement file" }));
      return null;
    }
  }

  useEffect(() => { setActiveTab("work"); load(); }, [organizationId, engagementId]);

  const data = state.data;
  const engagement = data?.engagement;
  const currentRun = data?.current_run;
  const history = Array.isArray(data?.history) ? data.history : [];
  const documents = Array.isArray(data?.documents) ? data.documents : [];
  const availableDocuments = Array.isArray(data?.available_documents) ? data.available_documents : [];
  const externalReviews = Array.isArray(data?.external_reviews) ? data.external_reviews : [];
  const summary = data?.summary || {};
  const reviewPortfolio = data?.review_portfolio || null;
  const currentWorkItems = Array.isArray(currentRun?.work_items) ? currentRun.work_items : [];
  const openWork = currentWorkItems.filter((item) => !["COMPLETE", "SKIPPED"].includes(String(item.status || "").toUpperCase())).length;
  const clientWait = currentWorkItems.filter((item) => String(item.status || "").toUpperCase() === "WAITING_ON_CLIENT").length;
  const entityName = engagement?.entity?.display_name || engagement?.entity?.legal_name || engagement?.entity?.code || "Entity not configured";
  const periodName = currentRun?.period?.period_name || currentRun?.run_key || "No current cycle";

  return <div className="mt-2 overflow-hidden rounded-[24px] border border-[#A37849]/20 bg-[#F8F5EF] shadow-[0_12px_36px_rgba(52,42,28,0.06)]">
    <div className="border-b border-black/[0.06] bg-white/90 px-4 py-4 md:px-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0"><div className="flex items-center gap-2 text-[8px] font-medium uppercase tracking-[0.16em] text-[#8A633C]"><FolderOpen size={11} /> Client accounting file</div><h3 className="mt-1.5 truncate text-[20px] font-semibold tracking-[-0.025em] text-[#2F2B27]">{engagement?.client?.name || "Client accounting file"}</h3><div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[9px] text-[#817B73]"><span>{entityName}</span><span>·</span><span>{periodName}</span>{currentRun?.template?.name ? <><span>·</span><span>{currentRun.template.name}</span></> : null}{currentRun?.status ? <span className={`rounded-full border px-2 py-0.5 text-[7px] font-semibold uppercase ${tone(currentRun.status)}`}>{label(currentRun.status)}</span> : null}</div></div><div className="flex shrink-0 items-center gap-2"><button type="button" onClick={load} disabled={state.loading} className="inline-flex h-9 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 text-[9px] font-semibold text-[#716B63] disabled:opacity-50"><RefreshCw size={11} className={state.loading ? "animate-spin" : ""} /> Refresh</button>{onClose ? <button type="button" onClick={onClose} aria-label="Close client file" className="h-9 w-9 rounded-xl border border-black/[0.08] bg-white text-[#716B63]"><X size={13} className="mx-auto" /></button> : null}</div></div>
      {data ? <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6"><Signal title="Progress" value={`${summary.current_progress || 0}%`} detail={`${openWork} open procedures`} /><Signal title="Due" value={date(currentRun?.due_at)} detail={clientWait ? `${clientWait} waiting on client` : "Current cycle"} warning={Boolean(currentRun?.due_at && date(currentRun.due_at) < new Date().toISOString().slice(0, 10))} /><Signal title="Review points" value={reviewPortfolio?.unresolved_note_count ?? summary.open_review_points ?? 0} detail={summary.review_fully_cleared ? "Review cleared" : label(summary.review_stage || "Review pending")} warning={Number(reviewPortfolio?.unresolved_note_count ?? 0) > 0} /><Signal title="Evidence" value={summary.missing_evidence_categories || 0} detail="Missing categories" warning={Number(summary.missing_evidence_categories || 0) > 0} /><Signal title="Verification" value={summary.verification_attention_items || 0} detail="Need system check" warning={Number(summary.verification_attention_items || 0) > 0} /><Signal title="Blockers" value={summary.system_blockers || 0} detail="Accounting truth gates" warning={Number(summary.system_blockers || 0) > 0} /></div> : null}
    </div>

    {state.loading && !data ? <div className="flex min-h-[220px] items-center justify-center text-[11px] text-[#817D76]"><LoaderCircle size={16} className="mr-2 animate-spin text-[#A37849]" /> Loading client accounting file…</div> : null}
    {state.error ? <div className="m-4 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[10px] text-red-800">{state.error}</div> : null}

    {data ? <><div className="flex gap-1 overflow-x-auto border-b border-black/[0.06] bg-white/70 px-4 pt-1 md:px-5">{FILE_TABS.map((tab) => { const Icon = tab.icon; const active = activeTab === tab.id; const badge = tab.id === "evidence" ? summary.missing_evidence_categories : tab.id === "review" ? reviewPortfolio?.unresolved_note_count : tab.id === "history" ? history.length : null; return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-[10px] font-semibold transition ${active ? "border-[#A37849] text-[#5F452D]" : "border-transparent text-[#817D76] hover:text-[#514D47]"}`}><Icon size={11} /> {tab.label}{Number(badge || 0) > 0 ? <span className={`rounded-full px-1.5 py-0.5 text-[7px] ${tab.id === "history" ? "bg-[#F1EEE9] text-[#716B63]" : "bg-amber-50 text-amber-800"}`}>{badge}</span> : null}</button>; })}</div>
      <div className="p-4 md:p-5">
        {engagement?.entity_required ? <div className="mb-4 rounded-xl border border-amber-700/15 bg-amber-50 p-3 text-[10px] text-amber-900"><b>Legal entity required</b><div className="mt-0.5">This engagement cannot start entity-scoped accounting work until a real legal entity is configured for the client.</div></div> : null}

        {activeTab === "work" ? <div className="space-y-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><div className="text-[10px] font-semibold text-[#403C37]">Current accounting cycle</div><div className="mt-0.5 text-[9px] text-[#918B83]">Start the procedure, work the evidence, record the conclusion and hand it forward without leaving the client file.</div></div><div className="flex flex-wrap items-center gap-2 text-[8px] text-[#817B73]"><span className="inline-flex items-center gap-1 rounded-full border border-black/[0.07] bg-white px-2.5 py-1"><Users size={9} /> {data.staff?.preparer?.name || "Preparer unassigned"}</span><span className="inline-flex items-center gap-1 rounded-full border border-black/[0.07] bg-white px-2.5 py-1"><ShieldCheck size={9} /> {data.staff?.reviewer?.name || "Reviewer unassigned"}</span></div></div><FinanceEngagementClientDependencyPanel run={currentRun} />{currentRun ? <FinanceEngagementWorkProgram organizationId={organizationId} run={currentRun} documents={availableDocuments} onReload={load} /> : <div className="rounded-2xl border border-black/[0.07] bg-white p-6 text-center"><FileCheck2 size={18} className="mx-auto text-[#A37849]" /><div className="mt-2 text-[11px] font-semibold text-[#403C37]">No accounting cycle yet</div><div className="mt-1 text-[9px] text-[#918B83]">Create the client’s accounting cycle from the practice workspace to begin governed work.</div></div>}</div> : null}

        {activeTab === "evidence" ? <div className="space-y-4"><div className="grid grid-cols-2 gap-2 md:grid-cols-4"><Metric title="Finance documents" value={documents.length} detail="Canonical client documents" /><Metric title="Missing evidence" value={summary.missing_evidence_categories || 0} detail="Required categories" warning={Number(summary.missing_evidence_categories || 0) > 0} /><Metric title="Verify attention" value={summary.verification_attention_items || 0} detail="Deterministic checks" warning={Number(summary.verification_attention_items || 0) > 0} /><Metric title="Client overdue" value={summary.overdue_client_requests || 0} detail="Evidence requests" warning={Number(summary.overdue_client_requests || 0) > 0} /></div><div className="rounded-2xl border border-black/[0.07] bg-white"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/[0.06] px-4 py-3"><div><div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.12em] text-[#8A633C]"><FileText size={11} /> Evidence documents</div><div className="mt-1 text-[8px] text-[#918B83]">Canonical documents stay attached to the client. Link them to the exact procedure from Work so evidence remains traceable.</div></div><button type="button" onClick={() => setActiveTab("work")} className="text-[8px] font-semibold text-[#8A633C]">Open workpapers →</button></div><div className="divide-y divide-black/[0.05]">{documents.slice(0, 100).map((document) => <div key={document.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[9px]"><div className="min-w-0"><div className="truncate font-medium text-[#403C37]">{document.file_name || "Finance document"}</div><div className="mt-0.5 text-[8px] text-[#99938A]">{label(document.ai_type || document.destination_module || "finance")} · {date(document.created_at)}</div></div><div className="flex shrink-0 items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase ${tone(document.status)}`}>{label(document.status || "active")}</span>{document.file_url ? <a href={document.file_url} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-lg border border-black/[0.07] px-2 text-[8px] text-[#716B63]"><ExternalLink size={9} /> Open</a> : null}</div></div>)}{!documents.length ? <div className="px-4 py-8 text-center text-[9px] text-[#918B83]">No finance documents are available for this client yet.</div> : null}</div></div></div> : null}

        {activeTab === "review" ? <div className="space-y-4"><ReviewTruthPanel portfolio={reviewPortfolio} run={currentRun} /><div className="grid gap-3 md:grid-cols-3"><StaffCard title="Preparer" person={data.staff?.preparer} /><StaffCard title="Reviewer" person={data.staff?.reviewer} /><StaffCard title="Partner" person={data.staff?.partner} /></div><section className="rounded-2xl border border-black/[0.07] bg-white"><div className="border-b border-black/[0.06] px-4 py-3"><div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.12em] text-[#8A633C]"><MessageSquareText size={11} /> Other review records</div><div className="mt-1 text-[8px] text-[#918B83]">Review records outside the current work-program items remain visible without mixing them into daily procedure work.</div></div><div className="divide-y divide-black/[0.05]">{externalReviews.slice(0, 100).map((review) => { const openNotes = (review.notes || []).filter((note) => note.status !== "RESOLVED").length; return <div key={review.id} className="grid gap-2 px-4 py-3 text-[9px] md:grid-cols-[minmax(220px,1fr)_110px_100px_110px] md:items-center"><div className="min-w-0"><div className="truncate font-medium text-[#403C37]">{review.record_label || review.record_key}</div><div className="mt-0.5 truncate text-[8px] text-[#99938A]">{label(review.capability_id || review.record_type)}{openNotes ? ` · ${openNotes} open point${openNotes === 1 ? "" : "s"}` : ""}</div></div><div><span className={`inline-flex rounded-full border px-2 py-1 text-[7px] font-semibold uppercase ${tone(review.status)}`}>{label(review.status)}</span></div><div className="text-[#716B63]">{label(review.priority || "normal")}</div><div className="flex items-center gap-1.5 text-[#716B63]"><CalendarClock size={10} /> {date(review.due_at)}</div></div>; })}{!externalReviews.length ? <div className="px-4 py-8 text-center text-[9px] text-[#918B83]">No additional review records outside the current work program.</div> : null}</div></section></div> : null}

        {activeTab === "history" ? <div className="space-y-3"><div><div className="text-[10px] font-semibold text-[#403C37]">Prior accounting cycles</div><div className="mt-0.5 text-[9px] text-[#918B83]">Completed and prior cycles stay reconstructable from their locked work, evidence and system-clearance snapshots.</div></div>{history.length ? history.map((run) => <FinanceEngagementWorkProgram key={run.id} organizationId={organizationId} run={run} documents={availableDocuments} onReload={load} />) : <div className="rounded-2xl border border-black/[0.07] bg-white p-8 text-center"><History size={18} className="mx-auto text-[#A9A39B]" /><div className="mt-2 text-[10px] font-semibold text-[#403C37]">No prior cycles yet</div><div className="mt-1 text-[9px] text-[#918B83]">Historical accounting cycles will appear here after the client progresses through recurring periods.</div></div>}</div> : null}
      </div>
    </> : null}
  </div>;
}
