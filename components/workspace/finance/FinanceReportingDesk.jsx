"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BookOpenCheck,
  Calculator,
  ChartNoAxesCombined,
  FileBarChart,
  FileText,
  Gauge,
  LineChart,
  LoaderCircle,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { getWorkspaceGroups } from "@/lib/platform/registry/erpRegistry";
import { resolveWorkspaceRoute } from "@/lib/platform/routing/resolveWorkspaceRoute";

const REPORT_FAMILIES = [
  {
    id: "core",
    label: "Core accounting reports",
    description: "Statements and ledger control used to explain and sign off the period.",
    capabilityIds: ["financial_statements", "trial_balance", "management_reports"],
  },
  {
    id: "performance",
    label: "Performance & analysis",
    description: "Understand performance, exceptions and executive finance signals.",
    capabilityIds: ["finance_analytics", "finance_kpis", "executive_dashboard", "financial_health", "ai_insights"],
  },
  {
    id: "planning",
    label: "Planning",
    description: "Compare actual accounting truth with budgets, forecasts and scenarios.",
    capabilityIds: ["budgeting", "forecasting"],
  },
  {
    id: "distribution",
    label: "Build & distribute",
    description: "Custom and recurring reporting capabilities remain visible as they become available.",
    capabilityIds: ["report_builder", "scheduled_reports"],
  },
];

const RECENT_LIMIT = 5;

function clean(value) {
  return String(value || "").trim();
}

function titleCase(value) {
  return clean(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function unavailable(item) {
  return ["planned", "blocked", "disabled", "unavailable"].includes(clean(item?.status).toLowerCase());
}

function money(value, currencyCode) {
  const numeric = Number(value || 0);
  try {
    return currencyCode
      ? new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode, maximumFractionDigits: 0 }).format(numeric)
      : new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(numeric);
  } catch {
    return `${currencyCode || ""} ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(numeric)}`.trim();
  }
}

function percent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : "—";
}

function financeHref(organizationId, route) {
  if (!organizationId || !route) return "#";
  return `/workspace/${organizationId}${route.startsWith("/") ? route : `/${route}`}`;
}

function reportRoute(organizationId, item) {
  if (!item) return "#";
  return resolveWorkspaceRoute({
    organizationId,
    workspaceId: "finance",
    moduleId: item.id,
    route: item.route,
  });
}

function periodLabel(period) {
  if (!period) return "Select a period";
  return period.period_name || period.name || period.label ||
    (period.start_date && period.end_date ? `${period.start_date} – ${period.end_date}` : "Accounting period");
}

async function readJson(url) {
  try {
    const response = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success === false) throw new Error(body?.error || `Request failed (${response.status})`);
    return { ok: true, data: body, error: "" };
  } catch (error) {
    return { ok: false, data: null, error: error?.message || "Source unavailable" };
  }
}

