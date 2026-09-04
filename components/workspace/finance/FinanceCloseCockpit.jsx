"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  Calculator,
  CheckCircle2,
  CircleDot,
  FileCheck2,
  Landmark,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Scale,
  ShieldCheck,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const STEP_META = {
  SUBLEDGER_RECONCILIATION: { label: "Reconcile subledgers", detail: "Confirm receivables and payables agree with the general ledger.", owner: "Accounting", icon: BookOpenCheck, automatic: true, href: "/finance/books" },
  BANK_RECONCILIATION: { label: "Reconcile banks", detail: "Clear bank-to-book differences before the period is closed.", owner: "Treasury / Accounting", icon: Landmark, automatic: true, href: "/finance/bank-reconciliation" },
  DEPRECIATION: { label: "Post depreciation", detail: "Post the selected period's depreciation from the fixed-asset register.", owner: "Fixed assets", icon: Calculator, automatic: true, href: "/finance/depreciation" },
  FX_REVALUATION: { label: "Revalue foreign currency", detail: "Revalue configured foreign-currency balance-sheet accounts at closing rates.", owner: "Controller", icon: Scale, automatic: false, href: "/finance/fx-revaluation" },
  TAX_CLOSE: { label: "Close tax balances", detail: "Settle configured recoverable and payable tax balances for the period.", owner: "Tax / Accounting", icon: FileCheck2, automatic: true, href: "/finance/vat-returns" },
  RETAINED_EARNINGS: { label: "Transfer retained earnings", detail: "Year-end only: close nominal accounts and transfer profit or loss to retained earnings.", owner: "Controller / Partner", icon: LockKeyhole, automatic: false, href: "/finance/year-end" },
};

