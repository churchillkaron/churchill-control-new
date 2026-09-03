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
  SUBLEDGER_RECONCILIATION: {
    label: "Reconcile subledgers",
    detail: "Confirm receivables and payables agree with the general ledger.",
    owner: "Accounting",
    icon: BookOpenCheck,
    automatic: true,
    href: "/finance/books",
  },
  BANK_RECONCILIATION: {
    label: "Reconcile banks",
    detail: "Clear bank-to-book differences before the period is closed.",
    owner: "Treasury / Accounting",
    icon: Landmark,
    automatic: true,
    href: "/finance/bank-reconciliation",
  },
  DEPRECIATION: {
    label: "Post depreciation",
    detail: "Post the selected period's depreciation from the fixed-asset register.",
    owner: "Fixed assets",
    icon: Calculator,
    automatic: true,
    href: "/finance/depreciation",
  },
  FX_REVALUATION: {
    label: "Revalue foreign currency",
    detail: "Revalue configured foreign-currency balance-sheet accounts at closing rates.",
    owner: "Controller",
    icon: Scale,
    automatic: false,
    href: "/finance/fx-revaluation",
  },
  TAX_CLOSE: {
    label: "Close tax balances",
    detail: "Settle configured recoverable and payable tax balances for the period.",
    owner: "Tax / Accounting",
    icon: FileCheck2,
    automatic: true,
    href: "/finance/vat-returns",
  },
  RETAINED_EARNINGS: {
    label: "Transfer retained earnings",
    detail: "Year-end only: close nominal accounts and transfer profit or loss to retained earnings.",
    owner: "Controller / Partner",
    icon: LockKeyhole,
    automatic: false,
    href: "/finance/year-end",
  },
};

const CRITICAL_SOURCES = [
  "finance_approval_requests",
  "finance_bank_reconciliation_runs",
  "finance_period_close_runs",
  "finance_period_close_steps",
  "finance_statutory_filings",
  "finance_review_items",
];

function clean(value) {
  return String(value || "").trim();
}