function SummaryCard({ eyebrow, title, value, secondary, state, href, icon: Icon }) {
  return (
    <Link href={href} className="group rounded-2xl border border-black/[0.07] bg-white p-4 transition hover:border-[#A37849]/30 hover:bg-[#FFFCF8]">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8C877F]">{eyebrow}</div>
        <Icon size={13} className="text-[#A37849]" />
      </div>
      <div className="mt-2 text-[12px] font-semibold text-[#403C37]">{title}</div>
      <div className="mt-2 text-[19px] font-semibold tracking-[-0.035em] text-[#24211E]">{value}</div>
      <div className="mt-1 text-[8px] leading-4 text-[#918B83]">{secondary}</div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.06em] ${state?.tone === "attention" ? "border-amber-700/15 bg-amber-50 text-amber-800" : state?.tone === "error" ? "border-red-700/15 bg-red-50 text-red-800" : "border-emerald-700/15 bg-emerald-50 text-emerald-800"}`}>{state?.label || "Available"}</span>
        <ArrowRight size={9} className="text-[#B0AAA2] group-hover:text-[#8A633C]" />
      </div>
    </Link>
  );
}

function CapabilityRow({ item, organizationId, onOpen }) {
  const disabled = unavailable(item);
  const body = (
    <>
      <div className="min-w-0">
        <div className="truncate text-[9px] font-semibold text-[#4A4640]">{item.name}</div>
        <div className="mt-0.5 line-clamp-1 text-[8px] text-[#99938A]">{item.description || "Finance reporting capability"}</div>
      </div>
      {disabled ? <span className="shrink-0 text-[7px] font-semibold uppercase tracking-[0.06em] text-[#A39D95]">{clean(item.status) || "Unavailable"}</span> : <ArrowRight size={9} className="shrink-0 text-[#B3ADA5]" />}
    </>
  );
  return disabled
    ? <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 opacity-50">{body}</div>
    : <Link href={reportRoute(organizationId, item)} onClick={() => onOpen(item)} className="group flex items-center justify-between gap-3 px-3.5 py-2.5 transition hover:bg-[#FCFAF6]">{body}</Link>;
}

export default function FinanceReportingDesk({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const entityName = businessContext.entity?.display_name || businessContext.entity?.legal_name || businessContext.entity?.name || "Select legal entity";

  const registryGroups = useMemo(() => getWorkspaceGroups("finance"), []);
  const capabilityMap = useMemo(() => {
    const rows = new Map();
    for (const group of registryGroups) {
      for (const item of group.items || []) rows.set(item.id, { ...item, registry_group: group.name });
    }
    return rows;
  }, [registryGroups]);

  const [query, setQuery] = useState("");
  const [recentIds, setRecentIds] = useState([]);
  const [state, setState] = useState({ loading: true, error: "", command: null, pnl: null, balance: null, cash: null, trial: null });

  useEffect(() => {
    if (!organizationId || typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(`avantiqo:finance:reports:recent:${organizationId}`) || "[]");
      setRecentIds(Array.isArray(stored) ? stored.slice(0, RECENT_LIMIT) : []);
    } catch {
      setRecentIds([]);
    }
  }, [organizationId]);

  function remember(item) {
    if (!item?.id || !organizationId || typeof window === "undefined") return;
    setRecentIds((current) => {
      const next = [item.id, ...current.filter((id) => id !== item.id)].slice(0, RECENT_LIMIT);
      window.localStorage.setItem(`avantiqo:finance:reports:recent:${organizationId}`, JSON.stringify(next));
      return next;
    });
  }

  async function load() {
    if (!organizationId || !entityId || !periodId) {
      setState({ loading: false, error: "", command: null, pnl: null, balance: null, cash: null, trial: null });
      return;
    }
    setState((current) => ({ ...current, loading: true, error: "" }));

    const urls = {
      command: new URL("/api/workspace/finance/command-center", window.location.origin),
      pnl: new URL("/api/finance/reports/profit-loss", window.location.origin),
      balance: new URL("/api/finance/reports/balance-sheet", window.location.origin),
      cash: new URL("/api/finance/reports/cash-flow", window.location.origin),
      trial: new URL("/api/finance/trial-balance", window.location.origin),
    };
    for (const url of Object.values(urls)) {
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("entityId", entityId);
      url.searchParams.set("periodId", periodId);
    }

    const [command, pnl, balance, cash, trial] = await Promise.all([
      readJson(urls.command),
      readJson(urls.pnl),
      readJson(urls.balance),
      readJson(urls.cash),
      readJson(urls.trial),
    ]);

    const failed = [command, pnl, balance, cash, trial].filter((source) => !source.ok).length;
    setState({
      loading: false,
      error: failed === 5 ? "Reporting truth could not be loaded for the selected context." : "",
      command,
      pnl,
      balance,
      cash,
      trial,
    });
  }

  useEffect(() => { load(); }, [organizationId, entityId, periodId]);

  const pnlSummary = state.pnl?.data?.document?.summary || {};
  const balanceSummary = state.balance?.data?.document?.summary || {};
  const cashSummary = state.cash?.data?.document?.summary || {};
  const trial = state.trial?.data || {};
  const command = state.command?.data || {};
  const currency = state.pnl?.data?.document?.currency?.code || state.balance?.data?.document?.currency?.code || command?.context?.currency || businessContext.entity?.currency || businessContext.organization?.default_currency || null;

  const revenue = Number(pnlSummary.revenue || 0);
  const grossProfit = Number(pnlSummary.grossProfit || 0);
  const netProfit = Number(pnlSummary.netProfit || 0);
  const grossMargin = revenue ? (grossProfit / revenue) * 100 : null;
  const netCash = Number(cashSummary.netCashflow || 0);
  const balanceDifference = Number(balanceSummary.totalAssets || 0) - Number(balanceSummary.totalLiabilities || 0) - Number(balanceSummary.totalEquity || 0);

  const financialStatements = capabilityMap.get("financial_statements");
  const trialBalance = capabilityMap.get("trial_balance");
  const analytics = capabilityMap.get("finance_analytics");
  const managementReports = capabilityMap.get("management_reports");

  const recommendation = useMemo(() => {
    if (state.trial && !state.trial.ok) return { title: "Restore trial-balance control", detail: "The trial-balance source is unavailable, so the reporting desk cannot confirm ledger balance.", href: trialBalance ? reportRoute(organizationId, trialBalance) : financeHref(organizationId, "/finance/trial-balance"), tone: "error" };
    if (trial?.balanced === false) return { title: "Investigate the trial-balance difference", detail: `Debit and credit balances differ by ${money(trial.difference, currency)}. Fix accounting truth before relying on final statements.`, href: trialBalance ? reportRoute(organizationId, trialBalance) : financeHref(organizationId, "/finance/trial-balance"), tone: "error" };
    if ((command?.metrics?.reconciliation?.count || 0) > 0) return { title: "Explain cash and reconciliation differences", detail: `${command.metrics.reconciliation.count} reconciliation exception${command.metrics.reconciliation.count === 1 ? "" : "s"} remain in the selected period.`, href: financeHref(organizationId, "/finance/bank-reconciliation"), tone: "attention" };
    if ((command?.metrics?.review?.changes_requested || 0) > 0) return { title: "Resolve returned accounting review", detail: `${command.metrics.review.changes_requested} review item${command.metrics.review.changes_requested === 1 ? "" : "s"} have changes requested before reporting sign-off.`, href: financeHref(organizationId, "/finance/review"), tone: "attention" };
    if (state.pnl?.ok && netProfit < 0) return { title: "Explain the period loss", detail: `Net profit is ${money(netProfit, currency)}. Open P&L and identify the accounts driving the result.`, href: analytics ? reportRoute(organizationId, analytics) : financeHref(organizationId, "/finance/reports"), tone: "attention" };
    if (state.cash?.ok && netCash < 0) return { title: "Investigate negative cash movement", detail: `Net cash flow is ${money(netCash, currency)} even though the ledger is balanced. Trace the movement before management reporting.`, href: financialStatements ? reportRoute(organizationId, financialStatements) : financeHref(organizationId, "/finance/statements"), tone: "attention" };
    if ((command?.metrics?.close?.total || 0) > 0 && (command?.metrics?.close?.progress || 0) < 100) return { title: "Finish close before final sign-off", detail: `Period close is ${command.metrics.close.progress || 0}% complete. Reports are available now, but final sign-off should follow the governed close.`, href: financeHref(organizationId, "/finance/close"), tone: "attention" };
    return { title: "Review management reporting", detail: "Accounting control is clear in the surfaced checks. Move from bookkeeping truth to management explanation and decision support.", href: managementReports ? reportRoute(organizationId, managementReports) : financeHref(organizationId, "/finance/management-reports"), tone: "ready" };
  }, [state.trial, state.pnl, state.cash, trial, command, netProfit, netCash, currency, organizationId, trialBalance, analytics, financialStatements, managementReports]);

  const familyRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return REPORT_FAMILIES.map((family) => ({
      ...family,
      items: family.capabilityIds
        .map((id) => capabilityMap.get(id))
        .filter(Boolean)
        .filter((item) => !needle || [item.id, item.name, item.description, item.registry_group].filter(Boolean).join(" ").toLowerCase().includes(needle)),
    })).filter((family) => family.items.length);
  }, [capabilityMap, query]);

  const recentItems = recentIds.map((id) => capabilityMap.get(id)).filter((item) => item && !unavailable(item));

  return (
    <div className="mx-auto max-w-[1720px] space-y-4 text-[#2A2723]">
      <section className="rounded-[24px] border border-black/[0.07] bg-[#FBF8F3] p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.16em] text-[#8A633C]"><FileBarChart size={11} /> Accounting output</div>
            <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em]">Reports</h1>
            <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[#756F67]">Start with the accounting result and control state, then open the report that explains it. Planning and specialist reporting stay one level below daily financial truth.</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] text-[#918B83]"><span className="font-semibold text-[#625D56]">{entityName}</span><span>·</span><span>{periodLabel(businessContext.period)}</span></div>
          </div>
          <div className="flex w-full gap-2 lg:w-auto">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 lg:w-[300px]"><Search size={11} className="text-[#A29D95]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a report or analysis…" className="min-w-0 flex-1 bg-transparent text-[9px] text-[#403C37] outline-none placeholder:text-[#B2ADA5]" /></label>
            <button type="button" onClick={load} disabled={state.loading} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3 text-[8px] font-semibold text-[#716B63] disabled:opacity-50"><RefreshCw size={10} className={state.loading ? "animate-spin" : ""} /> Refresh</button>
          </div>
        </div>
      </section>

      {!entityId || !periodId ? <section className="rounded-2xl border border-amber-700/15 bg-amber-50 p-5 text-[10px] text-amber-900">Select a legal entity and accounting period in the Finance top bar to load the reporting pulse.</section> : null}
      {state.error ? <section className="rounded-2xl border border-red-700/15 bg-red-50 p-4 text-[9px] text-red-800"><div className="flex items-start gap-2"><AlertTriangle size={12} className="mt-0.5" /><span>{state.error}</span></div></section> : null}
      {state.loading && entityId && periodId && !state.pnl ? <div className="flex min-h-[190px] items-center justify-center rounded-2xl border border-black/[0.07] bg-white text-[9px] text-[#817D76]"><LoaderCircle size={13} className="mr-2 animate-spin text-[#A37849]" />Reading current accounting reports…</div> : null}

      {entityId && periodId && (state.pnl || !state.loading) ? <>
        <Link href={recommendation.href} className={`group block rounded-[22px] border p-4 transition md:p-5 ${recommendation.tone === "error" ? "border-red-700/12 bg-red-50" : recommendation.tone === "attention" ? "border-amber-700/12 bg-[#FFF9EF]" : "border-emerald-700/10 bg-emerald-50/45"}`}>
          <div className="flex items-center justify-between gap-4"><div className="flex items-start gap-3">{recommendation.tone === "ready" ? <BadgeCheck size={17} className="mt-0.5 text-[#657A61]" /> : <Sparkles size={17} className={recommendation.tone === "error" ? "mt-0.5 text-[#9A533D]" : "mt-0.5 text-[#A37849]"} />}<div><div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8A867F]">Recommended next</div><div className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-[#3D3832]">{recommendation.title}</div><div className="mt-1 text-[9px] leading-4 text-[#756F67]">{recommendation.detail}</div></div></div><ArrowRight size={12} className="shrink-0 text-[#9A7045] transition group-hover:translate-x-0.5" /></div>
        </Link>

        <section>
          <div className="mb-2"><div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">Current period pulse</div><div className="mt-0.5 text-[9px] text-[#918B83]">Canonical report outputs, not recalculated dashboard approximations.</div></div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard eyebrow="Profit & loss" title="Net profit" value={state.pnl?.ok ? money(netProfit, currency) : "Unavailable"} secondary={state.pnl?.ok ? `Revenue ${money(revenue, currency)} · Gross margin ${grossMargin === null ? "—" : percent(grossMargin)}` : state.pnl?.error || "P&L source unavailable"} state={{ label: state.pnl?.ok ? (netProfit < 0 ? "Needs explanation" : "Current") : "Source error", tone: state.pnl?.ok ? (netProfit < 0 ? "attention" : "ready") : "error" }} href={analytics ? reportRoute(organizationId, analytics) : financeHref(organizationId, "/finance/reports")} icon={ChartNoAxesCombined} />
            <SummaryCard eyebrow="Balance sheet" title="Assets" value={state.balance?.ok ? money(balanceSummary.totalAssets, currency) : "Unavailable"} secondary={state.balance?.ok ? `Liabilities ${money(balanceSummary.totalLiabilities, currency)} · Equity ${money(balanceSummary.totalEquity, currency)}` : state.balance?.error || "Balance-sheet source unavailable"} state={{ label: state.balance?.ok ? (Math.abs(balanceDifference) > 0.01 ? "Review equation" : "Current") : "Source error", tone: state.balance?.ok ? (Math.abs(balanceDifference) > 0.01 ? "attention" : "ready") : "error" }} href={financialStatements ? reportRoute(organizationId, financialStatements) : financeHref(organizationId, "/finance/statements")} icon={Calculator} />
            <SummaryCard eyebrow="Cash flow" title="Net cash movement" value={state.cash?.ok ? money(netCash, currency) : "Unavailable"} secondary={state.cash?.ok ? (netCash < 0 ? "Negative movement deserves explanation" : "Current period cash movement") : state.cash?.error || "Cash-flow source unavailable"} state={{ label: state.cash?.ok ? (netCash < 0 ? "Needs explanation" : "Current") : "Source error", tone: state.cash?.ok ? (netCash < 0 ? "attention" : "ready") : "error" }} href={financialStatements ? reportRoute(organizationId, financialStatements) : financeHref(organizationId, "/finance/statements")} icon={LineChart} />
            <SummaryCard eyebrow="Accounting control" title="Trial balance" value={state.trial?.ok ? (trial.balanced ? "Balanced" : money(trial.difference, currency)) : "Unavailable"} secondary={state.trial?.ok ? `${trial.accountCount || 0} accounts · Debits ${money(trial.totalDebits, currency)} · Credits ${money(trial.totalCredits, currency)}` : state.trial?.error || "Trial-balance source unavailable"} state={{ label: state.trial?.ok ? (trial.balanced ? "Controlled" : "Review difference") : "Source error", tone: state.trial?.ok ? (trial.balanced ? "ready" : "error") : "error" }} href={trialBalance ? reportRoute(organizationId, trialBalance) : financeHref(organizationId, "/finance/trial-balance")} icon={BookOpenCheck} />
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
          <section className="rounded-[22px] border border-black/[0.07] bg-white p-4 md:p-5">
            <div><div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">Reporting library</div><h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em]">Reports by accounting purpose</h2><div className="mt-0.5 text-[9px] text-[#918B83]">Deterministic capability mapping keeps reporting stable even when registry wording changes.</div></div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {familyRows.map((family) => <div key={family.id} className="overflow-hidden rounded-xl border border-black/[0.065] bg-[#FCFBF9]"><div className="border-b border-black/[0.055] px-3.5 py-3"><div className="text-[9px] font-semibold text-[#4A4640]">{family.label}</div><div className="mt-0.5 text-[7px] leading-3.5 text-[#99938A]">{family.description}</div></div><div className="divide-y divide-black/[0.05] bg-white">{family.items.map((item) => <CapabilityRow key={item.id} item={item} organizationId={organizationId} onOpen={remember} />)}</div></div>)}
            </div>
            {!familyRows.length ? <div className="mt-3 rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-6 text-center text-[9px] text-[#918B83]">No reporting capability matches this search.</div> : null}
          </section>

          <div className="space-y-4">
            <section className="rounded-[22px] border border-black/[0.07] bg-white p-4 md:p-5">
              <div className="flex items-start justify-between gap-3"><div><div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">Reporting controls</div><h2 className="mt-1 text-[15px] font-semibold">Can I rely on this period?</h2></div><Gauge size={13} className="text-[#9A7045]" /></div>
              <div className="mt-3 divide-y divide-black/[0.055]">
                <Link href={financeHref(organizationId, "/finance/review")} className="flex items-center justify-between gap-3 py-2.5"><div><div className="text-[8px] font-semibold text-[#514C46]">Open review</div><div className="mt-0.5 text-[7px] text-[#99938A]">Accounting items still under review</div></div><span className={`text-[12px] font-semibold ${(command?.metrics?.review?.count || 0) > 0 ? "text-[#9A7045]" : "text-[#65765F]"}`}>{command?.metrics?.review?.count || 0}</span></Link>
                <Link href={financeHref(organizationId, "/finance/bank-reconciliation")} className="flex items-center justify-between gap-3 py-2.5"><div><div className="text-[8px] font-semibold text-[#514C46]">Reconciliation exceptions</div><div className="mt-0.5 text-[7px] text-[#99938A]">Bank controls requiring attention</div></div><span className={`text-[12px] font-semibold ${(command?.metrics?.reconciliation?.count || 0) > 0 ? "text-[#9A533D]" : "text-[#65765F]"}`}>{command?.metrics?.reconciliation?.count || 0}</span></Link>
                <Link href={financeHref(organizationId, "/finance/close")} className="flex items-center justify-between gap-3 py-2.5"><div><div className="text-[8px] font-semibold text-[#514C46]">Close progress</div><div className="mt-0.5 text-[7px] text-[#99938A]">Governed period-close completion</div></div><span className="text-[12px] font-semibold text-[#76583A]">{command?.metrics?.close?.progress || 0}%</span></Link>
              </div>
            </section>

            <section className="rounded-[22px] border border-black/[0.07] bg-white p-4 md:p-5">
              <div className="flex items-start justify-between gap-3"><div><div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">Recent reports</div><h2 className="mt-1 text-[15px] font-semibold">Continue where you were</h2></div><BarChart3 size={13} className="text-[#9A7045]" /></div>
              <div className="mt-3 divide-y divide-black/[0.055]">{recentItems.map((item) => <Link key={item.id} href={reportRoute(organizationId, item)} onClick={() => remember(item)} className="group flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><div className="truncate text-[8px] font-semibold text-[#514C46]">{item.name}</div><div className="mt-0.5 truncate text-[7px] text-[#99938A]">{item.description || "Finance report"}</div></div><ArrowRight size={8} className="shrink-0 text-[#B0AAA2] group-hover:text-[#8A633C]" /></Link>)}{!recentItems.length ? <div className="py-4 text-[8px] leading-4 text-[#918B83]">Reports you open from this desk will appear here. This is browser-local recency, not fabricated usage analytics.</div> : null}</div>
            </section>
          </div>
        </div>

        <div className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] px-3 py-2.5 text-[8px] leading-4 text-[#817D76]">The reporting pulse reads the same canonical P&amp;L, balance-sheet, cash-flow and trial-balance runtimes used by Finance report workspaces. The landing page only prioritizes and explains those outputs; it does not create a second reporting ledger.</div>
      </> : null}
    </div>
  );
}
