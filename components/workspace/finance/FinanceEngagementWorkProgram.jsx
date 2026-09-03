"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  ExternalLink,
  FileCheck2,
  Link2,
  LoaderCircle,
  Play,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  Unlink,
  UserRoundCheck,
} from "lucide-react";

function label(value) {
  return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function date(value) {
  return value ? String(value).slice(0, 10) : "—";
}

function hours(minutes) {
  return `${Math.round((Number(minutes || 0) / 60) * 10) / 10}h`;
}

function tone(status) {
  const value = String(status || "").toUpperCase();
  if (["COMPLETE", "ACCEPTED", "CLEARED", "LOCKED", "VERIFIED"].includes(value)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (["BLOCKED", "CHANGES_REQUESTED"].includes(value)) return "border-red-700/15 bg-red-50 text-red-800";
  if (["READY_FOR_REVIEW", "SUBMITTED", "REVIEWED", "NEEDS_REVERIFICATION", "NOT_VERIFIED"].includes(value)) return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (["IN_PROGRESS", "READY"].includes(value)) return "border-[#A37849]/15 bg-[#FFF9F2] text-[#76583A]";
  return "border-black/[0.08] bg-[#F7F6F3] text-[#716B63]";
}

function isTerminal(status) {
  return ["COMPLETE", "SKIPPED"].includes(String(status || "").toUpperCase());
}

function apiDetail(details) {
  if (!details) return "";
  if (Array.isArray(details)) {
    return details.map((row) => row?.title || row?.message || row?.blocker || row?.step_key || row?.status).filter(Boolean).join("; ");
  }
  if (Array.isArray(details.blockers)) return details.blockers.join("; ");
  if (Array.isArray(details.system_blockers)) {
    return details.system_blockers.flatMap((row) => row.blockers || []).filter(Boolean).join("; ");
  }
  return "";
}

function VerificationBadge({ item }) {
  const reviewGate = item.metadata?.engagement_review_gate;
  if (reviewGate?.applicable === true) return reviewGate.satisfied === true ? <span className="inline-flex items-center gap-1 text-emerald-700"><ShieldCheck size={10} /> Review clear</span> : <span className="inline-flex items-center gap-1 text-red-700"><AlertTriangle size={10} /> Review blocked</span>;
  if (item.verification_state === "VERIFIED") return <span className="inline-flex items-center gap-1 text-emerald-700"><BadgeCheck size={10} /> Verified</span>;
  if (item.verification_state === "BLOCKED") return <span className="inline-flex items-center gap-1 text-red-700"><AlertTriangle size={10} /> Blocked</span>;
  if (item.verification_state === "NEEDS_REVERIFICATION") return <span className="inline-flex items-center gap-1 text-amber-700"><RefreshCw size={10} /> Reverify</span>;
  if (item.verification_state === "NOT_VERIFIED") return <span className="inline-flex items-center gap-1 text-amber-700"><SearchCheck size={10} /> Verify</span>;
  return <span className="text-[#99938A]">Evidence</span>;
}

function nextAction(item, locked) {
  const status = String(item.status || "").toUpperCase();
  if (locked || isTerminal(status)) return { kind: "done", label: locked ? "Locked" : "Done" };
  if (status === "BLOCKED") return { kind: "expand", label: "Resolve blocker" };
  if (status === "WAITING_ON_CLIENT") return { kind: "expand", label: "Client wait" };
  if (status === "READY_FOR_REVIEW") return { kind: "expand", label: "Review handoff" };
  if (status === "CHANGES_REQUESTED") return { kind: "lifecycle", action: "start_item", label: "Resume work" };
  if (["READY", "NOT_STARTED"].includes(status)) return { kind: "lifecycle", action: "start_item", label: "Start work" };
  if (status === "IN_PROGRESS") {
    if (item.work_type === "CLIENT_REQUEST") return { kind: "expand", label: "Client request" };
    const needsWorkpaper = item.metadata?.evidence_required === true || item.can_verify || item.system_verification?.mode || (item.evidence_requirements || []).length > 0 || item.review;
    if (needsWorkpaper) return { kind: "expand", label: "Open workpaper" };
    return {
      kind: "lifecycle",
      action: "complete_item",
      label: String(item.required_role || "").toUpperCase() === "PREPARER" ? "Send to review" : "Complete",
      readyForReview: String(item.required_role || "").toUpperCase() === "PREPARER",
    };
  }
  return { kind: "expand", label: "Open" };
}

function ReviewHandoff({ item, busy, onLifecycle }) {
  const [reason, setReason] = useState("");
  const unresolved = (item.review?.notes || []).filter((note) => note.status !== "RESOLVED");
  const status = String(item.status || "").toUpperCase();

  if (!item.review && status !== "READY_FOR_REVIEW") return null;

  return (
    <div className="mt-4 rounded-xl border border-black/[0.06] bg-white p-3">
      <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#8A633C]"><ShieldCheck size={11} /> Review handoff</div>
      {unresolved.length ? (
        <div className="mt-2 grid gap-1.5 md:grid-cols-2">
          {unresolved.slice(0, 8).map((note) => <div key={note.id} className="rounded-lg border border-red-700/10 bg-red-50/60 px-2.5 py-2 text-[8px] text-red-800">{note.body || label(note.note_type)}</div>)}
        </div>
      ) : <div className="mt-2 text-[8px] text-[#918B83]">No unresolved review points are attached to this procedure.</div>}

      {status === "READY_FOR_REVIEW" ? (
        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,1fr)_auto]">
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason if changes are required…" className="h-9 rounded-lg border border-black/[0.08] bg-white px-3 text-[9px] outline-none focus:border-[#A37849]/40" />
          <button type="button" disabled={busy || !reason.trim()} onClick={() => onLifecycle(item, "request_changes", { reason: reason.trim() })} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-red-700/15 bg-red-50 px-3 text-[8px] font-semibold text-red-800 disabled:opacity-40"><AlertTriangle size={10} /> Request changes</button>
        </div>
      ) : null}
    </div>
  );
}

function ClientRequestPanel({ request }) {
  if (!request) return null;
  return (
    <div className="mt-4 rounded-xl border border-[#A37849]/12 bg-[#FFFDF9] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#8A633C]"><UserRoundCheck size={11} /> Client request</div><div className="mt-1 text-[10px] font-semibold text-[#403C37]">{request.title || "Client evidence request"}</div></div>
        <span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase ${tone(request.status)}`}>{label(request.status)}</span>
      </div>
      {request.instructions ? <div className="mt-2 text-[9px] leading-4 text-[#716B63]">{request.instructions}</div> : null}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[8px] text-[#99938A]"><span>Due {date(request.due_at)}</span>{request.sent_at ? <span>Sent {date(request.sent_at)}</span> : null}{request.submitted_at ? <span>Submitted {date(request.submitted_at)}</span> : null}{request.accepted_at ? <span>Accepted {date(request.accepted_at)}</span> : null}</div>
      <div className="mt-2 text-[8px] text-[#918B83]">Client communication is governed separately; this panel shows the accounting request state and evidence handoff.</div>
    </div>
  );
}

function WorkpaperDetail({ item, clientRequest, documents, busy, error, onVerify, onLink, onUnlink, onLifecycle }) {
  const requirements = Array.isArray(item.evidence_requirements) ? item.evidence_requirements : [];
  const links = (Array.isArray(item.evidence_links) ? item.evidence_links : []).filter((link) => link.status === "ACTIVE");
  const [category, setCategory] = useState(requirements[0]?.key || "");
  const [documentId, setDocumentId] = useState("");
  const [conclusion, setConclusion] = useState(item.conclusion || "");
  const [evidenceNote, setEvidenceNote] = useState(typeof item.evidence === "string" ? item.evidence : "");

  useEffect(() => {
    if (!requirements.some((row) => row.key === category)) setCategory(requirements[0]?.key || "");
    setConclusion(item.conclusion || "");
    if (typeof item.evidence === "string") setEvidenceNote(item.evidence);
  }, [item.id, item.conclusion, requirements.length]);

  const activePairs = new Set(links.map((link) => `${link.evidence_category}:${link.document_id}`));
  const available = documents.filter((document) => !activePairs.has(`${category}:${document.id}`));
  const mode = item.system_verification?.mode;
  const reports = Array.isArray(item.verification_summary?.reports) ? item.verification_summary.reports : [];
  const status = String(item.status || "").toUpperCase();
  const evidenceRequired = item.metadata?.evidence_required === true;
  const humanEvidenceRequired = evidenceRequired && !item.can_verify && !mode;
  const readyForCompletion = status === "IN_PROGRESS";
  const preparerHandoff = String(item.required_role || "").toUpperCase() === "PREPARER";

  return (
    <div className="border-b border-black/[0.06] bg-[#FBFAF8] px-4 py-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.55fr)]">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]"><FileCheck2 size={11} /> Workpaper</div><div className="mt-1 text-[9px] text-[#817A71]">{item.instructions || item.description || "Complete the procedure and retain the evidence needed for review."}</div></div>
            {item.can_verify ? <button type="button" disabled={busy} onClick={() => onVerify(item)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#8A633C]/20 bg-white px-2.5 text-[9px] font-semibold text-[#6E4D2D]"><SearchCheck size={11} /> {busy ? "Checking…" : "Verify now"}</button> : null}
          </div>

          {error ? <div className="mt-3 rounded-lg border border-red-700/10 bg-red-50 px-3 py-2 text-[9px] text-red-800">{error}</div> : null}
          {item.blocked_reason ? <div className="mt-3 rounded-lg border border-red-700/10 bg-red-50 px-3 py-2 text-[9px] text-red-800"><b>Blocked:</b> {item.blocked_reason}</div> : null}
          {(item.metadata?.system_gate?.blockers || []).length ? <div className="mt-3 grid gap-1.5 md:grid-cols-2">{item.metadata.system_gate.blockers.map((blocker, index) => <div key={index} className="rounded-lg border border-red-700/10 bg-white px-2.5 py-2 text-[8px] text-red-800">{blocker}</div>)}</div> : null}

          {mode === "DOCUMENT_CATEGORIES" ? (
            <div className="mt-4">
              <div className="text-[9px] font-semibold text-[#4A4540]">Evidence coverage</div>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                {requirements.map((requirement) => <div key={requirement.key} className={`rounded-xl border p-3 ${requirement.satisfied ? "border-emerald-700/10 bg-emerald-50/35" : "border-amber-700/10 bg-white"}`}><div className="flex items-center justify-between"><span className="text-[9px] font-semibold">{requirement.label}</span>{requirement.satisfied ? <BadgeCheck size={12} className="text-emerald-700" /> : <CircleDot size={12} className="text-amber-700" />}</div><div className="mt-1 text-[8px] text-[#918B83]">{requirement.linked_count}/{requirement.min_count} linked{requirement.missing_count ? ` · ${requirement.missing_count} missing` : ""}</div></div>)}
              </div>
              <div className="mt-3 rounded-xl border border-black/[0.06] bg-white p-3">
                <div className="text-[9px] font-semibold">Linked canonical documents</div>
                <div className="mt-2 divide-y divide-black/[0.05]">
                  {links.map((link) => <div key={link.id} className="flex items-center justify-between gap-3 py-2 text-[9px]"><div className="min-w-0"><div className="truncate font-medium">{link.document?.file_name || link.document_id}</div><div className="text-[8px] text-[#99938A]">{label(link.evidence_category)} · {date(link.linked_at)}</div></div><div className="flex gap-1.5">{link.document?.file_url ? <a href={link.document.file_url} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-lg border border-black/[0.07] px-2 text-[8px]"><ExternalLink size={10} /> Open</a> : null}{item.can_manage_evidence ? <button type="button" disabled={busy} onClick={() => onUnlink(link)} className="inline-flex h-7 items-center gap-1 rounded-lg border border-red-700/10 px-2 text-[8px] text-red-700"><Unlink size={10} /> Unlink</button> : null}</div></div>)}
                  {!links.length ? <div className="py-3 text-[9px] text-[#918B83]">No classified documents are linked to this procedure.</div> : null}
                </div>
              </div>
              {item.can_manage_evidence ? <div className="mt-3 rounded-xl border border-[#A37849]/15 bg-[#FFFDF9] p-3"><div className="flex items-center gap-1.5 text-[9px] font-semibold"><Link2 size={11} /> Link existing document</div><div className="mt-2 grid gap-2 md:grid-cols-[180px_minmax(220px,1fr)_auto]"><select value={category} onChange={(event) => { setCategory(event.target.value); setDocumentId(""); }} className="h-9 rounded-lg border border-black/[0.08] bg-white px-2 text-[9px]">{requirements.map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}</select><select value={documentId} onChange={(event) => setDocumentId(event.target.value)} className="h-9 rounded-lg border border-black/[0.08] bg-white px-2 text-[9px]"><option value="">Select client document…</option>{available.map((document) => <option key={document.id} value={document.id}>{document.file_name || document.id}</option>)}</select><button type="button" disabled={busy || !category || !documentId} onClick={() => onLink(item, category, documentId)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#3F352A] px-3 text-[9px] font-semibold text-white disabled:opacity-40"><Link2 size={11} /> Link evidence</button></div><div className="mt-2 text-[8px] text-[#918B83]">Uses canonical client documents; no duplicate upload is created. Any evidence change invalidates prior system verification.</div></div> : <div className="mt-3 text-[8px] text-[#918B83]">{item.evidence_edit_block_reason}</div>}
            </div>
          ) : null}

          {mode === "FINANCIAL_REPORT_SET" ? <div className="mt-4"><div className="mb-2 text-[9px] font-semibold">Financial statement truth</div><div className="grid gap-2 md:grid-cols-3">{reports.length ? reports.map((report) => <div key={report.report_type} className="rounded-xl border border-black/[0.06] bg-white p-3"><div className="flex justify-between"><span className="text-[9px] font-semibold">{label(report.report_type)}</span>{report.generated ? <BadgeCheck size={12} className="text-emerald-700" /> : <AlertTriangle size={12} className="text-red-700" />}</div><div className="mt-1 text-[8px] text-[#918B83]">{report.report_type === "trial_balance" ? `${report.account_count || 0} accounts · difference ${Number(report.difference || 0).toFixed(2)} · ${report.balanced ? "balanced" : "not balanced"}` : report.has_document ? "Report document generated" : "Report document missing"}</div></div>) : <div className="text-[9px] text-[#918B83]">No report verification has been run yet.</div>}</div></div> : null}
          {mode === "DEPENDENCY_AUDIT_CHAIN" ? <div className="mt-4 rounded-xl border border-black/[0.06] bg-white p-3"><div className="text-[9px] font-semibold">Dependency audit chain</div><div className="mt-1 text-[8px] text-[#918B83]">{Number(item.verification_summary?.audited_dependencies || 0)}/{Number(item.verification_summary?.dependency_count || 0)} prerequisite procedures have completion audit evidence.</div></div> : null}
          <ClientRequestPanel request={clientRequest} />
          <ReviewHandoff item={item} busy={busy} onLifecycle={onLifecycle} />
        </div>

        <aside className="rounded-xl border border-black/[0.07] bg-white p-3.5">
          <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8A867F]">Procedure finish</div>
          <div className="mt-2 flex flex-wrap gap-2 text-[8px] text-[#817B73]"><span>{label(item.required_role)}</span><span>·</span><span>{hours(item.budget_minutes)} budget</span><span>·</span><span>Due {date(item.due_at)}</span></div>
          <div className="mt-3"><VerificationBadge item={item} /></div>

          {humanEvidenceRequired ? <label className="mt-4 block"><span className="text-[8px] font-semibold text-[#5B554E]">Evidence note</span><textarea value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} rows={3} placeholder="Record the evidence relied on…" className="mt-1.5 w-full resize-y rounded-lg border border-black/[0.08] bg-[#FCFBF9] p-2.5 text-[9px] outline-none focus:border-[#A37849]/40" /></label> : null}

          {evidenceRequired || item.conclusion || readyForCompletion ? <label className="mt-3 block"><span className="text-[8px] font-semibold text-[#5B554E]">Conclusion{evidenceRequired ? " · required" : ""}</span><textarea value={conclusion} onChange={(event) => setConclusion(event.target.value)} rows={4} placeholder="Record the accountant’s conclusion…" className="mt-1.5 w-full resize-y rounded-lg border border-black/[0.08] bg-[#FCFBF9] p-2.5 text-[9px] outline-none focus:border-[#A37849]/40" /></label> : null}

          {readyForCompletion ? <button type="button" disabled={busy || (evidenceRequired && !conclusion.trim()) || (humanEvidenceRequired && !evidenceNote.trim())} onClick={() => onLifecycle(item, "complete_item", { conclusion: conclusion.trim() || null, ...(humanEvidenceRequired ? { evidence: evidenceNote.trim() } : {}), readyForReview: preparerHandoff })} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#3F352A] px-3 text-[9px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? <LoaderCircle size={11} className="animate-spin" /> : preparerHandoff ? <ArrowRight size={11} /> : <CheckCircle2 size={11} />}{busy ? "Saving…" : preparerHandoff ? "Send to review" : "Complete procedure"}</button> : null}
          {status === "READY_FOR_REVIEW" ? <div className="mt-3 rounded-lg bg-amber-50 px-2.5 py-2 text-[8px] text-amber-800">Prepared and handed off. Reviewer action happens through the governed review workflow.</div> : null}
          {status === "WAITING_ON_CLIENT" ? <div className="mt-3 rounded-lg bg-[#F7F6F3] px-2.5 py-2 text-[8px] text-[#716B63]">Waiting on client evidence or response. The procedure stays out of the preparer’s active work until the request returns.</div> : null}
        </aside>
      </div>
    </div>
  );
}

function WorkItemRow({ item, clientRequest, expanded, locked, onToggle, documents, busy, error, onVerify, onLink, onUnlink, onLifecycle }) {
  const unresolved = (item.review?.notes || []).filter((note) => note.status !== "RESOLVED").length;
  const action = nextAction(item, locked);
  const overdue = !isTerminal(item.status) && item.due_at && date(item.due_at) < new Date().toISOString().slice(0, 10);
  const missingEvidence = Number(item.evidence_coverage?.missing_categories || 0);

  function runAction() {
    if (action.kind === "expand") return onToggle();
    if (action.kind === "lifecycle") return onLifecycle(item, action.action, { readyForReview: action.readyForReview === true });
  }

  return (
    <>
      <div className={`grid min-w-[900px] grid-cols-[34px_36px_minmax(300px,1.7fr)_100px_120px_105px_150px] items-center gap-3 border-b border-black/[0.05] px-3 py-2.5 text-[10px] transition ${expanded ? "bg-[#FCFAF6]" : "hover:bg-[#FCFBF9]"}`}>
        <button type="button" onClick={onToggle} aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Open"} ${item.title}`} className="flex h-7 w-7 items-center justify-center rounded-md text-[#817D76] hover:bg-black/[0.04] hover:text-[#5F452D]">{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button>
        <span className="tabular-nums text-[#A09A92]">{item.sequence_no}</span>
        <button type="button" onClick={onToggle} className="min-w-0 text-left">
          <div className="truncate font-semibold text-[#37342F]">{item.title}</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 overflow-hidden text-[8px] text-[#918B83]"><span className="truncate">{item.description || label(item.work_type)}</span><span className="shrink-0">{hours(item.budget_minutes)}</span>{missingEvidence ? <span className="shrink-0 text-amber-700">{missingEvidence} evidence missing</span> : null}{unresolved ? <span className="shrink-0 text-red-700">{unresolved} review point{unresolved === 1 ? "" : "s"}</span> : null}</div>
          {item.blocked_reason ? <div className="mt-0.5 truncate text-[8px] font-medium text-[#9A533D]">{item.blocked_reason}</div> : null}
        </button>
        <span className="truncate text-[#716B63]">{label(item.required_role)}</span>
        <span><span className={`inline-flex rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.05em] ${tone(item.status)}`}>{label(item.status)}</span></span>
        <span className={`tabular-nums ${overdue ? "font-semibold text-[#9A533D]" : "text-[#5E5952]"}`}>{date(item.due_at)}</span>
        <div className="flex items-center justify-end gap-2">
          {action.kind === "done" ? <span className="inline-flex items-center gap-1 text-[8px] font-semibold text-emerald-700"><CheckCircle2 size={10} /> {action.label}</span> : <button type="button" disabled={busy} onClick={runAction} className={`inline-flex h-8 min-w-[118px] items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[8px] font-semibold disabled:opacity-45 ${action.kind === "lifecycle" ? "border-[#A37849]/20 bg-[#FFF9F2] text-[#76583A] hover:bg-[#FFF4E7]" : "border-black/[0.08] bg-white text-[#716B63] hover:bg-[#F8F6F2]"}`}>{busy ? <LoaderCircle size={10} className="animate-spin" /> : action.action === "start_item" ? <Play size={9} /> : <ArrowRight size={10} />}{busy ? "Working…" : action.label}</button>}
        </div>
      </div>
      {expanded ? <WorkpaperDetail item={item} clientRequest={clientRequest} documents={documents} busy={busy} error={error} onVerify={onVerify} onLink={onLink} onUnlink={onUnlink} onLifecycle={onLifecycle} /> : null}
    </>
  );
}

export default function FinanceEngagementWorkProgram({ organizationId, run, documents = [], onReload }) {
  const [open, setOpen] = useState(true);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [operation, setOperation] = useState({ key: "", itemId: "", error: "" });

  useEffect(() => {
    setOpen(true);
    const focus = (run?.work_items || []).find((item) => ["IN_PROGRESS", "CHANGES_REQUESTED", "BLOCKED"].includes(String(item.status || "").toUpperCase()));
    setExpandedItems(focus?.id ? new Set([focus.id]) : new Set());
    setOperation({ key: "", itemId: "", error: "" });
  }, [run?.id]);

  async function reloadAndFocus({ currentItemId, action }) {
    const refreshed = await onReload?.();
    if (!refreshed?.current_run) return refreshed;
    if (action === "start_item") {
      setExpandedItems(new Set([currentItemId]));
      return refreshed;
    }
    if (action === "complete_item") {
      const next = (refreshed.current_run.work_items || []).find((item) => ["IN_PROGRESS", "CHANGES_REQUESTED", "BLOCKED", "READY"].includes(String(item.status || "").toUpperCase()));
      if (next?.id) setExpandedItems(new Set([next.id]));
    }
    return refreshed;
  }

  async function lifecycle(item, action, extras = {}) {
    if (!item?.id || !item?.run_id || run?.locked_at) return;
    setOperation({ key: `${action}:${item.id}`, itemId: item.id, error: "" });
    try {
      const response = await fetch("/api/workspace/finance/work-programs/lifecycle", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action, runId: item.run_id, workItemId: item.id, ...extras }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) {
        const detail = apiDetail(body?.details);
        throw new Error([body?.error || "Unable to update accounting procedure", detail].filter(Boolean).join(": "));
      }
      await reloadAndFocus({ currentItemId: item.id, action });
      setOperation({ key: "", itemId: item.id, error: "" });
    } catch (error) {
      setExpandedItems((current) => new Set([...current, item.id]));
      setOperation({ key: "", itemId: item.id, error: error?.message || "Unable to update accounting procedure" });
    }
  }

  async function verify(item) {
    setOperation({ key: `verify:${item.id}`, itemId: item.id, error: "" });
    try {
      const response = await fetch("/api/workspace/finance/work-programs/verify", { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, runId: item.run_id, workItemId: item.id }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || (body?.gate?.blockers || []).join("; ") || "Verification did not clear this workpaper");
      await onReload?.();
      setOperation({ key: "", itemId: item.id, error: "" });
    } catch (error) {
      setOperation({ key: "", itemId: item.id, error: error?.message || "Unable to verify workpaper" });
    }
  }

  async function linkEvidence(item, evidenceCategory, documentId) {
    setOperation({ key: `link:${item.id}`, itemId: item.id, error: "" });
    try {
      const response = await fetch("/api/workspace/finance/work-programs/evidence", { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, workItemId: item.id, documentId, evidenceCategory }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to link evidence");
      await onReload?.();
      setOperation({ key: "", itemId: item.id, error: "" });
    } catch (error) {
      setOperation({ key: "", itemId: item.id, error: error?.message || "Unable to link evidence" });
    }
  }

  async function unlinkEvidence(link) {
    setOperation({ key: `unlink:${link.work_item_id}`, itemId: link.work_item_id, error: "" });
    try {
      const response = await fetch("/api/workspace/finance/work-programs/evidence", { method: "DELETE", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, evidenceLinkId: link.id }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to unlink evidence");
      await onReload?.();
      setOperation({ key: "", itemId: link.work_item_id, error: "" });
    } catch (error) {
      setOperation({ key: "", itemId: link.work_item_id, error: error?.message || "Unable to unlink evidence" });
    }
  }

  if (!run) return null;
  const requestByItem = new Map((run.client_requests || []).map((request) => [request.work_item_id, request]));
  const complete = Number(run.progress?.complete || 0);
  const total = Number(run.progress?.total || 0);
  const percent = Number(run.progress?.percent || 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
      <button type="button" onClick={() => setOpen((current) => !current)} className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-[#37342F]">{run.template?.name || run.run_key || "Accounting work program"}</span><span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase ${tone(run.status)}`}>{label(run.status)}</span>{run.locked_at ? <span className="rounded-full border border-black/[0.07] px-2 py-1 text-[7px] text-[#817D76]">Locked snapshot</span> : null}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[8px] text-[#918B83]"><span>{run.period?.period_name || run.run_key}</span><span>{complete}/{total} procedures</span><span>{hours(run.progress?.budget_minutes)} budget</span><span>Due {date(run.due_at)}</span>{run.progress?.missing_evidence_categories ? <span className="text-amber-700">{run.progress.missing_evidence_categories} evidence missing</span> : null}{run.progress?.verification_attention_items ? <span className="text-amber-700">{run.progress.verification_attention_items} verify attention</span> : null}</div>
          <div className="mt-2 h-1 w-full max-w-xl overflow-hidden rounded-full bg-black/[0.05]"><div className="h-full rounded-full bg-[#9A744B] transition-all" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></div>
        </div>
        {open ? <ChevronDown size={15} className="shrink-0 text-[#817D76]" /> : <ChevronRight size={15} className="shrink-0 text-[#817D76]" />}
      </button>

      {open ? (
        <div className="overflow-x-auto border-t border-black/[0.06]">
          {run.completion_system_clearance ? <div className="min-w-[900px] bg-emerald-50/40 px-4 py-2 text-[8px] text-emerald-800">Historical system clearance snapshot retained at final lock.</div> : null}
          <div className="grid min-w-[900px] grid-cols-[34px_36px_minmax(300px,1.7fr)_100px_120px_105px_150px] gap-3 bg-[#FAF9F7] px-3 py-2 text-[8px] font-medium uppercase tracking-[0.08em] text-[#8A867F]"><span></span><span>#</span><span>Procedure</span><span>Role</span><span>Status</span><span>Due</span><span className="text-right">Next action</span></div>
          {(run.work_items || []).map((item) => <WorkItemRow key={item.id} item={item} clientRequest={requestByItem.get(item.id) || null} expanded={expandedItems.has(item.id)} locked={Boolean(run.locked_at)} onToggle={() => setExpandedItems((current) => { const next = new Set(current); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; })} documents={documents} busy={operation.itemId === item.id && Boolean(operation.key)} error={operation.itemId === item.id ? operation.error : ""} onVerify={verify} onLink={linkEvidence} onUnlink={unlinkEvidence} onLifecycle={lifecycle} />)}
        </div>
      ) : null}
    </div>
  );
}
