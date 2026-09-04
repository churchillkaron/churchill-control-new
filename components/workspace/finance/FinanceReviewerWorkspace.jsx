"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";

import FinanceEngagementFile from "@/components/workspace/finance/FinanceEngagementFile";
import FinanceReviewerEvidencePanel from "@/components/workspace/finance/FinanceReviewerEvidencePanel";

const FILTERS = [
  { id: "MY", label: "My review" },
  { id: "DECISION", label: "Decision lane" },
  { id: "PREFLIGHT", label: "Live preflight" },
  { id: "OVERDUE", label: "Overdue" },
  { id: "PARTNER", label: "Partner" },
  { id: "BLOCKED", label: "Blocked" },
  { id: "RETURNED", label: "Returned" },
  { id: "ALL", label: "All" },
];

const DECISION_STAGES = new Set([
  "VERIFIED_HANDOFF",
  "LIVE_PREFLIGHT_REQUIRED",
  "PARTNER_CLEARANCE",
  "REVIEWER_PROCEDURE",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function label(value) {
  return clean(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function shortDate(value) {
  return value ? String(value).slice(0, 10) : "—";
}

function hours(minutes) {
  return `${Math.round((Number(minutes || 0) / 60) * 10) / 10}h`;
}

function stageTone(stage) {
  const value = clean(stage).toUpperCase();
  if (["BLOCKED", "RETURNED"].includes(value)) return "border-red-700/15 bg-red-50 text-red-800";
  if (["LIVE_PREFLIGHT_REQUIRED", "PARTNER_CLEARANCE", "REVIEWER_PROCEDURE", "WAITING_ON_CLIENT", "INSPECT"].includes(value)) {
    return "border-amber-700/15 bg-amber-50 text-amber-800";
  }
  if (value === "VERIFIED_HANDOFF") return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  return "border-black/[0.08] bg-[#F7F6F3] text-[#716B63]";
}

function stageCopy(row) {
  const stage = clean(row?.stage).toUpperCase();
  if (stage === "VERIFIED_HANDOFF") {
    return {
      title: "Verified handoff",
      detail: "The stored handoff passed the reviewer controls when prepared. Final approval still reruns live governed evidence preflight.",
      action: "Run live preflight & approve",
    };
  }
  if (stage === "LIVE_PREFLIGHT_REQUIRED") {
    return {
      title: "Live preflight required",
      detail: "The queue can rank this workpaper, but it cannot authorize the decision. Current evidence and review controls must be rebuilt before sign-off.",
      action: "Run live preflight & approve",
    };
  }
  if (stage === "PARTNER_CLEARANCE") {
    return {
      title: "Partner clearance",
      detail: "Reviewer work has reached the partner lane. The final partner action is governed and revalidated on the server.",
      action: clean(row?.status).toUpperCase() === "IN_PROGRESS" ? "Run live clearance & complete" : "Start partner clearance",
    };
  }
  if (stage === "REVIEWER_PROCEDURE") {
    return {
      title: "Reviewer procedure",
      detail: "A governed reviewer procedure is ready. Complete the judgment only after the evidence cockpit has been inspected.",
      action: clean(row?.status).toUpperCase() === "IN_PROGRESS" ? "Complete reviewer procedure" : "Start reviewer procedure",
    };
  }
  if (stage === "WAITING_ON_CLIENT") {
    return {
      title: "Waiting on client",
      detail: "Client evidence is still an open dependency. Keep the review visible, but do not treat it as decision-ready.",
      action: "Follow client dependency",
    };
  }
  if (stage === "RETURNED") {
    return {
      title: "Returned to preparer",
      detail: "Changes were requested. Ownership has moved back to preparation until the workpaper is resubmitted.",
      action: "Await preparer correction",
    };
  }
  if (stage === "BLOCKED") {
    return {
      title: "Accounting blocker",
      detail: clean(row?.blocked_reason) || "A deterministic accounting control is blocking the review path.",
      action: "Resolve blocker",
    };
  }
  return {
    title: "Inspect workpaper",
    detail: "Inspect evidence, conclusion and ownership before taking the next governed action.",
    action: row?.next_action || "Inspect workpaper",
  };
}

function Metric({ title, value, detail, warning = false, accent = false }) {
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${accent ? "border-[#A37849]/18 bg-[#FFF9F0]" : "border-black/[0.07] bg-white"}`}>
      <div className="text-[8px] font-medium uppercase tracking-[0.13em] text-[#8C877F]">{title}</div>
      <div className={`mt-1.5 text-[20px] font-semibold tracking-[-0.03em] ${warning && Number(value) > 0 ? "text-[#9A533D]" : "text-[#2A2723]"}`}>{value}</div>
      <div className="mt-0.5 text-[8px] text-[#99938A]">{detail}</div>
    </div>
  );
}

function IntegrityChip({ children, good = false }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[7px] font-semibold ${good ? "border-emerald-700/12 bg-emerald-50 text-emerald-800" : "border-[#A37849]/15 bg-white text-[#76583A]"}`}>
      <CircleDot size={7} /> {children}
    </span>
  );
}

export default function FinanceReviewerWorkspace({ organizationId }) {
  const [state, setState] = useState({ loading: true, error: "", tower: null });
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
      const url = new URL("/api/workspace/finance/reviewer-control-tower", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load reviewer control tower");
      setState({ loading: false, error: "", tower: body });
      if (!preserveSelection) setSelectedId(null);
      return body;
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || "Unable to load reviewer control tower" }));
      return null;
    }
  }

  useEffect(() => { load({ preserveSelection: false }); }, [organizationId]);

  const tower = state.tower || {};
  const viewer = tower.viewer || {};
  const viewerId = viewer.staff_account_id || null;
  const queue = Array.isArray(tower.queue) ? tower.queue : [];
  const summary = tower.summary || {};
  const capacity = Array.isArray(tower.capacity) ? tower.capacity : [];
  const integrity = tower.integrity || {};

  const visibleQueue = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return queue.filter((row) => {
      const stage = clean(row.stage).toUpperCase();
      if (filter === "MY" && (!viewerId || row.owner_id !== viewerId)) return false;
      if (filter === "DECISION" && !DECISION_STAGES.has(stage)) return false;
      if (filter === "PREFLIGHT" && stage !== "LIVE_PREFLIGHT_REQUIRED") return false;
      if (filter === "OVERDUE" && row.overdue !== true) return false;
      if (filter === "PARTNER" && stage !== "PARTNER_CLEARANCE") return false;
      if (filter === "BLOCKED" && stage !== "BLOCKED") return false;
      if (filter === "RETURNED" && stage !== "RETURNED") return false;
      if (!needle) return true;
      return [
        row.client_name,
        row.title,
        row.owner_name,
        row.assigned_accountant,
        row.assigned_reviewer,
        row.assigned_partner,
        row.conclusion,
        row.next_action,
        row.blocked_reason,
        label(stage),
      ].filter(Boolean).join(" ").toLowerCase().includes(needle);
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
  const selectedStage = selected ? stageCopy(selected) : null;

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
        const detail = Array.isArray(body?.details)
          ? body.details.map((item) => item?.title || item?.record_label || item?.message || item?.blocker || item?.status).filter(Boolean).join("; ")
          : "";
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

  async function governedSignoffAndComplete(row, signoffRole) {
    if (!row?.id || !row?.run_id || busy) return;
    try {
      setBusy(`signoff:${signoffRole}`);
      setActionError("");
      const nextId = visibleQueue[selectedIndex + 1]?.id || visibleQueue[selectedIndex - 1]?.id || null;

      const signoffResponse = await fetch("/api/workspace/finance/work-programs/review-signoff", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, runId: row.run_id, workItemId: row.id, signoffRole }),
      });
      const signoffBody = await signoffResponse.json().catch(() => ({}));
      if (!signoffResponse.ok || signoffBody?.success === false) {
        const detail = Array.isArray(signoffBody?.details)
          ? signoffBody.details.map((item) => item?.record_label || item?.reason || item?.message || item?.blocker).filter(Boolean).join("; ")
          : "";
        throw new Error([signoffBody?.error || "Live governed preflight blocked sign-off", detail].filter(Boolean).join(": "));
      }

      const lifecycleResponse = await fetch("/api/workspace/finance/work-programs/lifecycle", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          action: "complete_item",
          runId: row.run_id,
          workItemId: row.id,
          conclusion: row.conclusion || null,
          evidence: row.evidence || undefined,
          readyForReview: false,
        }),
      });
      const lifecycleBody = await lifecycleResponse.json().catch(() => ({}));
      if (!lifecycleResponse.ok || lifecycleBody?.success === false) {
        const detail = Array.isArray(lifecycleBody?.details)
          ? lifecycleBody.details.map((item) => item?.title || item?.record_label || item?.message || item?.blocker || item?.status).filter(Boolean).join("; ")
          : "";
        throw new Error([lifecycleBody?.error || "Unable to complete governed review work", detail].filter(Boolean).join(": "));
      }

      await load({ preserveSelection: true });
      setSelectedId(nextId);
      setChangeReason("");
    } catch (error) {
      setActionError(error?.message || "Unable to complete governed review decision");
    } finally {
      setBusy("");
    }
  }

  async function approve(row) {
    const status = clean(row?.status).toUpperCase();
    const role = clean(row?.required_role).toUpperCase();
    if (status === "CHANGES_REQUESTED" || status === "WAITING_ON_CLIENT" || row?.stage === "BLOCKED") return;
    if (["READY", "NOT_STARTED"].includes(status)) {
      await lifecycle(row, "start_item");
      return;
    }
    if (status === "READY_FOR_REVIEW") {
      await governedSignoffAndComplete(row, "REVIEWER");
      return;
    }
    if (role === "PARTNER" && status === "IN_PROGRESS") {
      await governedSignoffAndComplete(row, "PARTNER");
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
    if (!next) return;
    setSelectedId(next.id);
    setActionError("");
    setChangeReason("");
  }

  if (showClientFile && selected?.engagement_id) {
    return (
      <section className="rounded-[24px] border border-[#A37849]/15 bg-[#FBF8F3] p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-black/[0.06] pb-3">
          <button type="button" onClick={() => setShowClientFile(false)} className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-[#76583A]"><ChevronLeft size={11} /> Back to review</button>
          <div className="text-[8px] text-[#99938A]">Full governed client file</div>
        </div>
        <FinanceEngagementFile organizationId={organizationId} engagementId={selected.engagement_id} onClose={() => setShowClientFile(false)} />
      </section>
    );
  }

  return (
    <section className="rounded-[24px] border border-[#A37849]/15 bg-[#FBF8F3] p-4 md:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.16em] text-[#8A633C]"><ShieldCheck size={12} /> Finance Review Control Tower</div>
          <h2 className="mt-1.5 text-[21px] font-semibold tracking-[-0.03em] text-[#2A2723]">One queue. One truth. Live authority at the decision.</h2>
          <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[#756F67]">The server ranks the full accounting-firm review population. The queue tells reviewers what deserves attention next; it never substitutes for the live governed evidence preflight that authorizes sign-off.</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <IntegrityChip good={integrity.complete === true}>{integrity.complete === true ? "Complete population" : "Population not proven"}</IntegrityChip>
            <IntegrityChip>Server-ranked queue</IntegrityChip>
            <IntegrityChip>Live sign-off authority</IntegrityChip>
            {tower.generated_at ? <span className="ml-1 text-[7px] text-[#A09A92]">Generated {new Date(tower.generated_at).toLocaleString()}</span> : null}
          </div>
          <div className="mt-2 text-[8px] text-[#99938A]">Signed in as <span className="font-semibold text-[#615B54]">{viewer.name || "Accounting team member"}</span>{viewer.role ? ` · ${label(viewer.role)}` : ""}</div>
        </div>
        <button type="button" onClick={() => load({ preserveSelection: true })} disabled={state.loading} className="inline-flex h-9 items-center gap-2 self-start rounded-xl border border-[#A37849]/20 bg-white px-3 text-[9px] font-semibold text-[#76583A] disabled:opacity-50 xl:self-auto"><RefreshCw size={11} className={state.loading ? "animate-spin" : ""} /> Refresh tower</button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Metric title="My review" value={summary.my_review || 0} detail="Owned by you" accent />
        <Metric title="Verified handoffs" value={summary.verified_handoffs || 0} detail="Stored handoff passed" />
        <Metric title="Live preflight" value={summary.live_preflight_required || 0} detail="Must rebuild evidence" warning />
        <Metric title="Partner" value={summary.partner_clearance || 0} detail="Final clearance lane" />
        <Metric title="Overdue" value={summary.overdue || 0} detail="Past due date" warning />
        <Metric title="Blocked" value={summary.blocked || 0} detail="Accounting control stop" warning />
      </div>

      {capacity.length ? (
        <div className="mt-3 rounded-xl border border-black/[0.06] bg-white px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.11em] text-[#8A867F]"><UsersRound size={9} /> Review load</div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5">
            {capacity.slice(0, 8).map((owner) => (
              <div key={owner.staff_account_id || "UNASSIGNED"} className="min-w-[150px] rounded-lg border border-black/[0.06] bg-[#FAF9F7] px-2.5 py-2">
                <div className="truncate text-[8px] font-semibold text-[#4A4640]">{owner.name}</div>
                <div className="mt-1 flex gap-2 text-[7px] text-[#918B83]"><span>{owner.items} items</span><span>{owner.hours} planned</span>{owner.overdue ? <span className="font-semibold text-[#9A533D]">{owner.overdue} overdue</span> : null}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`h-8 shrink-0 rounded-lg border px-2.5 text-[8px] font-semibold uppercase tracking-[0.08em] ${filter === item.id ? "border-[#A37849]/25 bg-[#A37849]/[0.08] text-[#76583A]" : "border-black/[0.07] bg-white text-[#817D76]"}`}>{item.label}</button>
          ))}
        </div>
        <label className="flex h-9 w-full items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 xl:w-[360px]"><Search size={12} className="text-[#A29D95]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client, workpaper, owner or next action" className="min-w-0 flex-1 bg-transparent text-[10px] text-[#403C37] outline-none placeholder:text-[#B2ADA5]" /></label>
      </div>

      {state.error ? <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[9px] text-red-800">{state.error}</div> : null}
      {state.loading && !tower.queue ? <div className="flex min-h-[220px] items-center justify-center text-[10px] text-[#817D76]"><LoaderCircle size={14} className="mr-2 animate-spin text-[#A37849]" /> Building complete reviewer control tower…</div> : null}

      {(!state.loading || tower.queue) ? (
        visibleQueue.length ? (
          <div className="mt-4 grid min-h-[590px] gap-4 xl:grid-cols-[minmax(410px,0.76fr)_minmax(600px,1.24fr)]">
            <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] bg-[#FAF9F7] px-4 py-2.5"><span className="text-[8px] font-medium uppercase tracking-[0.11em] text-[#8A867F]">{visibleQueue.length} item{visibleQueue.length === 1 ? "" : "s"}</span><span className="text-[7px] text-[#A29C93]">Server rank · owner · stage · urgency</span></div>
              <div className="max-h-[790px] overflow-y-auto">
                {visibleQueue.map((row, index) => {
                  const active = row.id === selected?.id;
                  const copy = stageCopy(row);
                  const mine = viewerId && row.owner_id === viewerId;
                  return (
                    <button key={row.id} type="button" onClick={() => { setSelectedId(row.id); setActionError(""); setChangeReason(""); }} className={`w-full border-b border-black/[0.05] px-4 py-3 text-left last:border-0 ${active ? "bg-[#FFF8EE]" : "hover:bg-[#FCFBF9]"}`}>
                      <div className="flex items-start gap-3">
                        <div className="pt-0.5 text-[7px] font-semibold tabular-nums text-[#B2ABA1]">{String(index + 1).padStart(2, "0")}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0"><div className="flex items-center gap-1.5"><div className="truncate text-[10px] font-semibold text-[#37342F]">{row.client_name}</div>{mine ? <span className="rounded border border-[#A37849]/15 bg-[#A37849]/[0.06] px-1 py-0.5 text-[6px] font-semibold uppercase text-[#76583A]">Mine</span> : null}</div><div className="mt-0.5 truncate text-[9px] font-medium text-[#5E5952]">{row.title}</div></div>
                            <span className={`shrink-0 rounded-full border px-2 py-1 text-[6px] font-semibold uppercase tracking-[0.06em] ${stageTone(row.stage)}`}>{copy.title}</span>
                          </div>
                          <div className="mt-2 text-[8px] font-semibold text-[#6E5237]">{row.next_action || copy.action}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[7px] text-[#99938A]"><span className={row.overdue ? "font-semibold text-[#9A533D]" : ""}>Due {shortDate(row.due_at)}</span><span>{row.owner_name || "Unassigned"}</span><span>{hours(row.budget_minutes)} planned</span>{row.client_dependency?.open ? <span className="text-[#8A633C]">{row.client_dependency.open} client dependency</span> : null}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {selected ? (
              <div className="rounded-2xl border border-black/[0.07] bg-white">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/[0.06] px-4 py-3.5">
                  <div className="min-w-0"><div className="text-[8px] font-medium uppercase tracking-[0.13em] text-[#8A633C]">Governed decision workpaper</div><div className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[#312D28]">{selected.title}</div><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] text-[#918B83]"><span>{selected.client_name}</span><span>{label(selected.required_role)}</span><span>Due {shortDate(selected.due_at)}</span>{selected.owner_id === viewerId ? <span className="font-semibold text-[#76583A]">Assigned to you</span> : selected.owner_name ? <span>{selected.owner_name}</span> : null}</div></div>
                  <div className="flex items-center gap-1"><button type="button" onClick={() => move(-1)} disabled={selectedIndex <= 0} className="h-8 w-8 rounded-lg border border-black/[0.07] text-[#716B63] disabled:opacity-30"><ChevronLeft size={12} className="mx-auto" /></button><button type="button" onClick={() => move(1)} disabled={selectedIndex >= visibleQueue.length - 1} className="h-8 w-8 rounded-lg border border-black/[0.07] text-[#716B63] disabled:opacity-30"><ChevronRight size={12} className="mx-auto" /></button></div>
                </div>

                <div className="p-4">
                  <div className={`rounded-xl border p-3 ${selected.stage === "BLOCKED" || selected.stage === "RETURNED" ? "border-red-700/12 bg-red-50" : selected.stage === "VERIFIED_HANDOFF" ? "border-emerald-700/10 bg-emerald-50/45" : "border-amber-700/10 bg-amber-50/45"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[7px] font-semibold uppercase tracking-[0.11em] text-[#8A867F]">Current server stage</div><div className="mt-1 text-[13px] font-semibold text-[#403A34]">{selectedStage.title}</div><div className="mt-1 max-w-2xl text-[8px] leading-4 text-[#776F66]">{selectedStage.detail}</div></div><span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.06em] ${stageTone(selected.stage)}`}>{label(selected.stage)}</span></div>
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-5">
                    <div className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-3"><div className="text-[7px] uppercase tracking-[0.1em] text-[#918B83]">Queue authority</div><div className="mt-1.5 text-[8px] font-semibold text-[#76583A]">Navigation only</div></div>
                    <div className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-3"><div className="text-[7px] uppercase tracking-[0.1em] text-[#918B83]">Final authority</div><div className="mt-1.5 text-[8px] font-semibold text-[#556B51]">Live preflight</div></div>
                    <div className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-3"><div className="text-[7px] uppercase tracking-[0.1em] text-[#918B83]">Prepared by</div><div className="mt-1.5 truncate text-[8px] font-semibold text-[#4A4640]">{selected.assigned_accountant || "Unassigned"}</div></div>
                    <div className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-3"><div className="text-[7px] uppercase tracking-[0.1em] text-[#918B83]">Client dependency</div><div className={`mt-1.5 text-[8px] font-semibold ${selected.client_dependency?.open ? "text-[#9A7045]" : "text-[#556B51]"}`}>{selected.client_dependency?.open || 0} open</div></div>
                    <div className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-3"><div className="text-[7px] uppercase tracking-[0.1em] text-[#918B83]">Budget</div><div className="mt-1.5 text-[8px] font-semibold text-[#4A4640]">{hours(selected.budget_minutes)}</div></div>
                  </div>

                  {selected.description ? <div className="mt-4 rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3"><div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#918B83]">Procedure performed</div><div className="mt-1.5 text-[9px] leading-4 text-[#625D56]">{selected.description}</div></div> : null}
                  {selected.conclusion ? <div className="mt-3 rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3"><div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#918B83]">Preparer conclusion</div><div className="mt-1.5 whitespace-pre-wrap text-[9px] leading-4 text-[#625D56]">{selected.conclusion}</div></div> : null}

                  <FinanceReviewerEvidencePanel organizationId={organizationId} row={selected} />

                  {selected.blocked_reason ? <div className="mt-3 rounded-xl border border-red-700/10 bg-red-50 p-3 text-[8px] text-red-800"><b>Work blocker:</b> {selected.blocked_reason}</div> : null}
                  {selected.client_dependency?.open ? <div className="mt-3 rounded-xl border border-amber-700/10 bg-amber-50/60 p-3 text-[8px] text-amber-900"><b>Client dependency:</b> {selected.client_dependency.open} open request{selected.client_dependency.open === 1 ? "" : "s"}{selected.client_dependency.overdue ? ` · ${selected.client_dependency.overdue} overdue` : ""}. Final authorization rechecks the current governed state.</div> : null}
                  {actionError ? <div className="mt-3 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[8px] text-red-800">{actionError}</div> : null}

                  <div className="mt-4 rounded-xl border border-[#A37849]/15 bg-[#FFFDF9] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#8A633C]">Governed action</div><div className="mt-1 max-w-2xl text-[8px] leading-4 text-[#918B83]">The server-ranked stage is never enough to approve. Reviewer identity, segregation of duties, open review points, sign-offs, evidence approvals, exact ledger population and current accounting truth are rebuilt at the decision boundary.</div></div><button type="button" onClick={() => setShowClientFile(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.07] bg-white px-2.5 text-[8px] font-semibold text-[#716B63]"><FolderOpen size={10} /> Full client file</button></div>

                    {clean(selected.status).toUpperCase() === "READY_FOR_REVIEW" ? (
                      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,1fr)_auto_auto]">
                        <input value={changeReason} onChange={(event) => setChangeReason(event.target.value)} placeholder="Reason if changes are required…" className="h-9 rounded-lg border border-black/[0.08] bg-white px-3 text-[9px] outline-none focus:border-[#A37849]/40" />
                        <button type="button" disabled={Boolean(busy) || !changeReason.trim()} onClick={() => lifecycle(selected, "request_changes", { reason: changeReason.trim() })} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-red-700/15 bg-red-50 px-3 text-[8px] font-semibold text-red-800 disabled:opacity-40"><AlertTriangle size={10} /> Request changes</button>
                        <button type="button" disabled={Boolean(busy) || selected.stage === "BLOCKED"} onClick={() => approve(selected)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#3F352A] px-4 text-[8px] font-semibold text-white disabled:opacity-40">{busy ? <LoaderCircle size={10} className="animate-spin" /> : <ShieldCheck size={10} />}{busy ? "Running live checks…" : "Run live preflight & approve"}</button>
                      </div>
                    ) : selected.stage === "RETURNED" ? (
                      <div className="mt-3 rounded-lg border border-black/[0.06] bg-[#FAF9F7] px-3 py-2.5 text-[8px] text-[#817D76]">Returned to preparation. It stays visible for control-tower awareness but offers no reviewer decision until resubmission.</div>
                    ) : selected.stage === "WAITING_ON_CLIENT" ? (
                      <div className="mt-3 rounded-lg border border-amber-700/10 bg-amber-50/50 px-3 py-2.5 text-[8px] text-amber-900">Client evidence is still outstanding. Open the client file to inspect the dependency rather than forcing a review decision.</div>
                    ) : selected.stage === "BLOCKED" ? (
                      <div className="mt-3 rounded-lg border border-red-700/10 bg-red-50 px-3 py-2.5 text-[8px] text-red-800">The accounting control path is blocked. Resolve the blocker before attempting completion.</div>
                    ) : (
                      <button type="button" disabled={Boolean(busy)} onClick={() => approve(selected)} className="mt-3 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#3F352A] px-4 text-[8px] font-semibold text-white disabled:opacity-40">{busy ? <LoaderCircle size={10} className="animate-spin" /> : clean(selected.status).toUpperCase() === "IN_PROGRESS" ? <CheckCircle2 size={10} /> : <ArrowRight size={10} />}{busy ? "Checking…" : selectedStage.action}</button>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-black/[0.07] bg-white px-5 py-10 text-center"><CheckCircle2 size={20} className="mx-auto text-[#6F7E68]" /><div className="mt-2 text-[11px] font-semibold text-[#3D3934]">Nothing needs attention in this lane</div><div className="mx-auto mt-1 max-w-xl text-[9px] leading-5 text-[#8B867E]">Choose another control-tower filter. The server keeps returned, blocked, client-dependent and decision work separate so reviewers can move quickly without losing accounting truth.</div></div>
        )
      ) : null}

      <div className="mt-4 rounded-xl border border-black/[0.06] bg-[#FAF9F7] px-3 py-2.5 text-[8px] leading-4 text-[#817D76]"><div className="flex items-start gap-2"><UserRoundCheck size={10} className="mt-0.5 shrink-0 text-[#9A744B]" /><span>Avantiqo separates prioritization from authorization: the control tower ranks complete server-side populations, while reviewer and partner actions remain governed by live identity, segregation-of-duties and evidence checks.</span></div></div>
    </section>
  );
}
