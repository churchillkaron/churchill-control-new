"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  ExternalLink,
  FileCheck2,
  FileText,
  FolderOpen,
  History,
  Link2,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  Unlink,
  UserRoundCheck,
  X,
} from "lucide-react";

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
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.14em] text-[#8A633C]"><ShieldCheck size={11} /> Engagement review truth</div><div className="mt-1.5 text-[15px] font-semibold text-[#312D28]">{fullyCleared ? "Review fully cleared" : portfolio?.current_stage_label || "Review clearance pending"}</div><div className="mt-1 text-[9px] text-[#817A71]">Same organization · legal entity · accounting period gate used by lifecycle completion.</div></div><span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[8px] font-semibold uppercase ${fullyCleared ? "border-emerald-700/15 bg-white text-emerald-800" : "border-amber-700/15 bg-white text-amber-800"}`}>{fullyCleared ? <CheckCircle2 size={11} /> : <CircleDot size={11} />}{fullyCleared ? "Cleared" : label(portfolio?.current_stage || "Pending")}</span></div>
    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7"><Metric title="Review records" value={total} detail="In scoped engagement" /><Metric title="Reviewed" value={`${reviewed}/${total}`} detail="Reviewer-level status" warning={total > 0 && reviewed < total} /><Metric title="Cleared" value={`${cleared}/${total}`} detail="Partner-level status" warning={total > 0 && cleared < total} /><Metric title="Open points" value={openPoints} detail="Must clear before final" warning={openPoints > 0} /><Metric title="Preparer" value={`${Number(signoffs.PREPARER || 0)}/${total}`} detail="Active sign-offs" /><Metric title="Reviewer" value={`${Number(signoffs.REVIEWER || 0)}/${total}`} detail="Active sign-offs" /><Metric title="Partner" value={`${Number(signoffs.PARTNER || 0)}/${total}`} detail="Active sign-offs" /></div>
    {blockers.length ? <div className="mt-3 rounded-xl border border-red-700/10 bg-white p-3"><div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#965640]"><AlertTriangle size={11} /> What blocks clearance now</div><div className="mt-2 grid gap-1.5 md:grid-cols-2">{blockers.slice(0, 8).map((blocker, index) => <div key={`${blocker.code || "blocker"}-${index}`} className="rounded-lg bg-red-50/70 px-2.5 py-2 text-[9px] text-red-800"><div className="font-medium">{blocker.record_label || blocker.message}</div>{blocker.record_label ? <div className="mt-0.5 text-[8px] text-red-700/80">{blocker.message}</div> : null}</div>)}</div></div> : null}
  </section>;
}

function VerificationBadge({ item }) {
  const reviewGate = item.metadata?.engagement_review_gate;
  if (reviewGate?.applicable === true) return reviewGate.satisfied === true ? <span className="inline-flex items-center gap-1 text-emerald-700"><ShieldCheck size={11} /> Review</span> : <span className="inline-flex items-center gap-1 text-red-700"><AlertTriangle size={11} /> Review</span>;
  if (item.verification_state === "VERIFIED") return <span className="inline-flex items-center gap-1 text-emerald-700"><BadgeCheck size={11} /> Verified</span>;
  if (item.verification_state === "BLOCKED") return <span className="inline-flex items-center gap-1 text-red-700"><AlertTriangle size={11} /> Blocked</span>;
  if (item.verification_state === "NEEDS_REVERIFICATION") return <span className="inline-flex items-center gap-1 text-amber-700"><RefreshCw size={11} /> Reverify</span>;
  if (item.verification_state === "NOT_VERIFIED") return <span className="inline-flex items-center gap-1 text-amber-700"><SearchCheck size={11} /> Verify</span>;
  return <span className="text-[#99938A]">Evidence</span>;
}

function WorkpaperDetail({ item, documents, busy, error, onVerify, onLink, onUnlink }) {
  const requirements = Array.isArray(item.evidence_requirements) ? item.evidence_requirements : [];
  const links = (Array.isArray(item.evidence_links) ? item.evidence_links : []).filter((link) => link.status === "ACTIVE");
  const [category, setCategory] = useState(requirements[0]?.key || "");
  const [documentId, setDocumentId] = useState("");
  useEffect(() => { if (!requirements.some((row) => row.key === category)) setCategory(requirements[0]?.key || ""); }, [item.id, requirements.length]);
  const activePairs = new Set(links.map((link) => `${link.evidence_category}:${link.document_id}`));
  const available = documents.filter((document) => !activePairs.has(`${category}:${document.id}`));
  const mode = item.system_verification?.mode;
  const reports = Array.isArray(item.verification_summary?.reports) ? item.verification_summary.reports : [];

  return <div className="border-b border-black/[0.06] bg-[#FBFAF8] px-4 py-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]"><FileCheck2 size={11} /> Workpaper evidence</div><div className="mt-1 text-[9px] text-[#817A71]">Verification: <span className="font-semibold">{label(item.verification_state)}</span>{item.last_verified_at ? ` · checked ${date(item.last_verified_at)}` : " · not checked yet"}</div></div>{item.can_verify ? <button type="button" disabled={busy} onClick={() => onVerify(item)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#8A633C]/20 bg-white px-2.5 text-[9px] font-semibold text-[#6E4D2D]"><SearchCheck size={11} /> {busy ? "Verifying…" : "Verify now"}</button> : null}</div>
    {error ? <div className="mt-3 rounded-lg border border-red-700/10 bg-red-50 px-3 py-2 text-[9px] text-red-800">{error}</div> : null}
    {(item.metadata?.system_gate?.blockers || []).length ? <div className="mt-3 grid gap-1.5 md:grid-cols-2">{item.metadata.system_gate.blockers.map((blocker, index) => <div key={index} className="rounded-lg border border-red-700/10 bg-white px-2.5 py-2 text-[8px] text-red-800">{blocker}</div>)}</div> : null}

    {mode === "DOCUMENT_CATEGORIES" ? <div className="mt-4"><div className="text-[9px] font-semibold text-[#4A4540]">Evidence coverage</div><div className="mt-2 grid gap-2 md:grid-cols-3">{requirements.map((requirement) => <div key={requirement.key} className={`rounded-xl border p-3 ${requirement.satisfied ? "border-emerald-700/10 bg-emerald-50/35" : "border-amber-700/10 bg-white"}`}><div className="flex items-center justify-between"><span className="text-[9px] font-semibold">{requirement.label}</span>{requirement.satisfied ? <BadgeCheck size={12} className="text-emerald-700" /> : <CircleDot size={12} className="text-amber-700" />}</div><div className="mt-1 text-[8px] text-[#918B83]">{requirement.linked_count}/{requirement.min_count} linked{requirement.missing_count ? ` · ${requirement.missing_count} missing` : ""}</div></div>)}</div>
      <div className="mt-3 rounded-xl border border-black/[0.06] bg-white p-3"><div className="text-[9px] font-semibold">Linked canonical documents</div><div className="mt-2 divide-y divide-black/[0.05]">{links.map((link) => <div key={link.id} className="flex items-center justify-between gap-3 py-2 text-[9px]"><div className="min-w-0"><div className="truncate font-medium">{link.document?.file_name || link.document_id}</div><div className="text-[8px] text-[#99938A]">{label(link.evidence_category)} · {date(link.linked_at)}</div></div><div className="flex gap-1.5">{link.document?.file_url ? <a href={link.document.file_url} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-lg border border-black/[0.07] px-2 text-[8px]"><ExternalLink size={10} /> Open</a> : null}{item.can_manage_evidence ? <button type="button" disabled={busy} onClick={() => onUnlink(link)} className="inline-flex h-7 items-center gap-1 rounded-lg border border-red-700/10 px-2 text-[8px] text-red-700"><Unlink size={10} /> Unlink</button> : null}</div></div>)}{!links.length ? <div className="py-3 text-[9px] text-[#918B83]">No classified documents are linked to this procedure.</div> : null}</div></div>
      {item.can_manage_evidence ? <div className="mt-3 rounded-xl border border-[#A37849]/15 bg-[#FFFDF9] p-3"><div className="flex items-center gap-1.5 text-[9px] font-semibold"><Link2 size={11} /> Link existing document</div><div className="mt-2 grid gap-2 md:grid-cols-[180px_minmax(220px,1fr)_auto]"><select value={category} onChange={(event) => { setCategory(event.target.value); setDocumentId(""); }} className="h-9 rounded-lg border border-black/[0.08] bg-white px-2 text-[9px]">{requirements.map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}</select><select value={documentId} onChange={(event) => setDocumentId(event.target.value)} className="h-9 rounded-lg border border-black/[0.08] bg-white px-2 text-[9px]"><option value="">Select client document…</option>{available.map((document) => <option key={document.id} value={document.id}>{document.file_name || document.id}</option>)}</select><button type="button" disabled={busy || !category || !documentId} onClick={() => onLink(item, category, documentId)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#3F352A] px-3 text-[9px] font-semibold text-white disabled:opacity-40"><Link2 size={11} /> Link evidence</button></div><div className="mt-2 text-[8px] text-[#918B83]">Uses canonical client documents; no duplicate upload is created. Any evidence change invalidates prior system verification.</div></div> : <div className="mt-3 text-[8px] text-[#918B83]">{item.evidence_edit_block_reason}</div>}
    </div> : null}

    {mode === "FINANCIAL_REPORT_SET" ? <div className="mt-4"><div className="mb-2 text-[9px] font-semibold">Financial statement truth</div><div className="grid gap-2 md:grid-cols-3">{reports.length ? reports.map((report) => <div key={report.report_type} className="rounded-xl border border-black/[0.06] bg-white p-3"><div className="flex justify-between"><span className="text-[9px] font-semibold">{label(report.report_type)}</span>{report.generated ? <BadgeCheck size={12} className="text-emerald-700" /> : <AlertTriangle size={12} className="text-red-700" />}</div><div className="mt-1 text-[8px] text-[#918B83]">{report.report_type === "trial_balance" ? `${report.account_count || 0} accounts · difference ${Number(report.difference || 0).toFixed(2)} · ${report.balanced ? "balanced" : "not balanced"}` : report.has_document ? "Report document generated" : "Report document missing"}</div></div>) : <div className="text-[9px] text-[#918B83]">No report verification has been run yet.</div>}</div></div> : null}
    {mode === "DEPENDENCY_AUDIT_CHAIN" ? <div className="mt-4 rounded-xl border border-black/[0.06] bg-white p-3"><div className="text-[9px] font-semibold">Dependency audit chain</div><div className="mt-1 text-[8px] text-[#918B83]">{Number(item.verification_summary?.audited_dependencies || 0)}/{Number(item.verification_summary?.dependency_count || 0)} prerequisite procedures have completion audit evidence.</div></div> : null}
  </div>;
}

function WorkItemRow({ item, expanded, onToggle, documents, busy, error, onVerify, onLink, onUnlink }) {
  const unresolved = (item.review?.notes || []).filter((note) => note.status !== "RESOLVED").length;
  return <><button type="button" onClick={onToggle} className="grid w-full grid-cols-[28px_36px_minmax(250px,1.7fr)_110px_105px_85px_105px_120px] items-center gap-3 border-b border-black/[0.05] px-3 py-3 text-left text-[10px] hover:bg-[#FCFBF9]"><span>{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span><span className="text-[#99938A]">{item.sequence_no}</span><div className="min-w-0"><div className="truncate font-semibold">{item.title}</div><div className="truncate text-[9px] text-[#918B83]">{item.description || label(item.work_type)}</div>{item.blocked_reason ? <div className="truncate text-[9px] text-[#9A533D]">{item.blocked_reason}</div> : null}</div><span>{label(item.required_role)}</span><span><span className={`inline-flex rounded-full border px-2 py-1 text-[8px] font-semibold uppercase ${tone(item.status)}`}>{label(item.status)}</span></span><span>{hours(item.budget_minutes)}</span><span>{date(item.due_at)}</span><span className="flex items-center gap-1"><VerificationBadge item={item} />{unresolved ? <span className="rounded-full bg-red-50 px-1.5 text-[8px] text-red-700">{unresolved}</span> : null}</span></button>{expanded ? <WorkpaperDetail item={item} documents={documents} busy={busy} error={error} onVerify={onVerify} onLink={onLink} onUnlink={onUnlink} /> : null}</>;
}

function RunPanel({ run, open, onToggle, expandedItems, onToggleItem, documents, operation, onVerify, onLink, onUnlink }) {
  return <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white"><button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3.5 text-left"><div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{run.template?.name || run.run_key || "Accounting work program"}</span><span className={`rounded-full border px-2 py-1 text-[8px] font-semibold uppercase ${tone(run.status)}`}>{label(run.status)}</span>{run.locked_at ? <span className="rounded-full border px-2 py-1 text-[8px]">Locked snapshot</span> : null}</div><div className="mt-1 flex flex-wrap gap-4 text-[9px] text-[#918B83]"><span>{run.period?.period_name || run.run_key}</span><span>{run.progress?.percent || 0}% complete</span><span>{hours(run.progress?.budget_minutes)} budget</span><span>Due {date(run.due_at)}</span>{run.progress?.missing_evidence_categories ? <span className="text-amber-700">{run.progress.missing_evidence_categories} missing evidence</span> : null}{run.progress?.verification_attention_items ? <span className="text-amber-700">{run.progress.verification_attention_items} verify attention</span> : null}</div></div>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>{open ? <div className="border-t border-black/[0.06]">{run.completion_system_clearance ? <div className="bg-emerald-50/40 px-4 py-2 text-[8px] text-emerald-800">Historical system clearance snapshot retained at final lock.</div> : null}<div className="grid min-w-[980px] grid-cols-[28px_36px_minmax(250px,1.7fr)_110px_105px_85px_105px_120px] gap-3 bg-[#FAF9F7] px-3 py-2 text-[8px] uppercase text-[#8A867F]"><span></span><span>#</span><span>Procedure</span><span>Owner</span><span>Status</span><span>Budget</span><span>Due</span><span>Evidence</span></div>{(run.work_items || []).map((item) => <WorkItemRow key={item.id} item={item} expanded={expandedItems.has(item.id)} onToggle={() => onToggleItem(item.id)} documents={documents} busy={operation.key?.includes(item.id)} error={operation.itemId === item.id ? operation.error : ""} onVerify={onVerify} onLink={onLink} onUnlink={onUnlink} />)}{(run.client_requests || []).length ? <div className="border-t p-3"><div className="flex items-center gap-2 text-[9px] font-medium uppercase text-[#8A633C]"><UserRoundCheck size={11} /> Client evidence requests</div></div> : null}</div> : null}</div>;
}

export default function FinanceEngagementFile({ organizationId, engagementId, onClose }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [openRuns, setOpenRuns] = useState(new Set());
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [operation, setOperation] = useState({ key: "", itemId: "", error: "" });

  async function load({ preserveOpen = false } = {}) {
    if (!organizationId || !engagementId) return;
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/workspace/finance/engagement-file", window.location.origin);
      url.searchParams.set("organizationId", organizationId); url.searchParams.set("engagementId", engagementId);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load engagement file");
      setState({ loading: false, error: "", data: body });
      if (!preserveOpen && body.current_run?.id) setOpenRuns(new Set([body.current_run.id]));
    } catch (error) { setState({ loading: false, error: error?.message || "Unable to load engagement file", data: null }); }
  }
  useEffect(() => { load(); }, [organizationId, engagementId]);

  async function verifyItem(item) {
    setOperation({ key: `verify:${item.id}`, itemId: item.id, error: "" });
    try { const response = await fetch("/api/workspace/finance/work-programs/verify", { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, runId: item.run_id, workItemId: item.id }) }); const body = await response.json().catch(() => ({})); if (body?.gate) await load({ preserveOpen: true }); if (!response.ok || body?.success === false) throw new Error(body?.error || (body?.gate?.blockers || []).join("; ") || "Verification did not clear this workpaper"); setOperation({ key: "", itemId: item.id, error: "" }); } catch (error) { setOperation({ key: "", itemId: item.id, error: error?.message || "Unable to verify workpaper" }); }
  }
  async function linkEvidence(item, evidenceCategory, documentId) {
    setOperation({ key: `link:${item.id}`, itemId: item.id, error: "" });
    try { const response = await fetch("/api/workspace/finance/work-programs/evidence", { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, workItemId: item.id, documentId, evidenceCategory }) }); const body = await response.json().catch(() => ({})); if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to link evidence"); await load({ preserveOpen: true }); setOperation({ key: "", itemId: item.id, error: "" }); } catch (error) { setOperation({ key: "", itemId: item.id, error: error?.message || "Unable to link evidence" }); }
  }
  async function unlinkEvidence(link) {
    setOperation({ key: `unlink:${link.work_item_id}`, itemId: link.work_item_id, error: "" });
    try { const response = await fetch("/api/workspace/finance/work-programs/evidence", { method: "DELETE", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, evidenceLinkId: link.id }) }); const body = await response.json().catch(() => ({})); if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to unlink evidence"); await load({ preserveOpen: true }); setOperation({ key: "", itemId: link.work_item_id, error: "" }); } catch (error) { setOperation({ key: "", itemId: link.work_item_id, error: error?.message || "Unable to unlink evidence" }); }
  }

  const data = state.data;
  const engagement = data?.engagement;
  const currentRun = data?.current_run;
  const history = Array.isArray(data?.history) ? data.history : [];
  const documents = Array.isArray(data?.documents) ? data.documents : [];
  const availableDocuments = Array.isArray(data?.available_documents) ? data.available_documents : [];
  const externalReviews = Array.isArray(data?.external_reviews) ? data.external_reviews : [];
  const summary = data?.summary || {};
  const reviewPortfolio = data?.review_portfolio || null;
  const allRuns = useMemo(() => [currentRun, ...history].filter(Boolean), [currentRun, history]);
  const toggleRun = (id) => setOpenRuns((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleItem = (id) => setExpandedItems((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return <div className="mt-4 overflow-hidden rounded-[24px] border border-[#A37849]/25 bg-[#F5F1EA] shadow-[0_14px_40px_rgba(52,42,28,0.08)]">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b bg-white/80 p-5"><div><div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.16em] text-[#8A633C]"><FolderOpen size={12} /> Digital engagement file</div><h3 className="mt-1.5 text-[21px] font-semibold">{engagement?.client?.name || "Client accounting file"}</h3></div><div className="flex gap-2"><button type="button" onClick={() => load({ preserveOpen: true })} className="inline-flex h-9 items-center gap-2 rounded-xl border bg-white px-3 text-[9px]"><RefreshCw size={11} /> Refresh file</button><button type="button" onClick={onClose} className="h-9 w-9 rounded-xl border bg-white"><X size={13} className="mx-auto" /></button></div></div>
    {state.loading && !data ? <div className="flex min-h-[220px] items-center justify-center text-[11px]"><LoaderCircle size={16} className="mr-2 animate-spin" /> Loading engagement file…</div> : null}
    {state.error ? <div className="m-4 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[10px] text-red-800">{state.error}</div> : null}
    {data ? <div className="space-y-4 p-5">{engagement?.entity_required ? <div className="rounded-xl border border-amber-700/15 bg-amber-50 p-3 text-[10px] text-amber-900"><b>Legal entity required</b><div>This engagement cannot start entity-scoped accounting work until a real legal entity is configured for the client.</div></div> : null}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8"><Metric title="Progress" value={`${summary.current_progress || 0}%`} detail="Current work program" /><Metric title="Budget" value={hours(summary.current_budget_minutes)} detail="Current cycle" /><Metric title="Review points" value={reviewPortfolio?.unresolved_note_count ?? summary.open_review_points ?? 0} detail="Current scoped findings" warning={Number(reviewPortfolio?.unresolved_note_count ?? 0) > 0} /><Metric title="System blockers" value={summary.system_blockers || 0} detail="ERP truth gates" warning={summary.system_blockers > 0} /><Metric title="Missing evidence" value={summary.missing_evidence_categories || 0} detail="Required categories" warning={summary.missing_evidence_categories > 0} /><Metric title="Verify attention" value={summary.verification_attention_items || 0} detail="Needs deterministic check" warning={summary.verification_attention_items > 0} /><Metric title="Overdue work" value={summary.overdue_work || 0} detail="Procedures past due" warning={summary.overdue_work > 0} /><Metric title="Client overdue" value={summary.overdue_client_requests || 0} detail="Evidence requests" warning={summary.overdue_client_requests > 0} /></div>
      <div className="grid gap-3 md:grid-cols-3"><StaffCard title="Preparer" person={data.staff?.preparer} /><StaffCard title="Reviewer" person={data.staff?.reviewer} /><StaffCard title="Partner" person={data.staff?.partner} /></div>
      <ReviewTruthPanel portfolio={reviewPortfolio} run={currentRun} />
      <section><div className="mb-2 flex items-center gap-2 text-[9px] font-medium uppercase text-[#8A633C]"><FileCheck2 size={11} /> Work program & workpapers</div><div className="space-y-2">{allRuns.map((run) => <RunPanel key={run.id} run={run} open={openRuns.has(run.id)} onToggle={() => toggleRun(run.id)} expandedItems={expandedItems} onToggleItem={toggleItem} documents={availableDocuments} operation={operation} onVerify={verifyItem} onLink={linkEvidence} onUnlink={unlinkEvidence} />)}</div></section>
      <div className="grid gap-4 xl:grid-cols-2"><section className="rounded-2xl border bg-white p-4"><div className="flex items-center gap-2 text-[9px] font-medium uppercase text-[#8A633C]"><FileText size={11} /> Evidence documents</div>{documents.slice(0,20).map((document) => <a key={document.id} href={document.file_url || "#"} target={document.file_url ? "_blank" : undefined} rel="noreferrer" className="flex justify-between border-b py-2 text-[9px]"><span>{document.file_name}</span><span>{label(document.status)}</span></a>)}</section><section className="rounded-2xl border bg-white p-4"><div className="flex items-center gap-2 text-[9px] font-medium uppercase text-[#8A633C]"><MessageSquareText size={11} /> Review file</div>{externalReviews.slice(0,20).map((review) => <div key={review.id} className="border-b py-2 text-[9px]">{review.record_label || review.record_key}</div>)}</section></div>
      {history.length ? <section className="rounded-2xl border bg-white p-4"><div className="flex items-center gap-2 text-[9px] font-medium uppercase text-[#8A633C]"><History size={11} /> Prior periods</div></section> : null}
    </div> : null}
  </div>;
}