function clean(value) { return String(value || "").trim(); }
function titleCase(value) { return clean(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function financeHref(organizationId, route) { return organizationId && route ? `/workspace/${organizationId}${route.startsWith("/") ? route : `/${route}`}` : "#"; }
function periodLabel(period) { return period?.period_name || period?.name || period?.label || (period?.start_date && period?.end_date ? `${period.start_date} – ${period.end_date}` : "Accounting period"); }
function isDone(status) { return ["COMPLETED", "COMPLETE", "SKIPPED", "CLOSED", "DONE"].includes(clean(status).toUpperCase()); }
function tone(status) {
  const value = clean(status).toUpperCase();
  if (["FAILED", "BLOCKED", "ERROR", "CHANGES_REQUESTED", "ATTENTION", "WAITING"].includes(value)) return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (["READY", "CLEAR", "CLOSED"].includes(value) || isDone(value)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  return "border-black/[0.07] bg-[#FAF9F7] text-[#716B63]";
}

function Metric({ label, value, detail, warning = false, href }) {
  const body = <><div className="text-[8px] font-medium uppercase tracking-[0.12em] text-[#8C877F]">{label}</div><div className={`mt-1.5 text-[20px] font-semibold tracking-[-0.03em] ${warning ? "text-[#9A533D]" : "text-[#2A2723]"}`}>{value}</div><div className="mt-0.5 text-[8px] text-[#99938A]">{detail}</div></>;
  return href ? <Link href={href} className="rounded-xl border border-black/[0.07] bg-white px-3.5 py-3 transition hover:border-[#A37849]/30 hover:bg-[#FFFCF8]">{body}</Link> : <div className="rounded-xl border border-black/[0.07] bg-white px-3.5 py-3">{body}</div>;
}

export default function FinanceCloseCockpit({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const entityName = businessContext.entity?.display_name || businessContext.entity?.legal_name || businessContext.entity?.name || "Select legal entity";

  const [state, setState] = useState({ loading: true, error: "", tower: null });
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);

  async function load() {
    if (!organizationId || !entityId || !periodId) {
      setState({ loading: false, error: "", tower: null });
      return;
    }
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/workspace/finance/close-control-tower", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("entityId", entityId);
      url.searchParams.set("periodId", periodId);
      const response = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load close control tower");
      setState({ loading: false, error: "", tower: body });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || "Unable to load period close" }));
    }
  }

  useEffect(() => { load(); }, [organizationId, entityId, periodId]);

  const tower = state.tower;
  const summary = tower?.summary || {};
  const reconciliation = tower?.reconciliation || {};
  const monthEndRows = tower?.close?.steps || [];
  const yearEndRows = tower?.close?.year_end_steps || [];
  const blockers = tower?.blockers || [];
  const path = tower?.path || [];
  const integrityComplete = tower?.integrity?.complete === true;
  const periodClosed = summary.period_closed === true;
  const finalReady = summary.final_ready === true;

  const nextAction = useMemo(() => blockers[0] || (finalReady ? { title: "Ready for final close", detail: "All close-control blockers are clear." } : null), [blockers, finalReady]);

  async function runStep(row) {
    if (!row?.step_type || busy) return;
    try {
      setBusy(`step:${row.step_type}`);
      setNotice(null);
      const response = await fetch("/api/finance/period-close/steps", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, entityId, periodId, stepType: row.step_type, idempotencyKey: `close-step:${organizationId}:${entityId}:${periodId}:${row.step_type}` }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || `Unable to complete ${STEP_META[row.step_type]?.label || row.step_type}`);
      setNotice({ tone: "success", text: `${STEP_META[row.step_type]?.label || titleCase(row.step_type)} completed through the governed close runtime.` });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Close step failed" });
    } finally { setBusy(""); }
  }

  async function closeMonth() {
    if (!finalReady || busy) return;
    try {
      setBusy("final-close");
      setNotice(null);
      const response = await fetch("/api/finance/month-end/close-period", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, entityId, periodId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Final month-end close was not accepted");
      setNotice({ tone: "success", text: "Month-end close completed. The atomic close runtime revalidated the governed requirements before locking the period." });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Month-end close failed" });
    } finally { setBusy(""); }
  }

  return (
    <div className="mx-auto max-w-[1720px] space-y-4 text-[#2A2723]">
      <section className="rounded-[24px] border border-black/[0.07] bg-[#FBF8F3] p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.16em] text-[#8A633C]"><LockKeyhole size={11} /> Finance close control tower</div>
            <h1 className="mt-1.5 text-[23px] font-semibold tracking-[-0.035em]">One path to a clean close</h1>
            <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[#756F67]">Reconciliation coverage, close execution, review, approvals and statutory clearance in one governed path. The tower prioritizes work; the atomic close runtime remains final authority.</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] text-[#918B83]"><span className="font-semibold text-[#625D56]">{entityName}</span><span>·</span><span>{periodLabel(businessContext.period)}</span>{tower?.context?.period_status ? <><span>·</span><span>{titleCase(tower.context.period_status)}</span></> : null}</div>
          </div>
          <button type="button" onClick={load} disabled={state.loading} className="inline-flex h-9 items-center gap-2 self-start rounded-xl border border-black/[0.08] bg-white px-3 text-[9px] font-semibold text-[#716B63] disabled:opacity-50 lg:self-auto"><RefreshCw size={11} className={state.loading ? "animate-spin" : ""} /> Refresh</button>
        </div>
      </section>

      {!entityId || !periodId ? <section className="rounded-2xl border border-amber-700/15 bg-amber-50 p-5 text-[10px] text-amber-900">Select a legal entity and accounting period in the Finance top bar before working on close.</section> : null}
      {state.error ? <section className="rounded-2xl border border-red-700/15 bg-red-50 p-4 text-[9px] text-red-800"><div className="flex items-start gap-2"><AlertTriangle size={12} className="mt-0.5" /><div><div className="font-semibold">Close control tower could not load</div><div className="mt-1">{state.error}</div></div></div></section> : null}
      {state.loading && !tower ? <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-black/[0.07] bg-white text-[10px] text-[#817D76]"><LoaderCircle size={14} className="mr-2 animate-spin text-[#A37849]" />Building governed close path…</div> : null}

      {tower ? <>
        <section className={`rounded-[22px] border p-4 md:p-5 ${!integrityComplete ? "border-red-700/12 bg-red-50" : periodClosed || finalReady ? "border-emerald-700/10 bg-emerald-50/45" : "border-amber-700/10 bg-[#FFF9EF]"}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">{periodClosed || finalReady ? <BadgeCheck size={18} className="mt-0.5 text-[#62765E]" /> : <AlertTriangle size={18} className={`mt-0.5 ${integrityComplete ? "text-[#A37849]" : "text-[#9A533D]"}`} />}<div><div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8A867F]">Next control decision</div><div className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[#38332E]">{periodClosed ? "Period closed" : !integrityComplete ? "Accounting truth incomplete" : nextAction?.title || "Close path clear"}</div><div className="mt-1 text-[9px] leading-4 text-[#756F67]">{periodClosed ? "The selected accounting period is already closed or locked." : !integrityComplete ? "A required Finance population could not be proven complete, so final close is disabled." : nextAction?.detail || "All governed close-control areas are clear."}</div></div></div>
            <div className="flex items-center gap-3"><div className="text-right"><div className="text-[8px] text-[#918B83]">Hard blockers</div><div className="mt-0.5 text-[14px] font-semibold tabular-nums text-[#403C37]">{summary.hard_blockers || 0}</div></div><button type="button" onClick={closeMonth} disabled={!finalReady || Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#3F352A] px-4 text-[8px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35">{busy === "final-close" ? <LoaderCircle size={11} className="animate-spin" /> : <LockKeyhole size={11} />}{periodClosed ? "Period closed" : busy === "final-close" ? "Closing…" : "Close month"}</button></div>
          </div>
        </section>

        {notice ? <div className={`rounded-xl border p-3 text-[9px] ${notice.tone === "error" ? "border-red-700/15 bg-red-50 text-red-800" : "border-emerald-700/15 bg-emerald-50 text-emerald-800"}`}>{notice.text}</div> : null}

        <section className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Bank coverage" value={`${reconciliation.coverage_percent ?? 0}%`} detail={`${reconciliation.reconciled_accounts || 0}/${reconciliation.active_accounts || 0} reconciled`} warning={(reconciliation.coverage_percent || 0) < 100} href={financeHref(organizationId, "/finance/bank-reconciliation")} />
          <Metric label="Close steps" value={`${summary.close_steps_complete || 0}/${summary.close_steps_total || 0}`} detail="governed sequence" warning={(summary.close_steps_complete || 0) < (summary.close_steps_total || 0)} />
          <Metric label="Review" value={summary.open_reviews || 0} detail="open review items" warning={(summary.open_reviews || 0) > 0} href={financeHref(organizationId, "/finance/review")} />
          <Metric label="Approvals" value={summary.open_approvals || 0} detail="decisions outstanding" warning={(summary.open_approvals || 0) > 0} href={financeHref(organizationId, "/finance/work")} />
          <Metric label="Filings" value={summary.open_filings || 0} detail="period obligations" warning={(summary.open_filings || 0) > 0} href={financeHref(organizationId, "/finance/statutory-filings")} />
          <Metric label="Authority" value={integrityComplete ? "Live" : "Blocked"} detail="atomic close runtime" warning={!integrityComplete} />
        </section>

        <section className="rounded-[22px] border border-black/[0.07] bg-white p-4 md:p-5">
          <div className="flex items-start justify-between gap-3"><div><div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">Path to close</div><h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em]">Clear the period in the right order</h2><div className="mt-0.5 text-[9px] text-[#918B83]">One operational sequence instead of separate close, reconciliation and review dashboards.</div></div><ShieldCheck size={14} className="text-[#9A7045]" /></div>
          <div className="mt-4 grid gap-2 lg:grid-cols-5">{path.map((item, index) => <div key={item.id} className="rounded-xl border border-black/[0.065] bg-[#FCFBF8] p-3"><div className="flex items-center justify-between gap-2"><div className="flex h-6 w-6 items-center justify-center rounded-full border border-black/[0.07] bg-white text-[8px] font-semibold text-[#8A633C]">{index + 1}</div><span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.06em] ${tone(item.state)}`}>{titleCase(item.state)}</span></div><div className="mt-3 text-[9px] font-semibold text-[#403C37]">{item.label}</div><div className="mt-1 min-h-10 text-[8px] leading-4 text-[#918B83]">{item.detail}</div>{item.href ? <Link href={financeHref(organizationId, item.href)} className="mt-3 inline-flex items-center gap-1 text-[7px] font-semibold text-[#8A633C]">Open work <ArrowRight size={8} /></Link> : null}</div>)}</div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(390px,0.95fr)]">
          <section className="rounded-[22px] border border-black/[0.07] bg-white p-4 md:p-5">
            <div><div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">Reconciliation coverage</div><h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em]">Every active bank account accounted for</h2><div className="mt-0.5 text-[9px] text-[#918B83]">Coverage is a close control: a missing reconciliation is visible even when no exception run exists.</div></div>
            <div className="mt-4 divide-y divide-black/[0.055] border-y border-black/[0.055]">{(reconciliation.accounts || []).map((row) => <div key={row.bank_account_id} className="grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_100px_120px_90px] md:items-center"><div><div className="text-[9px] font-semibold text-[#403C37]">{row.name}</div><div className="mt-0.5 text-[8px] text-[#918B83]">{row.currency_code || "—"}{row.reconciliation_date ? ` · ${row.reconciliation_date}` : " · no period reconciliation"}</div></div><div className="text-right text-[9px] tabular-nums text-[#625D56]">{Number(row.difference || 0).toLocaleString()}</div><div><span className={`inline-flex rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.06em] ${tone(row.reconciled ? "CLEAR" : "ATTENTION")}`}>{row.reconciled ? "Reconciled" : row.covered ? "Exception" : "Missing"}</span></div><Link href={financeHref(organizationId, "/finance/bank-reconciliation")} className="inline-flex items-center justify-end gap-1 text-[7px] font-semibold text-[#8A633C]">Open <ArrowRight size={8} /></Link></div>)}{!(reconciliation.accounts || []).length ? <div className="py-5 text-[9px] text-[#62715F]">No active bank accounts require reconciliation in this entity scope.</div> : null}</div>
          </section>

          <section className="rounded-[22px] border border-black/[0.07] bg-white p-4 md:p-5">
            <div><div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">Blocker queue</div><h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em]">What actually prevents close</h2><div className="mt-0.5 text-[9px] text-[#918B83]">Server-ranked by control severity. Queue order helps navigation; it never authorizes period lock.</div></div>
            <div className="mt-3 divide-y divide-black/[0.055]">{blockers.map((item) => <div key={item.id} className="flex items-start justify-between gap-4 py-3"><div className="flex min-w-0 items-start gap-2.5"><AlertTriangle size={11} className="mt-0.5 shrink-0 text-[#9A533D]" /><div className="min-w-0"><div className="text-[9px] font-semibold text-[#48433E]">{item.title}</div><div className="mt-0.5 text-[8px] leading-4 text-[#918B83]">{item.detail}</div></div></div><div className="flex shrink-0 items-center gap-2"><span className="text-[13px] font-semibold tabular-nums text-[#9A533D]">{item.count}</span>{item.href ? <Link href={financeHref(organizationId, item.href)}><ArrowRight size={9} className="text-[#9A7045]" /></Link> : null}</div></div>)}{!blockers.length ? <div className="flex items-center gap-2 py-5 text-[9px] text-[#62715F]"><BadgeCheck size={12} />No governed close blockers remain.</div> : null}</div>
          </section>
        </div>

        <section className="rounded-[22px] border border-black/[0.07] bg-white p-4 md:p-5">
          <div><div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">Governed close execution</div><h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em]">Accounting steps and retained evidence</h2><div className="mt-0.5 text-[9px] text-[#918B83]">Execution still uses the existing period-close service. The control tower does not bypass posting rules or atomic close logic.</div></div>
          <div className="mt-4 divide-y divide-black/[0.055] border-y border-black/[0.055]">{monthEndRows.map((row, index) => { const meta = STEP_META[row.step_type] || { label: titleCase(row.step_type), detail: "Governed close step", owner: "Finance", icon: CircleDot, automatic: false, href: "/finance/books" }; const Icon = meta.icon; const done = row.complete === true || isDone(row.status); const canRun = meta.automatic && !done && !periodClosed; return <div key={row.id} className="grid gap-3 py-3 md:grid-cols-[34px_minmax(0,1fr)_150px_130px_150px] md:items-center"><div className={`flex h-7 w-7 items-center justify-center rounded-full border text-[8px] font-semibold ${done ? "border-emerald-700/15 bg-emerald-50 text-emerald-800" : "border-black/[0.07] bg-[#FAF9F7] text-[#8A633C]"}`}>{done ? <CheckCircle2 size={11} /> : index + 1}</div><div><div className="flex items-center gap-2"><Icon size={11} className="text-[#9A7045]" /><div className="text-[10px] font-semibold text-[#403C37]">{meta.label}</div></div><div className="mt-1 text-[8px] leading-4 text-[#918B83]">{meta.detail}</div>{row.evidence && Object.keys(row.evidence || {}).length ? <div className="mt-1 text-[7px] font-medium text-[#687762]">Evidence retained</div> : null}</div><div><div className="text-[7px] uppercase tracking-[0.1em] text-[#AAA39A]">Responsible area</div><div className="mt-1 text-[8px] font-semibold text-[#625D56]">{meta.owner}</div></div><div><span className={`inline-flex rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.06em] ${tone(row.status)}`}>{titleCase(row.status || "Pending")}</span></div><div className="flex items-center justify-end gap-1.5">{canRun ? <button type="button" onClick={() => runStep(row)} disabled={Boolean(busy)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#3F352A] px-2.5 text-[7px] font-semibold text-white disabled:opacity-40">{busy === `step:${row.step_type}` ? <LoaderCircle size={9} className="animate-spin" /> : <ArrowRight size={9} />}{busy === `step:${row.step_type}` ? "Running…" : "Run step"}</button> : null}<Link href={financeHref(organizationId, meta.href)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-black/[0.07] bg-white px-2.5 text-[7px] font-semibold text-[#716B63]">Open <ArrowRight size={8} /></Link></div></div>; })}</div>
        </section>

        {yearEndRows.length ? <section className="rounded-[22px] border border-black/[0.07] bg-white p-4 md:p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">Year-end only</div><h2 className="mt-1 text-[14px] font-semibold">Retained earnings and year-end clearance</h2><div className="mt-1 text-[8px] text-[#918B83]">Kept separate from routine month-end work.</div></div>{yearEndRows.map((row) => <div key={row.id} className="flex items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase ${tone(row.status)}`}>{titleCase(row.status || "Pending")}</span><Link href={financeHref(organizationId, STEP_META.RETAINED_EARNINGS.href)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-black/[0.07] px-2.5 text-[7px] font-semibold text-[#716B63]">Open year end <ArrowRight size={8} /></Link></div>)}</div></section> : null}

        <div className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] px-3 py-2.5 text-[8px] leading-4 text-[#817D76]">Control-tower state is navigation and prioritization only. Final period lock is accepted only by the atomic server close runtime, which revalidates the canonical required steps before closing the period.</div>
      </> : null}
    </div>
  );
}