function titleCase(value) {
  return clean(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function financeHref(organizationId, route) {
  if (!organizationId || !route) return "#";
  return `/workspace/${organizationId}${route.startsWith("/") ? route : `/${route}`}`;
}

function periodLabel(period) {
  if (!period) return "Select a period";
  return period.period_name || period.name || period.label ||
    (period.start_date && period.end_date ? `${period.start_date} – ${period.end_date}` : "Accounting period");
}

function isDone(status) {
  return ["COMPLETED", "COMPLETE", "SKIPPED", "CLOSED", "DONE"].includes(clean(status).toUpperCase());
}

function statusTone(status) {
  const value = clean(status).toUpperCase();
  if (["FAILED", "BLOCKED", "ERROR", "CHANGES_REQUESTED"].includes(value)) return "border-red-700/15 bg-red-50 text-red-800";
  if (isDone(value) || ["READY", "CLOSED"].includes(value)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  return "border-amber-700/15 bg-amber-50 text-amber-800";
}

function Metric({ label, value, detail, warning = false, href }) {
  const body = <><div className="text-[8px] font-medium uppercase tracking-[0.12em] text-[#8C877F]">{label}</div><div className={`mt-1.5 text-[20px] font-semibold tracking-[-0.03em] ${warning && Number(value) > 0 ? "text-[#9A533D]" : "text-[#2A2723]"}`}>{value}</div><div className="mt-0.5 text-[8px] text-[#99938A]">{detail}</div></>;
  return href ? <Link href={href} className="rounded-xl border border-black/[0.07] bg-white px-3.5 py-3 transition hover:border-[#A37849]/30 hover:bg-[#FFFCF8]">{body}</Link> : <div className="rounded-xl border border-black/[0.07] bg-white px-3.5 py-3">{body}</div>;
}

export default function FinanceCloseCockpit({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const entityName = businessContext.entity?.display_name || businessContext.entity?.legal_name || businessContext.entity?.name || "Select legal entity";

  const [state, setState] = useState({ loading: true, error: "", command: null, runtime: null });
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);

  async function load() {
    if (!organizationId || !entityId || !periodId) {
      setState({ loading: false, error: "", command: null, runtime: null });
      return;
    }
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const commandUrl = new URL("/api/workspace/finance/command-center", window.location.origin);
      commandUrl.searchParams.set("organizationId", organizationId);
      commandUrl.searchParams.set("entityId", entityId);
      commandUrl.searchParams.set("periodId", periodId);
      const runtimeUrl = new URL("/api/finance/close/runtime", window.location.origin);
      runtimeUrl.searchParams.set("organizationId", organizationId);
      runtimeUrl.searchParams.set("entityId", entityId);
      runtimeUrl.searchParams.set("periodId", periodId);

      const [commandResponse, runtimeResponse] = await Promise.all([
        fetch(commandUrl.toString(), { credentials: "include", cache: "no-store" }),
        fetch(runtimeUrl.toString(), { credentials: "include", cache: "no-store" }),
      ]);
      const [commandBody, runtimeBody] = await Promise.all([
        commandResponse.json().catch(() => ({})),
        runtimeResponse.json().catch(() => ({})),
      ]);
      if (!commandResponse.ok || commandBody?.success === false) throw new Error(commandBody?.error || "Unable to load close controls");
      if (!runtimeResponse.ok || runtimeBody?.success === false) throw new Error(runtimeBody?.error || "Unable to load close checklist");
      setState({ loading: false, error: "", command: commandBody, runtime: runtimeBody });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || "Unable to load period close" }));
    }
  }

  useEffect(() => { load(); }, [organizationId, entityId, periodId]);

  const metrics = state.command?.metrics || {};
  const runtimeRows = Array.isArray(state.runtime?.rows) ? state.runtime.rows : [];
  const monthEndRows = runtimeRows.filter((row) => row.step_type !== "RETAINED_EARNINGS");
  const yearEndRows = runtimeRows.filter((row) => row.step_type === "RETAINED_EARNINGS");
  const sourceErrors = useMemo(() => CRITICAL_SOURCES.filter((source) => state.command?.sources?.[source]?.status === "error"), [state.command]);

  const controlExceptions = useMemo(() => {
    const rows = [];
    if ((metrics.reconciliation?.count || 0) > 0) rows.push({ id: "bank", label: "Bank reconciliation exceptions", count: metrics.reconciliation.count, detail: `${metrics.reconciliation.difference || 0} unresolved difference`, href: "/finance/bank-reconciliation" });
    if ((metrics.approvals?.count || 0) > 0) rows.push({ id: "approval", label: "Pending finance approvals", count: metrics.approvals.count, detail: "Documents still require a finance decision", href: "/finance/work" });
    if ((metrics.review?.count || 0) > 0) rows.push({ id: "review", label: "Open accounting review", count: metrics.review.count, detail: `${metrics.review.ready || 0} ready · ${metrics.review.changes_requested || 0} returned`, href: "/finance/review" });
    if ((metrics.filings?.count || 0) > 0) rows.push({ id: "filings", label: "Open statutory filings", count: metrics.filings.count, detail: `${metrics.filings.overdue || 0} overdue`, href: "/finance/statutory-filings" });
    return rows;
  }, [metrics]);

  const incompleteSteps = monthEndRows.filter((row) => !isDone(row.status));
  const checklistReady = state.runtime?.month_end_ready === true;
  const periodClosed = ["closed", "locked"].includes(clean(state.command?.context?.period_status).toLowerCase()) || clean(state.command?.close?.run?.status).toLowerCase() === "closed";
  const controlReady = controlExceptions.length === 0 && sourceErrors.length === 0;
  const finalReady = checklistReady && controlReady && !periodClosed;

  const closeState = periodClosed
    ? { label: "Period closed", detail: "The accounting period is already closed or locked.", tone: "ready" }
    : sourceErrors.length
      ? { label: "Control data incomplete", detail: "A critical Finance truth source is unavailable. Final close is disabled until the cockpit is complete.", tone: "blocked" }
      : !checklistReady
        ? { label: "Close work remains", detail: `${incompleteSteps.length} governed close step${incompleteSteps.length === 1 ? "" : "s"} still require completion.`, tone: "attention" }
        : !controlReady
          ? { label: "Resolve control exceptions", detail: `${controlExceptions.length} pre-close control area${controlExceptions.length === 1 ? "" : "s"} still need attention.`, tone: "attention" }
          : { label: "Ready for final close", detail: "The governed month-end checklist is complete and no surfaced control exceptions remain.", tone: "ready" };

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
        body: JSON.stringify({
          organizationId,
          entityId,
          periodId,
          stepType: row.step_type,
          idempotencyKey: `close-step:${organizationId}:${entityId}:${periodId}:${row.step_type}`,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || `Unable to complete ${STEP_META[row.step_type]?.label || row.step_type}`);
      setNotice({ tone: "success", text: `${STEP_META[row.step_type]?.label || titleCase(row.step_type)} completed through the governed close runtime.` });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Close step failed" });
    } finally {
      setBusy("");
    }
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
      setNotice({ tone: "success", text: "Month-end close completed. The server revalidated the governed close requirements before locking the period." });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Month-end close failed" });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-[1720px] space-y-4 text-[#2A2723]">
      <section className="rounded-[24px] border border-black/[0.07] bg-[#FBF8F3] p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.16em] text-[#8A633C]"><LockKeyhole size={11} /> Period close</div>
            <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em]">Know exactly what prevents close</h1>
            <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[#756F67]">Finish accounting truth in order, resolve control exceptions, then close only when the governed runtime agrees the period is ready.</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] text-[#918B83]"><span className="font-semibold text-[#625D56]">{entityName}</span><span>·</span><span>{periodLabel(businessContext.period)}</span>{state.command?.context?.period_status ? <><span>·</span><span>{titleCase(state.command.context.period_status)}</span></> : null}</div>
          </div>
          <button type="button" onClick={load} disabled={state.loading} className="inline-flex h-9 items-center gap-2 self-start rounded-xl border border-black/[0.08] bg-white px-3 text-[9px] font-semibold text-[#716B63] disabled:opacity-50 lg:self-auto"><RefreshCw size={11} className={state.loading ? "animate-spin" : ""} /> Refresh</button>
        </div>
      </section>

      {!entityId || !periodId ? <section className="rounded-2xl border border-amber-700/15 bg-amber-50 p-5 text-[10px] text-amber-900">Select a legal entity and accounting period in the Finance top bar before working on close.</section> : null}
      {state.error ? <section className="rounded-2xl border border-red-700/15 bg-red-50 p-4 text-[9px] text-red-800"><div className="flex items-start gap-2"><AlertTriangle size={12} className="mt-0.5" /><div><div className="font-semibold">Period close could not load</div><div className="mt-1">{state.error}</div></div></div></section> : null}
      {state.loading && !state.runtime ? <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-black/[0.07] bg-white text-[10px] text-[#817D76]"><LoaderCircle size={14} className="mr-2 animate-spin text-[#A37849]" />Checking close readiness…</div> : null}

      {entityId && periodId && state.runtime ? <>
        <section className={`rounded-[22px] border p-4 md:p-5 ${closeState.tone === "blocked" ? "border-red-700/12 bg-red-50" : closeState.tone === "ready" ? "border-emerald-700/10 bg-emerald-50/45" : "border-amber-700/10 bg-[#FFF9EF]"}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">{closeState.tone === "ready" ? <BadgeCheck size={18} className="mt-0.5 text-[#62765E]" /> : <AlertTriangle size={18} className={`mt-0.5 ${closeState.tone === "blocked" ? "text-[#9A533D]" : "text-[#A37849]"}`} />}<div><div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8A867F]">Close readiness</div><div className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[#38332E]">{closeState.label}</div><div className="mt-1 text-[9px] leading-4 text-[#756F67]">{closeState.detail}</div></div></div>
            <div className="flex items-center gap-3"><div className="text-right"><div className="text-[8px] text-[#918B83]">Month-end checklist</div><div className="mt-0.5 text-[14px] font-semibold tabular-nums text-[#403C37]">{monthEndRows.filter((row) => isDone(row.status)).length}/{monthEndRows.length}</div></div><button type="button" onClick={closeMonth} disabled={!finalReady || Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#3F352A] px-4 text-[8px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35">{busy === "final-close" ? <LoaderCircle size={11} className="animate-spin" /> : <LockKeyhole size={11} />}{periodClosed ? "Period closed" : busy === "final-close" ? "Closing…" : "Close month"}</button></div>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/[0.06]"><div className="h-full rounded-full bg-[#A37849]" style={{ width: `${monthEndRows.length ? Math.round((monthEndRows.filter((row) => isDone(row.status)).length / monthEndRows.length) * 100) : 0}%` }} /></div>
        </section>

        {notice ? <div className={`rounded-xl border p-3 text-[9px] ${notice.tone === "error" ? "border-red-700/15 bg-red-50 text-red-800" : "border-emerald-700/15 bg-emerald-50 text-emerald-800"}`}>{notice.text}</div> : null}

        <section className="rounded-[22px] border border-black/[0.07] bg-white p-4 md:p-5">
          <div><div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">Governed close sequence</div><h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em]">Finish accounting truth in order</h2><div className="mt-0.5 text-[9px] text-[#918B83]">Each execution goes through the existing period-close service. Completed and skipped steps remain visible as evidence of readiness.</div></div>
          <div className="mt-4 divide-y divide-black/[0.055] border-y border-black/[0.055]">
            {monthEndRows.map((row, index) => {
              const meta = STEP_META[row.step_type] || { label: titleCase(row.step_type), detail: "Governed close step", owner: "Finance", icon: CircleDot, automatic: false, href: "/finance/books" };
              const Icon = meta.icon;
              const done = isDone(row.status);
              const canRun = meta.automatic && !done && !periodClosed;
              return <div key={row.id} className="grid gap-3 py-3 md:grid-cols-[34px_minmax(0,1fr)_150px_130px_150px] md:items-center"><div className={`flex h-7 w-7 items-center justify-center rounded-full border text-[8px] font-semibold ${done ? "border-emerald-700/15 bg-emerald-50 text-emerald-800" : "border-black/[0.07] bg-[#FAF9F7] text-[#8A633C]"}`}>{done ? <CheckCircle2 size={11} /> : index + 1}</div><div className="min-w-0"><div className="flex items-center gap-2"><Icon size={11} className="shrink-0 text-[#9A7045]" /><div className="truncate text-[10px] font-semibold text-[#403C37]">{meta.label}</div></div><div className="mt-1 text-[8px] leading-4 text-[#918B83]">{meta.detail}</div>{row.evidence && Object.keys(row.evidence || {}).length ? <div className="mt-1 text-[7px] font-medium text-[#687762]">Evidence retained</div> : null}</div><div><div className="text-[7px] uppercase tracking-[0.1em] text-[#AAA39A]">Responsible area</div><div className="mt-1 text-[8px] font-semibold text-[#625D56]">{meta.owner}</div></div><div><span className={`inline-flex rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.06em] ${statusTone(row.status)}`}>{titleCase(row.status || "Pending")}</span></div><div className="flex items-center justify-end gap-1.5">{canRun ? <button type="button" onClick={() => runStep(row)} disabled={Boolean(busy)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#3F352A] px-2.5 text-[7px] font-semibold text-white disabled:opacity-40">{busy === `step:${row.step_type}` ? <LoaderCircle size={9} className="animate-spin" /> : <ArrowRight size={9} />}{busy === `step:${row.step_type}` ? "Running…" : "Run step"}</button> : null}<Link href={financeHref(organizationId, meta.href)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-black/[0.07] bg-white px-2.5 text-[7px] font-semibold text-[#716B63]">Open <ArrowRight size={8} /></Link></div></div>;
            })}
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
          <section className="rounded-[22px] border border-black/[0.07] bg-white p-4 md:p-5">
            <div className="flex items-start justify-between gap-3"><div><div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">Pre-close controls</div><h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em]">Exceptions before final close</h2><div className="mt-0.5 text-[9px] text-[#918B83]">These are existing Finance control truths, not a second close checklist.</div></div><ShieldCheck size={14} className="text-[#9A7045]" /></div>
            {sourceErrors.length ? <div className="mt-3 rounded-xl border border-red-700/10 bg-red-50 p-3"><div className="text-[8px] font-semibold text-red-800">Critical source unavailable</div><div className="mt-1 text-[8px] leading-4 text-red-700">{sourceErrors.map(titleCase).join(" · ")}</div></div> : null}
            <div className="mt-3 divide-y divide-black/[0.055]">{controlExceptions.map((item) => <Link key={item.id} href={financeHref(organizationId, item.href)} className="group flex items-center justify-between gap-4 py-3"><div className="flex min-w-0 items-start gap-2.5"><AlertTriangle size={11} className="mt-0.5 shrink-0 text-[#9A533D]" /><div className="min-w-0"><div className="truncate text-[9px] font-semibold text-[#48433E]">{item.label}</div><div className="mt-0.5 truncate text-[8px] text-[#918B83]">{item.detail}</div></div></div><div className="flex shrink-0 items-center gap-2"><span className="text-[13px] font-semibold tabular-nums text-[#9A533D]">{item.count}</span><ArrowRight size={9} className="text-[#B0AAA2] group-hover:text-[#9A7045]" /></div></Link>)}{!controlExceptions.length && !sourceErrors.length ? <div className="flex items-center gap-2 py-5 text-[9px] text-[#62715F]"><BadgeCheck size={12} />No surfaced pre-close control exceptions.</div> : null}</div>
          </section>

          <section className="rounded-[22px] border border-black/[0.07] bg-white p-4 md:p-5">
            <div><div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">Control snapshot</div><h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em]">Period exposure</h2><div className="mt-0.5 text-[9px] text-[#918B83]">Open balances are visible without automatically treating normal outstanding AR/AP as close blockers.</div></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Metric label="Receivables" value={metrics.receivables?.count || 0} detail={`${metrics.receivables?.overdue || 0} overdue`} warning={(metrics.receivables?.overdue || 0) > 0} href={financeHref(organizationId, "/finance/ar")} />
              <Metric label="Payables" value={metrics.payables?.count || 0} detail={`${metrics.payables?.overdue || 0} overdue`} warning={(metrics.payables?.overdue || 0) > 0} href={financeHref(organizationId, "/finance/ap")} />
              <Metric label="Review" value={metrics.review?.count || 0} detail={`${metrics.review?.ready || 0} ready`} warning={(metrics.review?.count || 0) > 0} href={financeHref(organizationId, "/finance/review")} />
              <Metric label="Filings" value={metrics.filings?.count || 0} detail={`${metrics.filings?.overdue || 0} overdue`} warning={(metrics.filings?.count || 0) > 0} href={financeHref(organizationId, "/finance/statutory-filings")} />
            </div>
          </section>
        </div>

        {yearEndRows.length ? <section className="rounded-[22px] border border-black/[0.07] bg-white p-4 md:p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">Year-end only</div><h2 className="mt-1 text-[14px] font-semibold">Retained earnings and year-end clearance</h2><div className="mt-1 text-[8px] text-[#918B83]">Kept separate so routine month-end users are not pushed into year-end accounting.</div></div>{yearEndRows.map((row) => <div key={row.id} className="flex items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase ${statusTone(row.status)}`}>{titleCase(row.status || "Pending")}</span><Link href={financeHref(organizationId, STEP_META.RETAINED_EARNINGS.href)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-black/[0.07] px-2.5 text-[7px] font-semibold text-[#716B63]">Open year end <ArrowRight size={8} /></Link></div>)}</div></section> : null}

        <div className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] px-3 py-2.5 text-[8px] leading-4 text-[#817D76]">Final close is never accepted from UI state alone. The existing month-end service calls the atomic period-close runtime with the canonical required steps, and the server remains the final authority. </div>
      </> : null}
    </div>
  );
}
