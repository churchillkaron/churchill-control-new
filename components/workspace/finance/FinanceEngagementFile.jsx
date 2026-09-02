"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileCheck2,
  FileText,
  FolderOpen,
  History,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  X,
} from "lucide-react";

function label(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function date(value) {
  return value ? String(value).slice(0, 10) : "—";
}

function hours(minutes) {
  return `${Math.round((Number(minutes || 0) / 60) * 10) / 10}h`;
}

function itemTone(status) {
  const value = String(status || "").toUpperCase();
  if (["COMPLETE", "ACCEPTED", "CLEARED", "LOCKED"].includes(value)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (["BLOCKED", "CHANGES_REQUESTED"].includes(value)) return "border-red-700/15 bg-red-50 text-red-800";
  if (["READY_FOR_REVIEW", "SUBMITTED", "REVIEWED"].includes(value)) return "border-amber-700/15 bg-amber-50 text-amber-800";
  return "border-black/[0.08] bg-[#F7F6F3] text-[#716B63]";
}

function Metric({ title, value, detail, warning = false }) {
  return (
    <div className="rounded-xl border border-black/[0.07] bg-white px-3.5 py-3">
      <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#8C877F]">{title}</div>
      <div className={`mt-2 text-[22px] font-semibold tracking-[-0.035em] ${warning ? "text-[#9A533D]" : "text-[#2A2723]"}`}>{value}</div>
      <div className="mt-0.5 text-[9px] text-[#99938A]">{detail}</div>
    </div>
  );
}

function StaffCard({ title, person }) {
  const capacity = person?.capacity;
  return (
    <div className="rounded-xl border border-black/[0.07] bg-white p-3">
      <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#8C877F]">{title}</div>
      <div className="mt-2 text-[12px] font-semibold text-[#37342F]">{person?.name || "Unassigned"}</div>
      <div className="mt-1 text-[9px] text-[#908B83]">{capacity ? `${hours(capacity.weekly_capacity_minutes)} weekly · ${Math.round(Number(capacity.utilization_target || 0) * 100)}% target` : "No capacity profile"}</div>
    </div>
  );
}

function ReviewTruthPanel({ portfolio, run }) {
  if (!run) {
    return (
      <section className="rounded-2xl border border-black/[0.07] bg-white p-4">
        <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.14em] text-[#8A633C]"><ShieldCheck size={11} /> Engagement review truth</div>
        <div className="mt-3 text-[10px] text-[#918B83]">Create an accounting cycle before engagement-wide review clearance can be evaluated.</div>
      </section>
    );
  }

  const total = Number(portfolio?.review_item_count || 0);
  const reviewed = Number(portfolio?.reviewed_record_count || 0);
  const cleared = Number(portfolio?.cleared_record_count || 0);
  const openPoints = Number(portfolio?.unresolved_note_count || 0);
  const blockers = Array.isArray(portfolio?.blockers) ? portfolio.blockers : [];
  const stages = Array.isArray(portfolio?.stages) ? portfolio.stages : [];
  const signoffs = portfolio?.signoff_counts || {};
  const fullyCleared = portfolio?.fully_cleared === true;

  return (
    <section className={`rounded-2xl border p-4 ${fullyCleared ? "border-emerald-700/15 bg-emerald-50/55" : "border-amber-700/15 bg-[#FFF9EF]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.14em] text-[#8A633C]"><ShieldCheck size={11} /> Engagement review truth</div>
          <div className="mt-1.5 text-[15px] font-semibold text-[#312D28]">{fullyCleared ? "Review fully cleared" : portfolio?.current_stage_label || "Review clearance pending"}</div>
          <div className="mt-1 text-[9px] text-[#817A71]">Same organization · legal entity · accounting period gate used by lifecycle completion.</div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] ${fullyCleared ? "border-emerald-700/15 bg-white text-emerald-800" : "border-amber-700/15 bg-white text-amber-800"}`}>
          {fullyCleared ? <CheckCircle2 size={11} /> : <CircleDot size={11} />}
          {fullyCleared ? "Cleared" : label(portfolio?.current_stage || "Pending")}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <Metric title="Review records" value={total} detail="In scoped engagement" />
        <Metric title="Reviewed" value={`${reviewed}/${total}`} detail="Reviewer-level status" warning={total > 0 && reviewed < total} />
        <Metric title="Cleared" value={`${cleared}/${total}`} detail="Partner-level status" warning={total > 0 && cleared < total} />
        <Metric title="Open points" value={openPoints} detail="Must clear before final" warning={openPoints > 0} />
        <Metric title="Preparer" value={`${Number(signoffs.PREPARER || 0)}/${total}`} detail="Active sign-offs" warning={total > 0 && Number(signoffs.PREPARER || 0) < total} />
        <Metric title="Reviewer" value={`${Number(signoffs.REVIEWER || 0)}/${total}`} detail="Active sign-offs" warning={total > 0 && Number(signoffs.REVIEWER || 0) < total} />
        <Metric title="Partner" value={`${Number(signoffs.PARTNER || 0)}/${total}`} detail="Active sign-offs" warning={total > 0 && Number(signoffs.PARTNER || 0) < total} />
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {stages.map((stage) => (
          <div key={stage.stage} className={`rounded-xl border p-3 ${stage.satisfied ? "border-emerald-700/10 bg-white/80" : "border-black/[0.07] bg-white"}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[9px] font-semibold text-[#48433D]">{stage.label}</div>
              {stage.satisfied ? <BadgeCheck size={12} className="text-emerald-700" /> : <CircleDot size={12} className="text-amber-700" />}
            </div>
            <div className="mt-1 text-[8px] text-[#908A82]">{stage.satisfied_review_items || 0}/{stage.review_item_count || 0} records satisfy this stage</div>
            <div className="mt-1 text-[8px] text-[#908A82]">Requires {(stage.required_roles || []).map(label).join(" + ") || "No sign-off"}</div>
          </div>
        ))}
      </div>

      {blockers.length ? (
        <div className="mt-3 rounded-xl border border-red-700/10 bg-white p-3">
          <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#965640]"><AlertTriangle size={11} /> What blocks clearance now</div>
          <div className="mt-2 grid gap-1.5 md:grid-cols-2">
            {blockers.slice(0, 8).map((blocker, index) => (
              <div key={`${blocker.code || "blocker"}-${blocker.review_item_id || index}`} className="rounded-lg bg-red-50/70 px-2.5 py-2 text-[9px] text-red-800">
                <div className="font-medium">{blocker.record_label || blocker.message}</div>
                {blocker.record_label ? <div className="mt-0.5 text-[8px] text-red-700/80">{blocker.message}</div> : null}
              </div>
            ))}
          </div>
          {blockers.length > 8 ? <div className="mt-2 text-[8px] text-[#908A82]">+ {blockers.length - 8} additional blocker{blockers.length - 8 === 1 ? "" : "s"}</div> : null}
        </div>
      ) : null}
    </section>
  );
}

function WorkItemRow({ item }) {
  const gate = item.metadata?.system_gate;
  const reviewGate = item.metadata?.engagement_review_gate;
  const reviewNotes = item.review?.notes || [];
  const unresolved = reviewNotes.filter((note) => note.status !== "RESOLVED").length;
  return (
    <div className="grid grid-cols-[36px_minmax(250px,1.7fr)_120px_110px_95px_120px_105px] items-center gap-3 border-b border-black/[0.05] px-3 py-3 text-[10px] last:border-0">
      <div className="text-[#99938A]">{item.sequence_no}</div>
      <div className="min-w-0">
        <div className="truncate font-semibold text-[#37342F]">{item.title}</div>
        <div className="mt-0.5 truncate text-[9px] text-[#918B83]">{item.description || label(item.work_type)}</div>
        {item.blocked_reason ? <div className="mt-1 truncate text-[9px] text-[#9A533D]">{item.blocked_reason}</div> : null}
      </div>
      <div className="text-[#66615A]">{label(item.required_role)}</div>
      <div><span className={`inline-flex rounded-full border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] ${itemTone(item.status)}`}>{label(item.status)}</span></div>
      <div className="tabular-nums text-[#5E5952]">{hours(item.budget_minutes)}</div>
      <div className="text-[#5E5952]">{date(item.due_at)}</div>
      <div className="flex items-center gap-1.5">
        {reviewGate?.applicable === true ? (
          reviewGate.satisfied === true ? <span className="inline-flex items-center gap-1 text-emerald-700"><BadgeCheck size={11} /> Review</span> : <span className="inline-flex items-center gap-1 text-red-700"><AlertTriangle size={11} /> Review</span>
        ) : gate?.applicable === true ? (
          gate.satisfied === true ? <span className="inline-flex items-center gap-1 text-emerald-700"><BadgeCheck size={11} /> Verified</span> : <span className="inline-flex items-center gap-1 text-red-700"><AlertTriangle size={11} /> Blocked</span>
        ) : <span className="text-[#99938A]">Evidence</span>}
        {unresolved > 0 ? <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[8px] font-semibold text-red-700">{unresolved}</span> : null}
      </div>
    </div>
  );
}

function RunPanel({ run, open, onToggle }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[#37342F]">{run.template?.name || run.run_key || "Accounting work program"}</span>
            <span className={`rounded-full border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] ${itemTone(run.status)}`}>{label(run.status)}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-[#918B83]">
            <span>{run.period?.period_name || run.run_key}</span>
            <span>{run.progress?.percent || 0}% complete</span>
            <span>{hours(run.progress?.budget_minutes)} budget</span>
            <span>Due {date(run.due_at)}</span>
          </div>
        </div>
        {open ? <ChevronDown size={15} className="shrink-0 text-[#8C877F]" /> : <ChevronRight size={15} className="shrink-0 text-[#8C877F]" />}
      </button>
      {open ? (
        <div className="border-t border-black/[0.06]">
          <div className="grid grid-cols-[36px_minmax(250px,1.7fr)_120px_110px_95px_120px_105px] gap-3 border-b border-black/[0.06] bg-[#FAF9F7] px-3 py-2 text-[8px] font-medium uppercase tracking-[0.11em] text-[#8A867F]">
            <span>#</span><span>Procedure</span><span>Owner</span><span>Status</span><span>Budget</span><span>Due</span><span>Evidence</span>
          </div>
          <div className="min-w-[900px] overflow-x-auto">
            {(run.work_items || []).map((item) => <WorkItemRow key={item.id} item={item} />)}
            {!run.work_items?.length ? <div className="px-4 py-5 text-[10px] text-[#908B83]">No work items exist for this run.</div> : null}
          </div>
          {(run.client_requests || []).length ? (
            <div className="border-t border-black/[0.06] bg-[#FCFBF9] p-3">
              <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A633C]"><UserRoundCheck size={11} /> Client evidence requests</div>
              <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {run.client_requests.map((request) => (
                  <div key={request.id} className="rounded-xl border border-black/[0.06] bg-white p-3">
                    <div className="flex items-start justify-between gap-2"><div className="text-[10px] font-semibold text-[#37342F]">{request.title}</div><span className={`rounded-full border px-1.5 py-0.5 text-[7px] font-semibold uppercase ${itemTone(request.status)}`}>{label(request.status)}</span></div>
                    <div className="mt-1 text-[9px] text-[#918B83]">Due {date(request.due_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function FinanceEngagementFile({ organizationId, engagementId, onClose }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [openRuns, setOpenRuns] = useState(new Set());

  async function load() {
    if (!organizationId || !engagementId) return;
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/workspace/finance/engagement-file", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("engagementId", engagementId);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load engagement file");
      setState({ loading: false, error: "", data: body });
      if (body.current_run?.id) setOpenRuns(new Set([body.current_run.id]));
    } catch (error) {
      setState({ loading: false, error: error?.message || "Unable to load engagement file", data: null });
    }
  }

  useEffect(() => { load(); }, [organizationId, engagementId]);

  const data = state.data;
  const engagement = data?.engagement;
  const currentRun = data?.current_run;
  const history = Array.isArray(data?.history) ? data.history : [];
  const documents = Array.isArray(data?.documents) ? data.documents : [];
  const externalReviews = Array.isArray(data?.external_reviews) ? data.external_reviews : [];
  const summary = data?.summary || {};
  const reviewPortfolio = data?.review_portfolio || null;
  const allRuns = useMemo(() => [currentRun, ...history].filter(Boolean), [currentRun, history]);

  function toggleRun(runId) {
    setOpenRuns((current) => {
      const next = new Set(current);
      if (next.has(runId)) next.delete(runId); else next.add(runId);
      return next;
    });
  }

  return (
    <div className="mt-4 overflow-hidden rounded-[24px] border border-[#A37849]/25 bg-[#F5F1EA] shadow-[0_14px_40px_rgba(52,42,28,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/[0.07] bg-white/80 p-5">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.16em] text-[#8A633C]"><FolderOpen size={12} /> Digital engagement file</div>
          <h3 className="mt-1.5 text-[21px] font-semibold tracking-[-0.025em] text-[#2A2723]">{engagement?.client?.name || "Client accounting file"}</h3>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#7E786F]">
            <span>{engagement?.service_package || "Accounting engagement"}</span>
            <span>{engagement?.entity?.display_name || engagement?.entity?.legal_name || "Legal entity not configured"}</span>
            <span>{engagement?.entity?.currency || "—"}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} disabled={state.loading} className="inline-flex h-9 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 text-[9px] font-medium text-[#625D56]"><RefreshCw size={11} className={state.loading ? "animate-spin" : ""} /> Refresh file</button>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.08] bg-white text-[#625D56]"><X size={13} /></button>
        </div>
      </div>

      {state.loading && !data ? <div className="flex min-h-[220px] items-center justify-center text-[11px] text-[#756F67]"><LoaderCircle size={16} className="mr-2 animate-spin" /> Loading engagement file…</div> : null}
      {state.error ? <div className="m-4 flex items-start gap-2 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[10px] text-red-800"><AlertTriangle size={13} className="mt-0.5" />{state.error}</div> : null}

      {data ? (
        <div className="space-y-4 p-4 md:p-5">
          {engagement?.entity_required ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-700/15 bg-amber-50 p-3 text-[10px] text-amber-900"><AlertTriangle size={13} className="mt-0.5 shrink-0" /><div><div className="font-semibold">Legal entity required</div><div className="mt-0.5">This engagement cannot start entity-scoped accounting work until a real legal entity is configured for the client.</div></div></div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            <Metric title="Progress" value={`${summary.current_progress || 0}%`} detail="Current work program" />
            <Metric title="Budget" value={hours(summary.current_budget_minutes)} detail="Current cycle" />
            <Metric title="Review points" value={reviewPortfolio?.unresolved_note_count ?? summary.open_review_points ?? 0} detail="Current scoped findings" warning={Number(reviewPortfolio?.unresolved_note_count ?? summary.open_review_points ?? 0) > 0} />
            <Metric title="System blockers" value={summary.system_blockers || 0} detail="ERP truth gates" warning={(summary.system_blockers || 0) > 0} />
            <Metric title="Overdue work" value={summary.overdue_work || 0} detail="Procedures past due" warning={(summary.overdue_work || 0) > 0} />
            <Metric title="Client overdue" value={summary.overdue_client_requests || 0} detail="Evidence requests" warning={(summary.overdue_client_requests || 0) > 0} />
            <Metric title="Documents" value={summary.documents || 0} detail="Finance evidence" />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <StaffCard title="Preparer" person={data.staff?.preparer} />
            <StaffCard title="Reviewer" person={data.staff?.reviewer} />
            <StaffCard title="Partner" person={data.staff?.partner} />
          </div>

          <ReviewTruthPanel portfolio={reviewPortfolio} run={currentRun} />

          <section>
            <div className="mb-2 flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.14em] text-[#8A633C]"><FileCheck2 size={11} /> Work program & workpapers</div>
            <div className="space-y-2">
              {allRuns.map((run) => <RunPanel key={run.id} run={run} open={openRuns.has(run.id)} onToggle={() => toggleRun(run.id)} />)}
              {!allRuns.length ? <div className="rounded-xl border border-dashed border-black/[0.1] bg-white/60 p-5 text-[10px] text-[#8A867F]">No work program has been created yet.</div> : null}
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-2xl border border-black/[0.07] bg-white p-4">
              <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.14em] text-[#8A633C]"><FileText size={11} /> Evidence documents</div>
              <div className="mt-3 divide-y divide-black/[0.05]">
                {documents.slice(0, 20).map((document) => (
                  <a key={document.id} href={document.file_url || "#"} target={document.file_url ? "_blank" : undefined} rel="noreferrer" className="flex items-center justify-between gap-3 py-2.5 text-[10px]">
                    <div className="min-w-0"><div className="truncate font-medium text-[#403C37]">{document.file_name}</div><div className="mt-0.5 text-[8px] text-[#99938A]">{label(document.destination_module || document.ai_module)} · {date(document.created_at)}</div></div>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[7px] uppercase ${itemTone(document.status)}`}>{label(document.status)}</span>
                  </a>
                ))}
                {!documents.length ? <div className="py-4 text-[10px] text-[#918B83]">No accounting evidence documents are linked to this client yet.</div> : null}
              </div>
            </section>

            <section className="rounded-2xl border border-black/[0.07] bg-white p-4">
              <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.14em] text-[#8A633C]"><MessageSquareText size={11} /> Review file</div>
              <div className="mt-3 divide-y divide-black/[0.05]">
                {externalReviews.slice(0, 20).map((review) => {
                  const unresolved = (review.notes || []).filter((note) => note.status !== "RESOLVED").length;
                  const activeSignoffs = (review.signoffs || []).filter((signoff) => !signoff.revoked_at);
                  return (
                    <div key={review.id} className="py-2.5 text-[10px]">
                      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-medium text-[#403C37]">{review.record_label || review.record_key}</div><div className="mt-0.5 text-[8px] text-[#99938A]">{label(review.capability_id)} · {activeSignoffs.map((row) => label(row.signoff_role)).join(" / ") || "No signoff"}</div></div><span className={`rounded-full border px-1.5 py-0.5 text-[7px] uppercase ${itemTone(review.status)}`}>{label(review.status)}</span></div>
                      {unresolved > 0 ? <div className="mt-1 text-[8px] font-medium text-red-700">{unresolved} unresolved review point{unresolved === 1 ? "" : "s"}</div> : null}
                    </div>
                  );
                })}
                {!externalReviews.length ? <div className="py-4 text-[10px] text-[#918B83]">No additional record-level reviews exist outside the current work program.</div> : null}
              </div>
            </section>
          </div>

          {history.length ? (
            <section className="rounded-2xl border border-black/[0.07] bg-white p-4">
              <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.14em] text-[#8A633C]"><History size={11} /> Prior periods</div>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {history.slice(0, 8).map((run) => (
                  <button type="button" key={run.id} onClick={() => toggleRun(run.id)} className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-3 text-left">
                    <div className="flex items-start justify-between gap-2"><div className="text-[10px] font-semibold text-[#403C37]">{run.period?.period_name || run.run_key}</div><span className="text-[8px] text-[#8A867F]">{run.progress?.percent || 0}%</span></div>
                    <div className="mt-1 text-[8px] text-[#99938A]">{label(run.status)} · {date(run.completed_at || run.due_at)}</div>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
