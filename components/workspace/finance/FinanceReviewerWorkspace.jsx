"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";

import FinanceEngagementFile from "@/components/workspace/finance/FinanceEngagementFile";

const FILTERS = [
  { id: "MY", label: "My review" },
  { id: "DECISION", label: "Needs decision" },
  { id: "OVERDUE", label: "Overdue" },
  { id: "PARTNER", label: "Partner" },
  { id: "BLOCKED", label: "Blocked" },
  { id: "RETURNED", label: "Returned" },
  { id: "ALL", label: "All" },
];

function label(value) {
  return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function clean(value) {
  return String(value || "").trim();
}

function shortDate(value) {
  return value ? String(value).slice(0, 10) : "—";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function hours(minutes) {
  return `${Math.round((Number(minutes || 0) / 60) * 10) / 10}h`;
}

function tone(value) {
  const status = String(value || "").toUpperCase();
  if (["CHANGES_REQUESTED", "BLOCKED", "SYSTEM_BLOCKED"].includes(status)) return "border-red-700/15 bg-red-50 text-red-800";
  if (["READY_FOR_REVIEW", "REVIEWER", "PARTNER", "READY", "IN_PROGRESS", "INSPECT"].includes(status)) return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (["COMPLETE", "CLEARED", "VERIFIED", "READY_TO_DECIDE"].includes(status)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  return "border-black/[0.08] bg-[#F7F6F3] text-[#716B63]";
}

function queueStage(row) {
  const status = String(row.status || "").toUpperCase();
  const role = String(row.required_role || "").toUpperCase();
  if (status === "CHANGES_REQUESTED") return "RETURNED";
  if (role === "PARTNER") return "PARTNER";
  if (status === "READY_FOR_REVIEW") return "DECISION";
  return "REVIEWER";
}

function isReviewWork(row) {
  const status = String(row.status || "").toUpperCase();
  const role = String(row.required_role || "").toUpperCase();
  return status === "READY_FOR_REVIEW" ||
    status === "CHANGES_REQUESTED" ||
    (["REVIEWER", "PARTNER"].includes(role) && ["READY", "IN_PROGRESS", "BLOCKED"].includes(status));
}

function humanEvidence(row) {
  if (typeof row.evidence === "string") return row.evidence;
  if (!row.evidence || typeof row.evidence !== "object") return "";
  const entries = Object.entries(row.evidence)
    .filter(([key]) => !["system_verified", "system_checked_at"].includes(key))
    .slice(0, 8);
  return entries.map(([key, value]) => `${label(key)}: ${typeof value === "string" ? value : JSON.stringify(value)}`).join("\n");
}

function truthState(row) {
  const gate = row.metadata?.system_gate;
  if (gate?.applicable === true && gate.satisfied === true) return { label: "System verified", state: "VERIFIED" };
  if (gate?.applicable === true && gate.satisfied === false) return { label: "System blocked", state: "SYSTEM_BLOCKED" };
  if (row.finance_review_item_id) return { label: "Review control linked", state: "REVIEWER" };
  if (humanEvidence(row)) return { label: "Evidence recorded", state: "VERIFIED" };
  return { label: "Evidence inspection needed", state: "INSPECT" };
}

function evidenceState(row) {
  const required = row.metadata?.evidence_required === true;
  const gate = row.metadata?.system_gate;
  const recorded = Boolean(humanEvidence(row)) || gate?.satisfied === true;
  if (!required) return { label: recorded ? "Evidence available" : "No extra evidence required", ready: true };
  return recorded
    ? { label: "Required evidence present", ready: true }
    : { label: "Required evidence needs inspection", ready: false };
}

function decisionState(row) {
  const status = String(row.status || "").toUpperCase();
  const role = String(row.required_role || "").toUpperCase();
  const systemGate = row.metadata?.system_gate;
  const explicitBlocker = status === "BLOCKED" || Boolean(clean(row.blocked_reason)) || systemGate?.satisfied === false;
  const evidence = evidenceState(row);
  const conclusionReady = Boolean(clean(row.conclusion));

  if (status === "CHANGES_REQUESTED") {
    return {
      action: "Returned to preparer",
      why: "Changes were requested. The preparer owns the next action before this comes back for review.",
      readiness: "RETURNED",
      canDecide: false,
    };
  }
  if (explicitBlocker) {
    return {
      action: "Resolve blocker before decision",
      why: clean(row.blocked_reason) || systemGate?.blockers?.[0] || "A deterministic accounting gate is not satisfied.",
      readiness: "BLOCKED",
      canDecide: false,
    };
  }
  if (status === "READY_FOR_REVIEW") {
    return {
      action: "Approve or request changes",
      why: !conclusionReady
        ? "The preparer conclusion is missing from this handoff and should be inspected before approval."
        : !evidence.ready
          ? "Required evidence is not visible in the workpaper summary and should be inspected before approval."
          : "Preparation is complete and the workpaper is ready for reviewer judgment.",
      readiness: conclusionReady && evidence.ready ? "READY_TO_DECIDE" : "INSPECT",
      canDecide: true,
    };
  }
  if (role === "PARTNER") {
    return status === "IN_PROGRESS"
      ? { action: "Complete partner clearance", why: "Partner review is in progress. Confirm the final judgment and complete the governed step.", readiness: "READY_TO_DECIDE", canDecide: true }
      : { action: "Start partner clearance", why: "Reviewer work is complete and this item is waiting for partner-level judgment.", readiness: "READY_TO_DECIDE", canDecide: true };
  }
  if (role === "REVIEWER") {
    return status === "IN_PROGRESS"
      ? { action: "Complete reviewer procedure", why: "The review procedure is in progress. Finish the judgment and governed completion checks.", readiness: "READY_TO_DECIDE", canDecide: true }
      : { action: "Start reviewer procedure", why: "This governed reviewer procedure is ready to begin.", readiness: "READY_TO_DECIDE", canDecide: true };
  }
  return { action: "Inspect workpaper", why: "Review the accounting evidence and conclusion before deciding the next step.", readiness: "INSPECT", canDecide: true };
}

function assignedReviewOwner(row) {
  const stage = queueStage(row);
  if (stage === "PARTNER") return row.assigned_to || row.assigned_partner_id || null;
  if (stage === "REVIEWER") return row.assigned_to || row.assigned_reviewer_id || null;
  if (stage === "DECISION") return row.assigned_reviewer_id || null;
  return null;
}

function isMine(row, viewerId) {
  if (!viewerId) return false;
  return assignedReviewOwner(row) === viewerId;
}

function reviewRank(row, viewerId) {
  const decision = decisionState(row);
  const overdue = row.due_at && shortDate(row.due_at) < today();
  let rank = 100;
  if (isMine(row, viewerId)) rank -= 30;
  if (overdue) rank -= 25;
  if (decision.readiness === "READY_TO_DECIDE") rank -= 20;
  if (queueStage(row) === "DECISION") rank -= 10;
  if (queueStage(row) === "PARTNER") rank -= 5;
  if (decision.readiness === "BLOCKED") rank += 15;
  if (queueStage(row) === "RETURNED") rank += 30;
  return rank;
}

function Metric({ title, value, detail, warning = false }) {
  return (
    <div className="rounded-xl border border-black/[0.07] bg-white px-3.5 py-3">
      <div className="text-[8px] font-medium uppercase tracking-[0.13em] text-[#8C877F]">{title}</div>
      <div className={`mt-1.5 text-[20px] font-semibold tracking-[-0.03em] ${warning && Number(value) > 0 ? "text-[#9A533D]" : "text-[#2A2723]"}`}>{value}</div>
      <div className="mt-0.5 text-[8px] text-[#99938A]">{detail}</div>
    </div>
  );
}

export default function FinanceReviewerWorkspace({ organizationId }) {
  const [state, setState] = useState({ loading: true, error: "", practice: null, workPrograms: null });
  const [filter, setFilter] = useState("MY");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [showClientFile, setShowClientFile] = useState(false);

  async function load({ preserveSelection = true } = {}) {
    if (!organizationId) return null;
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const practiceUrl = new URL("/api/workspace/finance/practice-control", window.location.origin);
      practiceUrl.searchParams.set("organizationId", organizationId);
      const workUrl = new URL("/api/workspace/finance/work-programs", window.location.origin);
      workUrl.searchParams.set("organizationId", organizationId);
      const [practiceResponse, workResponse] = await Promise.all([
        fetch(practiceUrl.toString(), { cache: "no-store", credentials: "include" }),
        fetch(workUrl.toString(), { cache: "no-store", credentials: "include" }),
      ]);
      const [practiceBody, workBody] = await Promise.all([
        practiceResponse.json().catch(() => ({})),
        workResponse.json().catch(() => ({})),
      ]);
      if (!practiceResponse.ok || practiceBody?.success === false) throw new Error(practiceBody?.error || "Unable to load accounting practice");
      if (!workResponse.ok || workBody?.success === false) throw new Error(workBody?.error || "Unable to load reviewer work");
      setState({ loading: false, error: "", practice: practiceBody, workPrograms: workBody });
      if (!preserveSelection) setSelectedId(null);
      return { practice: practiceBody, workPrograms: workBody };
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || "Unable to load reviewer workspace" }));
      return null;
    }
  }

  useEffect(() => { load({ preserveSelection: false }); }, [organizationId]);

  const viewer = state.practice?.viewer || {};
  const viewerId = viewer.staff_account_id || null;
  const clients = Array.isArray(state.practice?.clients) ? state.practice.clients : [];
  const clientMap = useMemo(() => new Map(clients.map((client) => [client.organization_id, client])), [clients]);

  const queue = useMemo(() => {
    const rows = [];
    for (const run of state.workPrograms?.runs || []) {
      const client = clientMap.get(run.organization_id) || {};
      for (const item of run.work_items || []) {
        if (!isReviewWork(item)) continue;
        rows.push({
          ...item,
          engagement_id: run.engagement_id,
          run_id: run.id,
          run_status: run.status,
          run_due_at: run.due_at,
          client_name: client.name || "Client organization",
          assigned_accountant: client.assigned_accountant || null,
          assigned_accountant_id: client.assigned_accountant_id || null,
          assigned_reviewer: client.assigned_reviewer || null,
          assigned_reviewer_id: client.assigned_reviewer_id || null,
          assigned_partner: client.assigned_partner || null,
          assigned_partner_id: client.assigned_partner_id || null,
          client_status: client.status || null,
        });
      }
    }
    return rows.sort((a, b) =>
      reviewRank(a, viewerId) - reviewRank(b, viewerId) ||
      String(a.due_at || "9999-12-31").localeCompare(String(b.due_at || "9999-12-31")) ||
      String(a.client_name).localeCompare(String(b.client_name)) ||
      Number(a.sequence_no || 0) - Number(b.sequence_no || 0)
    );
  }, [state.workPrograms, clientMap, viewerId]);

  const visibleQueue = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return queue.filter((row) => {
      const stage = queueStage(row);
      const decision = decisionState(row);
      const overdue = row.due_at && shortDate(row.due_at) < today();
      if (filter === "MY" && !isMine(row, viewerId)) return false;
      if (filter === "DECISION" && decision.readiness !== "READY_TO_DECIDE") return false;
      if (filter === "OVERDUE" && !overdue) return false;
      if (filter === "PARTNER" && stage !== "PARTNER") return false;
      if (filter === "BLOCKED" && decision.readiness !== "BLOCKED") return false;
      if (filter === "RETURNED" && stage !== "RETURNED") return false;
      if (needle) {
        return [row.client_name, row.title, row.assigned_accountant, row.assigned_reviewer, row.assigned_partner, row.conclusion, decision.action, decision.why]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);
      }
      return true;
    });
  }, [queue, filter, search, viewerId]);

  useEffect(() => {
    if (!visibleQueue.length) {
      setSelectedId(null);
      return;
    }
    if (!visibleQueue.some((row) => row.id === selectedId)) setSelectedId(visibleQueue[0].id);
  }, [visibleQueue, selectedId]);

  const selected = visibleQueue.find((row) => row.id === selectedId) || null;
  const selectedIndex = selected ? visibleQueue.findIndex((row) => row.id === selected.id) : -1;
  const myCount = queue.filter((row) => isMine(row, viewerId)).length;
  const decisionCount = queue.filter((row) => decisionState(row).readiness === "READY_TO_DECIDE").length;
  const partnerCount = queue.filter((row) => queueStage(row) === "PARTNER").length;
  const blockedCount = queue.filter((row) => decisionState(row).readiness === "BLOCKED").length;
  const overdueCount = queue.filter((row) => row.due_at && shortDate(row.due_at) < today()).length;

  async function lifecycle(row, action, extras = {}) {
    if (!row?.id || !row?.run_id || busy) return;
    try {
      setBusy(action);
      setActionError("");
      const currentId = row.id;
      const nextId = visibleQueue[selectedIndex + 1]?.id || visibleQueue[selectedIndex - 1]?.id || null;
      const response = await fetch("/api/workspace/finance/work-programs/lifecycle", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action, runId: row.run_id, workItemId: row.id, ...extras }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) {
        const detail = Array.isArray(body?.details) ? body.details.map((item) => item?.title || item?.blocker || item?.status).filter(Boolean).join("; ") : "";
        throw new Error([body?.error || "Unable to update review work", detail].filter(Boolean).join(": "));
      }
      await load({ preserveSelection: true });
      setSelectedId(action === "start_item" ? currentId : nextId);
      setChangeReason("");
    } catch (error) {
      setActionError(error?.message || "Unable to update review work");
    } finally {
      setBusy("");
    }
  }

  async function approve(row) {
    const status = String(row.status || "").toUpperCase();
    if (status === "CHANGES_REQUESTED") return;
    if (["READY", "NOT_STARTED"].includes(status)) {
      await lifecycle(row, "start_item");
      return;
    }
    await lifecycle(row, "complete_item", {
      conclusion: row.conclusion || null,
      evidence: row.evidence || undefined,
      readyForReview: false,
    });
  }

  function move(delta) {
    const next = visibleQueue[selectedIndex + delta];
    if (next) {
      setSelectedId(next.id);
      setActionError("");
      setChangeReason("");
    }
  }

  if (showClientFile && selected?.engagement_id) {
    return (
      <section className="rounded-[24px] border border-[#A37849]/15 bg-[#FBF8F3] p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-black/[0.06] pb-3">
          <button type="button" onClick={() => setShowClientFile(false)} className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-[#76583A]"><ChevronLeft size={11} /> Back to review desk</button>
          <div className="text-[8px] text-[#99938A]">Full client accounting file</div>
        </div>
        <FinanceEngagementFile organizationId={organizationId} engagementId={selected.engagement_id} onClose={() => setShowClientFile(false)} />
      </section>
    );
  }

  const selectedDecision = selected ? decisionState(selected) : null;
  const selectedTruth = selected ? truthState(selected) : null;
  const selectedEvidence = selected ? evidenceState(selected) : null;
  const selectedOwner = selected ? assignedReviewOwner(selected) : null;

  return (
    <section className="rounded-[24px] border border-[#A37849]/15 bg-[#FBF8F3] p-4 md:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.16em] text-[#8A633C]"><ShieldCheck size={12} /> Review</div>
          <h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.025em] text-[#2A2723]">Decide what needs judgment</h2>
          <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[#756F67]">The desk ranks assigned review work by urgency and decision readiness. Each item explains why it is here, what evidence exists and exactly what decision is required.</p>
          <div className="mt-2 text-[8px] text-[#99938A]">Signed in as <span className="font-semibold text-[#615B54]">{viewer.name || "Accounting team member"}</span>{viewer.role ? ` · ${label(viewer.role)}` : ""}</div>
        </div>
        <button type="button" onClick={() => load({ preserveSelection: true })} disabled={state.loading} className="inline-flex h-9 items-center gap-2 self-start rounded-xl border border-[#A37849]/20 bg-white px-3 text-[9px] font-semibold text-[#76583A] disabled:opacity-50 lg:self-auto"><RefreshCw size={11} className={state.loading ? "animate-spin" : ""} /> Refresh</button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Metric title="My review" value={myCount} detail="Assigned to you" />
        <Metric title="Ready to decide" value={decisionCount} detail="Judgment can proceed" />
        <Metric title="Overdue" value={overdueCount} detail="Past review deadline" warning />
        <Metric title="Blocked" value={blockedCount} detail="Cannot be cleared yet" warning />
        <Metric title="Partner" value={partnerCount} detail="Final clearance" />
      </div>

      <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.map((item) => <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`h-8 shrink-0 rounded-lg border px-2.5 text-[8px] font-semibold uppercase tracking-[0.08em] ${filter === item.id ? "border-[#A37849]/25 bg-[#A37849]/[0.08] text-[#76583A]" : "border-black/[0.07] bg-white text-[#817D76]"}`}>{item.label}</button>)}
        </div>
        <label className="flex h-9 w-full items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 xl:w-[340px]"><Search size={12} className="text-[#A29D95]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client, workpaper, decision or reviewer" className="min-w-0 flex-1 bg-transparent text-[10px] text-[#403C37] outline-none placeholder:text-[#B2ADA5]" /></label>
      </div>

      {state.error ? <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[9px] text-red-800">{state.error}</div> : null}
      {state.loading && !state.workPrograms ? <div className="flex min-h-[220px] items-center justify-center text-[10px] text-[#817D76]"><LoaderCircle size={14} className="mr-2 animate-spin text-[#A37849]" /> Preparing reviewer queue…</div> : null}

      {!state.loading || state.workPrograms ? (
        visibleQueue.length ? (
          <div className="mt-4 grid min-h-[580px] gap-4 xl:grid-cols-[minmax(420px,0.78fr)_minmax(560px,1.22fr)]">
            <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] bg-[#FAF9F7] px-4 py-2.5"><span className="text-[8px] font-medium uppercase tracking-[0.11em] text-[#8A867F]">{visibleQueue.length} item{visibleQueue.length === 1 ? "" : "s"}</span><span className="text-[7px] text-[#A29C93]">Ranked by ownership · urgency · readiness</span></div>
              <div className="max-h-[680px] overflow-y-auto">
                {visibleQueue.map((row) => {
                  const active = row.id === selected?.id;
                  const stage = queueStage(row);
                  const overdue = row.due_at && shortDate(row.due_at) < today();
                  const decision = decisionState(row);
                  const mine = isMine(row, viewerId);
                  return (
                    <button key={row.id} type="button" onClick={() => { setSelectedId(row.id); setActionError(""); setChangeReason(""); }} className={`w-full border-b border-black/[0.05] px-4 py-3 text-left last:border-0 ${active ? "bg-[#FFF8EE]" : "hover:bg-[#FCFBF9]"}`}>
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-1.5"><div className="truncate text-[10px] font-semibold text-[#37342F]">{row.client_name}</div>{mine ? <span className="rounded border border-[#A37849]/15 bg-[#A37849]/[0.06] px-1 py-0.5 text-[6px] font-semibold uppercase text-[#76583A]">Mine</span> : null}</div><div className="mt-0.5 truncate text-[9px] font-medium text-[#5E5952]">{row.title}</div></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[6px] font-semibold uppercase tracking-[0.06em] ${tone(decision.readiness)}`}>{decision.readiness === "READY_TO_DECIDE" ? "Ready" : label(decision.readiness)}</span></div>
                      <div className="mt-2 text-[8px] font-semibold text-[#6E5237]">{decision.action}</div>
                      <div className="mt-1 line-clamp-2 text-[7px] leading-3.5 text-[#99938A]">{decision.why}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[7px] text-[#99938A]"><span className={overdue ? "font-semibold text-[#9A533D]" : ""}>Due {shortDate(row.due_at)}</span><span>{stage === "PARTNER" ? row.assigned_partner || "Partner unassigned" : row.assigned_reviewer || "Reviewer unassigned"}</span>{row.conclusion ? <span className="text-[#6F7E68]">Conclusion present</span> : <span className="text-[#9A7045]">Inspect conclusion</span>}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {selected ? (
              <div className="rounded-2xl border border-black/[0.07] bg-white">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/[0.06] px-4 py-3.5">
                  <div className="min-w-0"><div className="text-[8px] font-medium uppercase tracking-[0.13em] text-[#8A633C]">Decision workpaper</div><div className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[#312D28]">{selected.title}</div><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] text-[#918B83]"><span>{selected.client_name}</span><span>{label(selected.required_role)}</span><span>Due {shortDate(selected.due_at)}</span>{selectedOwner && selectedOwner === viewerId ? <span className="font-semibold text-[#76583A]">Assigned to you</span> : null}</div></div>
                  <div className="flex items-center gap-1"><button type="button" onClick={() => move(-1)} disabled={selectedIndex <= 0} className="h-8 w-8 rounded-lg border border-black/[0.07] text-[#716B63] disabled:opacity-30"><ChevronLeft size={12} className="mx-auto" /></button><button type="button" onClick={() => move(1)} disabled={selectedIndex >= visibleQueue.length - 1} className="h-8 w-8 rounded-lg border border-black/[0.07] text-[#716B63] disabled:opacity-30"><ChevronRight size={12} className="mx-auto" /></button></div>
                </div>

                <div className="p-4">
                  <div className={`rounded-xl border p-3 ${selectedDecision.readiness === "BLOCKED" ? "border-red-700/12 bg-red-50" : selectedDecision.readiness === "READY_TO_DECIDE" ? "border-emerald-700/10 bg-emerald-50/45" : "border-amber-700/10 bg-amber-50/45"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[7px] font-semibold uppercase tracking-[0.11em] text-[#8A867F]">Decision required</div><div className="mt-1 text-[13px] font-semibold text-[#403A34]">{selectedDecision.action}</div><div className="mt-1 max-w-2xl text-[8px] leading-4 text-[#776F66]">{selectedDecision.why}</div></div><span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.06em] ${tone(selectedDecision.readiness)}`}>{selectedDecision.readiness === "READY_TO_DECIDE" ? "Ready to decide" : label(selectedDecision.readiness)}</span></div>
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-4">
                    <div className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-3"><div className="text-[7px] uppercase tracking-[0.1em] text-[#918B83]">Accounting truth</div><div className="mt-1.5"><span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase ${tone(selectedTruth.state)}`}>{selectedTruth.label}</span></div></div>
                    <div className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-3"><div className="text-[7px] uppercase tracking-[0.1em] text-[#918B83]">Evidence</div><div className={`mt-1.5 text-[8px] font-semibold ${selectedEvidence.ready ? "text-[#5F705B]" : "text-[#8A633C]"}`}>{selectedEvidence.label}</div></div>
                    <div className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-3"><div className="text-[7px] uppercase tracking-[0.1em] text-[#918B83]">Prepared by</div><div className="mt-1.5 truncate text-[9px] font-semibold text-[#4A4640]">{selected.assigned_accountant || "Unassigned"}</div></div>
                    <div className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-3"><div className="text-[7px] uppercase tracking-[0.1em] text-[#918B83]">Budget</div><div className="mt-1.5 text-[9px] font-semibold text-[#4A4640]">{hours(selected.budget_minutes)}</div></div>
                  </div>

                  {selected.description ? <div className="mt-4 rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3"><div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#918B83]">What was performed</div><div className="mt-1.5 text-[9px] leading-4 text-[#625D56]">{selected.description}</div></div> : null}

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3"><div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#918B83]"><FileCheck2 size={10} /> Preparer conclusion</div><div className={`mt-2 min-h-20 whitespace-pre-wrap text-[9px] leading-4 ${selected.conclusion ? "text-[#514C45]" : "text-[#9A7045]"}`}>{selected.conclusion || "No conclusion is visible in this workpaper summary. Inspect the client file before approval."}</div></div>
                    <div className="rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3"><div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#918B83]"><BadgeCheck size={10} /> Evidence summary</div><div className="mt-2 min-h-20 whitespace-pre-wrap text-[8px] leading-4 text-[#625D56]">{humanEvidence(selected) || (selected.metadata?.system_gate?.satisfied === true ? "Deterministic Finance evidence is verified and retained in the workpaper." : "Document-level evidence is not summarized here. Open the full client file before deciding if inspection is required.")}</div></div>
                  </div>

                  {(selected.metadata?.system_gate?.blockers || []).length ? <div className="mt-3 rounded-xl border border-red-700/10 bg-red-50 p-3"><div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase text-red-800"><AlertTriangle size={10} /> System blockers</div><div className="mt-2 space-y-1 text-[8px] text-red-800">{selected.metadata.system_gate.blockers.map((blocker, index) => <div key={index}>{blocker}</div>)}</div></div> : null}
                  {selected.blocked_reason ? <div className="mt-3 rounded-xl border border-red-700/10 bg-red-50 p-3 text-[8px] text-red-800"><b>Work blocker:</b> {selected.blocked_reason}</div> : null}
                  {actionError ? <div className="mt-3 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[8px] text-red-800">{actionError}</div> : null}

                  <div className="mt-4 rounded-xl border border-[#A37849]/15 bg-[#FFFDF9] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#8A633C]">Take decision</div><div className="mt-1 text-[8px] text-[#918B83]">The server re-runs dependencies, evidence and accounting-truth gates before any completion is accepted.</div></div><button type="button" onClick={() => setShowClientFile(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.07] bg-white px-2.5 text-[8px] font-semibold text-[#716B63]"><FolderOpen size={10} /> Full client file</button></div>

                    {String(selected.status || "").toUpperCase() === "READY_FOR_REVIEW" ? (
                      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,1fr)_auto_auto]">
                        <input value={changeReason} onChange={(event) => setChangeReason(event.target.value)} placeholder="Reason if changes are required…" className="h-9 rounded-lg border border-black/[0.08] bg-white px-3 text-[9px] outline-none focus:border-[#A37849]/40" />
                        <button type="button" disabled={Boolean(busy) || !changeReason.trim()} onClick={() => lifecycle(selected, "request_changes", { reason: changeReason.trim() })} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-red-700/15 bg-red-50 px-3 text-[8px] font-semibold text-red-800 disabled:opacity-40"><AlertTriangle size={10} /> Request changes</button>
                        <button type="button" disabled={Boolean(busy) || selectedDecision.readiness === "BLOCKED"} onClick={() => approve(selected)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#3F352A] px-4 text-[8px] font-semibold text-white disabled:opacity-40">{busy ? <LoaderCircle size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}{busy ? "Checking…" : "Approve & complete"}</button>
                      </div>
                    ) : String(selected.status || "").toUpperCase() === "CHANGES_REQUESTED" ? (
                      <div className="mt-3 rounded-lg border border-black/[0.06] bg-[#FAF9F7] px-3 py-2.5 text-[8px] text-[#817D76]">This item has been returned to the preparer. No reviewer action is available until the work is resubmitted.</div>
                    ) : (
                      <button type="button" disabled={Boolean(busy) || selectedDecision.readiness === "BLOCKED"} onClick={() => approve(selected)} className="mt-3 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#3F352A] px-4 text-[8px] font-semibold text-white disabled:opacity-40">{busy ? <LoaderCircle size={10} className="animate-spin" /> : String(selected.status || "").toUpperCase() === "IN_PROGRESS" ? <CheckCircle2 size={10} /> : <ArrowRight size={10} />}{busy ? "Working…" : selectedDecision.action}</button>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-black/[0.07] bg-white px-5 py-10 text-center"><CheckCircle2 size={20} className="mx-auto text-[#6F7E68]" /><div className="mt-2 text-[11px] font-semibold text-[#3D3934]">Nothing needs you in this view</div><div className="mx-auto mt-1 max-w-xl text-[9px] leading-5 text-[#8B867E]">Choose another review view or continue other accounting work. Returned preparer work is kept separate from decisions that currently belong to reviewers.</div></div>
        )
      ) : null}

      <div className="mt-4 rounded-xl border border-black/[0.06] bg-[#FAF9F7] px-3 py-2.5 text-[8px] leading-4 text-[#817D76]"><div className="flex items-start gap-2"><UserRoundCheck size={10} className="mt-0.5 shrink-0 text-[#9A744B]" /><span>Review uses the existing accounting work-program lifecycle and canonical staff assignments. Starting a review keeps the same workpaper selected; only completed or returned decisions advance the queue.</span></div></div>
    </section>
  );
}
