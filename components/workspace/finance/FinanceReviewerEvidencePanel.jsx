"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  FileCheck2,
  Link2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

function clean(value) {
  return String(value ?? "").trim();
}

function label(value) {
  return clean(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function shortDate(value) {
  return value ? String(value).slice(0, 10) : "—";
}

function money(value, currency) {
  const amount = Number(value || 0);
  try {
    return currency
      ? new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount)
      : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency || ""} ${amount.toLocaleString()}`.trim();
  }
}

function tone(value) {
  const state = clean(value).toUpperCase();
  if (["BLOCKED", "CHANGES_REQUESTED", "SYSTEM_BLOCKED"].includes(state)) return "border-red-700/15 bg-red-50 text-red-800";
  if (["READY_FOR_REVIEW", "READY", "IN_PROGRESS", "INSPECT"].includes(state)) return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (["VERIFIED", "REVIEWED", "CLEARED", "COMPLETE"].includes(state)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  return "border-black/[0.08] bg-[#F7F6F3] text-[#716B63]";
}

function Card({ title, icon: Icon, children }) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3">
      <div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#918B83]">
        <Icon size={9} /> {title}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default function FinanceReviewerEvidencePanel({ organizationId, row }) {
  const [state, setState] = useState({ loading: false, error: "", evidence: null });

  async function load() {
    if (!organizationId || !row?.id || !row?.run_id) {
      setState({ loading: false, error: "", evidence: null });
      return;
    }
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/workspace/finance/reviewer-evidence", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("runId", row.run_id);
      url.searchParams.set("workItemId", row.id);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load reviewer evidence");
      setState({ loading: false, error: "", evidence: body.evidence || null });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Unable to load reviewer evidence", evidence: null });
    }
  }

  useEffect(() => { load(); }, [organizationId, row?.id, row?.run_id]);

  if (!row) return null;
  if (state.loading && !state.evidence) {
    return <div className="mt-4 flex min-h-28 items-center justify-center rounded-xl border border-black/[0.06] bg-[#FCFBF9] text-[8px] text-[#817D76]"><LoaderCircle size={11} className="mr-2 animate-spin text-[#A37849]" /> Building the governed evidence chain…</div>;
  }
  if (state.error) {
    return <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[8px] text-red-800"><b>Evidence cockpit unavailable:</b> {state.error}</div>;
  }

  const evidence = state.evidence;
  if (!evidence) return null;
  const ledger = evidence.ledger_impact || {};
  const review = evidence.review_control || {};
  const system = evidence.system_verification || {};
  const activeEvidence = evidence.evidence || {};
  const currency = ledger.accounts?.find((account) => account.currency_code)?.currency_code || null;
  const completeness = ledger.population || {};
  const activeLinks = (activeEvidence.links || []).filter((link) => link.status === "ACTIVE");
  const decisionBlockers = [
    ...(system.blockers || []),
    ...(review.open_points > 0 ? [`${review.open_points} open review point${review.open_points === 1 ? "" : "s"}`] : []),
    ...(activeEvidence.approval_pending > 0 ? [`${activeEvidence.approval_pending} evidence document approval${activeEvidence.approval_pending === 1 ? "" : "s"} pending`] : []),
  ];

  return (
    <div className="mt-4 rounded-xl border border-[#A37849]/15 bg-[#FFFDF9] p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/[0.05] pb-3">
        <div>
          <div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#8A633C]"><ShieldCheck size={10} /> Evidence before judgment</div>
          <div className="mt-1 text-[8px] leading-4 text-[#817A72]">Source evidence, deterministic accounting impact, review points and sign-offs are compressed into this same decision workpaper.</div>
        </div>
        <button type="button" onClick={load} disabled={state.loading} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.07] bg-white px-2.5 text-[7px] font-semibold text-[#716B63] disabled:opacity-50"><RefreshCw size={9} className={state.loading ? "animate-spin" : ""} /> Refresh evidence</button>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <Card title="Source evidence" icon={FileCheck2}><div className="text-[12px] font-semibold text-[#45403A]">{activeEvidence.active_count || 0}</div><div className="mt-0.5 text-[7px] text-[#989188]">{activeEvidence.controlled_count || 0} controlled · {activeEvidence.approval_pending || 0} approval pending</div></Card>
        <Card title="Review points" icon={AlertTriangle}><div className={`text-[12px] font-semibold ${review.open_points ? "text-[#9A533D]" : "text-[#556B51]"}`}>{review.open_points || 0}</div><div className="mt-0.5 text-[7px] text-[#989188]">Unresolved reviewer questions</div></Card>
        <Card title="Sign-offs" icon={BadgeCheck}><div className="text-[12px] font-semibold text-[#45403A]">{review.active_signoffs?.length || 0}</div><div className="mt-0.5 text-[7px] text-[#989188]">Active governed sign-offs</div></Card>
        <Card title="Accounting population" icon={CheckCircle2}><div className={`inline-flex rounded-full border px-2 py-1 text-[7px] font-semibold uppercase ${tone(ledger.population_complete ? "VERIFIED" : "BLOCKED")}`}>{ledger.population_complete ? "Complete" : "Blocked"}</div><div className="mt-1 text-[7px] text-[#989188]">{completeness.linked_lines || 0} exact linked GL lines · {completeness.current_period_lines || 0} period lines read</div></Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card title="Preparer conclusion" icon={FileCheck2}><div className={`min-h-14 whitespace-pre-wrap text-[8px] leading-4 ${evidence.work_item?.conclusion ? "text-[#5A544D]" : "text-[#9A7045]"}`}>{evidence.work_item?.conclusion || "No preparer conclusion is recorded. Reviewer clearance must not rely on an inferred conclusion."}</div></Card>
        <Card title="Prior-period context" icon={RefreshCw}><div className="text-[8px] leading-4 text-[#5F5952]">{evidence.prior_work?.work_item ? <><div className="font-semibold">{evidence.prior_work.work_item.title}</div><div className="mt-1">Status: {label(evidence.prior_work.work_item.status)}</div><div>Conclusion: {evidence.prior_work.work_item.conclusion || "None recorded"}</div></> : "No comparable prior workpaper was found for this template step."}</div></Card>
      </div>

      <div className="mt-3 rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#918B83]"><Link2 size={9} /> Ledger and journal impact</div><span className={`rounded-full border px-2 py-1 text-[6px] font-semibold uppercase ${tone(ledger.linked ? "VERIFIED" : "INSPECT")}`}>{ledger.linked ? "Deterministic link" : "No proven link"}</span></div>
        <div className="mt-1.5 text-[7px] leading-4 text-[#8A847C]">{ledger.reason}</div>
        {ledger.linked ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-black/[0.05] bg-white">
            <div className="hidden grid-cols-[minmax(170px,1.15fr)_90px_90px_minmax(145px,0.9fr)] gap-2 border-b border-black/[0.05] bg-[#FAF9F7] px-3 py-2 text-[6px] font-semibold uppercase tracking-[0.08em] text-[#989188] md:grid"><span>Account</span><span>Exact impact</span><span>Period</span><span>Prior comparison</span></div>
            {(ledger.accounts || []).slice(0, 12).map((account) => (
              <div key={account.account_id} className="grid gap-1 border-b border-black/[0.04] px-3 py-2 text-[7px] text-[#635D56] last:border-0 md:grid-cols-[minmax(170px,1.15fr)_90px_90px_minmax(145px,0.9fr)] md:gap-2">
                <span className="truncate font-semibold text-[#46413B]">{account.account_code ? `${account.account_code} · ` : ""}{account.account_name}</span>
                <span>{money(account.linked_impact?.net, account.currency_code || currency)}</span>
                <span>{money(account.current_period_movement?.net, account.currency_code || currency)}</span>
                <span>{account.previous_period_movement ? `${money(account.previous_period_movement.net, account.currency_code || currency)} prior${account.change_percent != null ? ` · ${account.change_percent}%` : ""}` : "No prior period"}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card title="Source documents" icon={FileCheck2}>{activeLinks.length ? <div className="space-y-1.5">{activeLinks.slice(0, 8).map((link) => <div key={link.id} className="flex items-center justify-between gap-2 text-[7px]"><div className="min-w-0"><div className="truncate font-semibold text-[#514B45]">{link.document?.file_name || "Evidence document"}</div><div className="text-[#9B948C]">{label(link.evidence_category)}{link.document?.controlled ? " · controlled" : ""}</div></div>{link.document?.file_url ? <a href={link.document.file_url} target="_blank" rel="noreferrer" className="shrink-0 font-semibold text-[#76583A]">Open</a> : <span className="text-[#9B948C]">Recorded</span>}</div>)}</div> : <div className="text-[8px] text-[#9A7045]">No governed source document is linked to this workpaper.</div>}</Card>
        <Card title="Reviewer trail" icon={BadgeCheck}><div className="space-y-1.5 text-[7px] text-[#5F5952]">{review.notes?.slice(0, 6).map((note) => <div key={note.id} className="rounded-lg border border-black/[0.05] bg-white px-2 py-1.5"><div className="font-semibold">{label(note.note_type)} · {label(note.status)}</div><div className="mt-0.5 text-[#817A72]">{note.body}</div></div>)}{!review.notes?.length ? <div className="text-[#8F8981]">No review points recorded.</div> : null}{review.active_signoffs?.map((signoff) => <div key={signoff.id} className="flex items-center gap-1.5 text-[#61715C]"><BadgeCheck size={8} /> {label(signoff.signoff_role)} signed {shortDate(signoff.signed_at)}</div>)}</div></Card>
      </div>

      {decisionBlockers.length ? <div className="mt-3 rounded-xl border border-red-700/12 bg-red-50 p-3"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-red-800">Decision blockers visible in evidence</div><div className="mt-1.5 space-y-1 text-[7px] text-red-800">{decisionBlockers.map((blocker, index) => <div key={`${blocker}-${index}`}>{blocker}</div>)}</div></div> : <div className="mt-3 rounded-xl border border-emerald-700/10 bg-emerald-50/50 px-3 py-2 text-[7px] text-emerald-800">No evidence-layer blocker is surfaced here. The governed sign-off endpoint still performs the final server-side authorization, segregation-of-duties and portfolio checks.</div>}
    </div>
  );
}
