"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  ChevronRight,
  Clock3,
  RefreshCw,
  Search,
} from "lucide-react";

import WorkspaceEventHub from "@/components/workspace/WorkspaceEventHub";

function text(value) {
  return String(value ?? "").trim();
}

function date(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function dateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function money(value, currencyCode) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode || "THB",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${currencyCode || ""} ${numeric.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`.trim();
  }
}

function freshnessTone(value) {
  switch (text(value).toUpperCase()) {
    case "CURRENT":
      return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
    case "AGING":
      return "border-amber-700/15 bg-amber-50 text-amber-900";
    case "STALE":
    case "NO_BANK_EVIDENCE":
      return "border-red-700/15 bg-red-50 text-red-800";
    default:
      return "border-black/[0.08] bg-[#F7F6F3] text-[#706B63]";
  }
}

function freshnessLabel(value) {
  const normalized = text(value).toUpperCase();
  if (normalized === "NO_BANK_EVIDENCE") return "No bank evidence";
  if (normalized === "CURRENT") return "Current";
  if (normalized === "AGING") return "Aging";
  if (normalized === "STALE") return "Stale";
  return normalized || "Unknown";
}

function positionBasisLabel(value) {
  switch (text(value).toUpperCase()) {
    case "STATEMENT_PLUS_POSTED_ACTIVITY":
      return "Statement + posted activity";
    case "STATEMENT":
      return "Statement balance";
    case "LEDGER_ONLY":
      return "Ledger only";
    case "NO_EVIDENCE":
      return "No balance evidence";
    default:
      return text(value) || "Unknown basis";
  }
}

async function loadJson(url) {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) {
    throw new Error(body?.error || `Request failed (${response.status})`);
  }
  return body;
}

function movementSearchText(row) {
  return [
    row?.transaction_type,
    row?.reference_number,
    row?.source_document,
    row?.currency_code,
    row?.direction,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function accountSearchText(row) {
  return [
    row?.bank_name,
    row?.account_name,
    row?.account_number,
    row?.currency_code,
    row?.freshness,
    row?.position_basis,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function MiniPill({ children, tone = "neutral" }) {
  const classes = tone === "warning"
    ? "border-amber-700/15 bg-amber-50 text-amber-900"
    : tone === "danger"
      ? "border-red-700/15 bg-red-50 text-red-800"
      : tone === "success"
        ? "border-emerald-700/15 bg-emerald-50 text-emerald-800"
        : "border-black/[0.08] bg-[#F7F6F3] text-[#706B63]";
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${classes}`}>
      {children}
    </span>
  );
}

export default function FinanceCashManagementWorkCenter({
  capability,
  organizationId,
  entityId,
  periodId,
}) {
  const searchRef = useRef(null);
  const [data, setData] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [movementQuery, setMovementQuery] = useState("");
  const [flowTab, setFlowTab] = useState("receivables");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(value => value + 1), []);

  useEffect(() => {
    if (!organizationId || !entityId) {
      setData(null);
      setSelectedAccountId(null);
      return;
    }

    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError("");
        const url = new URL("/api/finance/cash-management/runtime", window.location.origin);
        url.searchParams.set("organizationId", organizationId);
        url.searchParams.set("entityId", entityId);
        const body = await loadJson(url.toString());
        if (!active) return;
        setData(body);
        const accounts = Array.isArray(body?.accounts) ? body.accounts : [];
        setSelectedAccountId(current =>
          current && accounts.some(account => account.id === current)
            ? current
            : accounts[0]?.id || null
        );
      } catch (loadError) {
        if (active) {
          setData(null);
          setSelectedAccountId(null);
          setError(loadError?.message || "Cash position could not be loaded");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [entityId, organizationId, refreshKey]);

  const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
  const currencies = useMemo(
    () => [...new Set(accounts.map(account => account.currency_code).filter(Boolean))].sort(),
    [accounts]
  );

  const visibleAccounts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return accounts.filter(account => {
      if (currencyFilter && account.currency_code !== currencyFilter) return false;
      if (needle && !accountSearchText(account).includes(needle)) return false;
      return true;
    });
  }, [accounts, currencyFilter, query]);

  const selectedAccount =
    visibleAccounts.find(account => account.id === selectedAccountId) ||
    visibleAccounts[0] ||
    null;

  const movements = useMemo(() => {
    const rows = Array.isArray(selectedAccount?.recent_movements)
      ? selectedAccount.recent_movements
      : [];
    const needle = movementQuery.trim().toLowerCase();
    return needle ? rows.filter(row => movementSearchText(row).includes(needle)) : rows;
  }, [movementQuery, selectedAccount]);

  const selectedCurrencyPosition = useMemo(
    () => (data?.currency_positions || []).find(
      position => position.currency_code === selectedAccount?.currency_code
    ) || null,
    [data?.currency_positions, selectedAccount?.currency_code]
  );

  useEffect(() => {
    function onKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase();
      if (["input", "textarea", "select"].includes(tag)) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp"].includes(event.key) || !visibleAccounts.length) return;
      event.preventDefault();
      const index = Math.max(0, visibleAccounts.findIndex(account => account.id === selectedAccount?.id));
      const next = event.key === "ArrowDown"
        ? Math.min(visibleAccounts.length - 1, index + 1)
        : Math.max(0, index - 1);
      setSelectedAccountId(visibleAccounts[next]?.id || null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedAccount?.id, visibleAccounts]);

  const navigateFinance = useCallback((route) => {
    if (!organizationId) return;
    window.location.assign(`/workspace/${organizationId}/finance/${route}`);
  }, [organizationId]);

  const exceptionCount = data?.exceptions
    ? Object.values(data.exceptions).reduce((sum, value) => sum + Number(value || 0), 0)
    : 0;

  const flowRows = flowTab === "receivables"
    ? (data?.receivables || [])
    : (data?.payables || []);

  return (
    <main className="min-h-[calc(100vh-112px)] bg-[#F7F6F3] text-[#1B1A18]">
      <div className="mx-auto max-w-[1760px] px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
        <header className="sticky top-0 z-20 -mx-4 border-b border-black/[0.07] bg-[#F7F6F3]/95 px-4 pb-4 backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.21em] text-[#9A7045]">
                <span>Finance</span><span className="text-black/20">/</span><span>Treasury</span>
              </div>
              <h1 className="mt-1.5 text-[27px] font-semibold tracking-[-0.035em] sm:text-[30px]">
                {capability?.name || "Cash Management"}
              </h1>
              <p className="mt-1 max-w-4xl text-[12px] leading-5 text-[#777169]">
                Daily cash position by bank account and currency, grounded in imported statement evidence and scheduled receivables and payables.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <MiniPill>Legal entity scoped</MiniPill>
                <MiniPill>Currency separated</MiniPill>
                <MiniPill>↑ ↓ navigate · / search</MiniPill>
                {data?.generated_at ? <MiniPill>As of {dateTime(data.generated_at)}</MiniPill> : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => navigateFinance("bank-statements")}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/[0.09] bg-white px-3 text-[11px] font-medium text-[#56514A] transition hover:border-[#D6A66A]/45"
              >
                Bank Statements
              </button>
              <button
                type="button"
                onClick={() => navigateFinance("bank-reconciliation")}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/[0.09] bg-white px-3 text-[11px] font-medium text-[#56514A] transition hover:border-[#D6A66A]/45"
              >
                Reconciliation
              </button>
              <button
                type="button"
                onClick={refresh}
                disabled={loading}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1F1E1B] px-3.5 text-[11px] font-semibold text-white transition hover:bg-black disabled:opacity-45"
              >
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh position
              </button>
            </div>
          </div>
        </header>

        {!organizationId || !entityId ? (
          <section className="mt-4 rounded-xl border border-amber-700/15 bg-amber-50 p-4 text-[12px] text-amber-900">
            Select a legal entity before working with cash positions.
          </section>
        ) : error ? (
          <section className="mt-4 rounded-xl border border-red-700/15 bg-red-50 p-4 text-[12px] text-red-800">
            {error}
          </section>
        ) : (
          <>
            <section className="mt-4 rounded-xl border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="flex flex-col gap-3 border-b border-black/[0.07] p-3 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-black/[0.08] bg-[#FAF9F7] px-3">
                  <Search size={14} className="text-[#9A958D]" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="Search bank account, currency or evidence status…"
                    className="h-9 min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#AAA59D]"
                  />
                </div>
                <select
                  value={currencyFilter}
                  onChange={event => setCurrencyFilter(event.target.value)}
                  className="h-9 rounded-lg border border-black/[0.08] bg-white px-3 text-[10px] text-[#625D56] outline-none"
                >
                  <option value="">All currencies</option>
                  {currencies.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#716D66]">
                  <span>{visibleAccounts.length} bank accounts</span>
                  <span className="text-black/20">·</span>
                  <span>{(data?.currency_positions || []).length} currencies</span>
                  {exceptionCount ? (
                    <>
                      <span className="text-black/20">·</span>
                      <span className="font-semibold text-amber-800">{exceptionCount} items need attention</span>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-[11px]">
                  <thead className="border-b border-black/[0.07] bg-[#FAF9F7] text-[9px] font-semibold uppercase tracking-[0.12em] text-[#858078]">
                    <tr>
                      <th className="px-3 py-2.5">Bank account</th>
                      <th className="px-3 py-2.5">Currency</th>
                      <th className="px-3 py-2.5 text-right">Working balance</th>
                      <th className="px-3 py-2.5">Evidence</th>
                      <th className="px-3 py-2.5">Last statement</th>
                      <th className="px-3 py-2.5 text-right">Unreconciled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && !data ? (
                      <tr><td colSpan={6} className="px-3 py-8 text-center text-[12px] text-[#817B73]">Loading bank evidence and scheduled cash flows…</td></tr>
                    ) : visibleAccounts.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-8 text-center text-[12px] text-[#817B73]">No bank accounts match this view.</td></tr>
                    ) : visibleAccounts.map(account => {
                      const selected = account.id === selectedAccount?.id;
                      return (
                        <tr
                          key={account.id}
                          onClick={() => setSelectedAccountId(account.id)}
                          className={`cursor-pointer border-b border-black/[0.05] transition ${selected ? "bg-[#F5EFE6]" : "hover:bg-[#FAF9F7]"}`}
                        >
                          <td className="px-3 py-3">
                            <div className="font-semibold text-[#302E2A]">{account.account_name}</div>
                            <div className="mt-0.5 text-[10px] text-[#8B857D]">
                              {[account.bank_name, account.account_number].filter(Boolean).join(" · ") || "—"}
                            </div>
                          </td>
                          <td className="px-3 py-3 font-medium">{account.currency_code}</td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums">
                            {money(account.working_balance, account.currency_code)}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`rounded-md border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${freshnessTone(account.freshness)}`}>
                                {freshnessLabel(account.freshness)}
                              </span>
                              {account.position_basis === "LEDGER_ONLY" ? <MiniPill tone="warning">Ledger only</MiniPill> : null}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div>{date(account.statement_date)}</div>
                            <div className="mt-0.5 text-[10px] text-[#8B857D]">
                              {account.statement_age_days === null ? "No imported statement" : `${account.statement_age_days} days old`}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            <span className={account.unreconciled_count ? "font-semibold text-amber-800" : "text-[#777169]"}>
                              {account.unreconciled_count || 0}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="mt-3 grid min-h-[610px] gap-3 xl:grid-cols-[minmax(0,1.25fr)_430px] 2xl:grid-cols-[minmax(0,1.35fr)_470px]">
              <section className="min-w-0 overflow-hidden rounded-xl border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <div className="border-b border-black/[0.07] px-4 py-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#9A7045]">Cash position</div>
                      <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.02em]">
                        {selectedAccount?.account_name || "Select a bank account"}
                      </h2>
                      {selectedAccount ? (
                        <p className="mt-1 text-[10px] text-[#817B73]">
                          {positionBasisLabel(selectedAccount.position_basis)} · {selectedAccount.currency_code} · latest statement {date(selectedAccount.statement_date)}
                        </p>
                      ) : null}
                    </div>
                    {selectedAccount ? (
                      <div className="text-right">
                        <div className="text-[9px] uppercase tracking-[0.12em] text-[#9A958D]">Working balance</div>
                        <div className="mt-1 text-[22px] font-semibold tracking-[-0.03em] tabular-nums">
                          {money(selectedAccount.working_balance, selectedAccount.currency_code)}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {selectedCurrencyPosition ? (
                  <div className="grid border-b border-black/[0.07] sm:grid-cols-3">
                    <div className="border-b border-black/[0.06] px-4 py-3 sm:border-b-0 sm:border-r">
                      <div className="text-[9px] uppercase tracking-[0.12em] text-[#9A958D]">Bank position</div>
                      <div className="mt-1 text-[14px] font-semibold tabular-nums">{money(selectedCurrencyPosition.bank_position, selectedCurrencyPosition.currency_code)}</div>
                    </div>
                    <div className="border-b border-black/[0.06] px-4 py-3 sm:border-b-0 sm:border-r">
                      <div className="text-[9px] uppercase tracking-[0.12em] text-[#9A958D]">Scheduled position · 7d</div>
                      <div className="mt-1 text-[14px] font-semibold tabular-nums">{money(selectedCurrencyPosition.scheduled_position_7d, selectedCurrencyPosition.currency_code)}</div>
                    </div>
                    <div className="px-4 py-3">
                      <div className="text-[9px] uppercase tracking-[0.12em] text-[#9A958D]">Scheduled position · 30d</div>
                      <div className="mt-1 text-[14px] font-semibold tabular-nums">{money(selectedCurrencyPosition.scheduled_position_30d, selectedCurrencyPosition.currency_code)}</div>
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-between border-b border-black/[0.07] px-4 py-3">
                  <div>
                    <h3 className="text-[12px] font-semibold">Recent bank activity</h3>
                    <p className="mt-0.5 text-[10px] text-[#8B857D]">Actual bank-ledger evidence for the selected account.</p>
                  </div>
                  <div className="flex w-[260px] items-center gap-2 rounded-lg border border-black/[0.08] bg-[#FAF9F7] px-3">
                    <Search size={12} className="text-[#9A958D]" />
                    <input
                      value={movementQuery}
                      onChange={event => setMovementQuery(event.target.value)}
                      placeholder="Search activity…"
                      className="h-8 min-w-0 flex-1 bg-transparent text-[10px] outline-none placeholder:text-[#AAA59D]"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-left text-[10px]">
                    <thead className="border-b border-black/[0.07] bg-[#FAF9F7] text-[9px] font-semibold uppercase tracking-[0.11em] text-[#858078]">
                      <tr>
                        <th className="px-4 py-2.5">When</th>
                        <th className="px-4 py-2.5">Type / reference</th>
                        <th className="px-4 py-2.5">Reconciliation</th>
                        <th className="px-4 py-2.5 text-right">Movement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!selectedAccount ? (
                        <tr><td colSpan={4} className="px-4 py-8 text-center text-[11px] text-[#817B73]">Select a bank account to inspect its evidence.</td></tr>
                      ) : movements.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-8 text-center text-[11px] text-[#817B73]">No bank-ledger activity is available for this account.</td></tr>
                      ) : movements.map(row => {
                        const inbound = Number(row.signed_amount || 0) >= 0;
                        const reconciled = Boolean(row.reconciled_at || row.reconciled_statement_id);
                        return (
                          <tr key={row.id} className="border-b border-black/[0.05]">
                            <td className="whitespace-nowrap px-4 py-3 text-[#625D56]">{dateTime(row.created_at)}</td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-[#302E2A]">{text(row.transaction_type) || text(row.source_document) || "Bank movement"}</div>
                              <div className="mt-0.5 text-[9px] text-[#8B857D]">{row.reference_number || row.source_document || "—"}</div>
                            </td>
                            <td className="px-4 py-3">
                              <MiniPill tone={reconciled ? "success" : "warning"}>{reconciled ? "Reconciled" : "Unreconciled"}</MiniPill>
                            </td>
                            <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${inbound ? "text-emerald-800" : "text-[#302E2A]"}`}>
                              <span className="inline-flex items-center gap-1">
                                {inbound ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}
                                {money(Math.abs(Number(row.signed_amount || 0)), row.currency_code || selectedAccount.currency_code)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <aside className="min-w-0 overflow-hidden rounded-xl border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <div className="border-b border-black/[0.07] px-4 py-3">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#9A7045]">Treasury worksheet</div>
                  <h2 className="mt-1 text-[16px] font-semibold">Expected cash & exceptions</h2>
                </div>

                {selectedCurrencyPosition ? (
                  <div className="border-b border-black/[0.07] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#817B73]">{selectedCurrencyPosition.currency_code} next 30 days</span>
                      {selectedCurrencyPosition.incomplete_bank_position ? <MiniPill tone="warning">Incomplete bank evidence</MiniPill> : <MiniPill tone="success">Bank evidence available</MiniPill>}
                    </div>
                    <div className="space-y-2 text-[11px]">
                      <div className="flex items-center justify-between"><span className="text-[#777169]">Overdue receipts</span><strong>{money(selectedCurrencyPosition.overdue_receipts, selectedCurrencyPosition.currency_code)}</strong></div>
                      <div className="flex items-center justify-between"><span className="text-[#777169]">Receipts due 7d</span><strong>{money(selectedCurrencyPosition.due_7d_receipts, selectedCurrencyPosition.currency_code)}</strong></div>
                      <div className="flex items-center justify-between"><span className="text-[#777169]">Receipts due 8–30d</span><strong>{money(selectedCurrencyPosition.due_30d_receipts, selectedCurrencyPosition.currency_code)}</strong></div>
                      <div className="my-2 border-t border-black/[0.06]" />
                      <div className="flex items-center justify-between"><span className="text-[#777169]">Overdue payments</span><strong>{money(selectedCurrencyPosition.overdue_payments, selectedCurrencyPosition.currency_code)}</strong></div>
                      <div className="flex items-center justify-between"><span className="text-[#777169]">Payments due 7d</span><strong>{money(selectedCurrencyPosition.due_7d_payments, selectedCurrencyPosition.currency_code)}</strong></div>
                      <div className="flex items-center justify-between"><span className="text-[#777169]">Payments due 8–30d</span><strong>{money(selectedCurrencyPosition.due_30d_payments, selectedCurrencyPosition.currency_code)}</strong></div>
                      {selectedCurrencyPosition.held_payments > 0 ? (
                        <div className="flex items-center justify-between text-amber-800"><span>Payments on hold</span><strong>{money(selectedCurrencyPosition.held_payments, selectedCurrencyPosition.currency_code)}</strong></div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="border-b border-black/[0.07] p-3">
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#F5F3EF] p-1">
                    <button
                      type="button"
                      onClick={() => setFlowTab("receivables")}
                      className={`rounded-md px-3 py-2 text-[10px] font-semibold ${flowTab === "receivables" ? "bg-white text-[#1F1E1B] shadow-sm" : "text-[#777169]"}`}
                    >
                      Receivables
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlowTab("payables")}
                      className={`rounded-md px-3 py-2 text-[10px] font-semibold ${flowTab === "payables" ? "bg-white text-[#1F1E1B] shadow-sm" : "text-[#777169]"}`}
                    >
                      Payables
                    </button>
                  </div>
                </div>

                <div className="max-h-[330px] overflow-y-auto">
                  {flowRows.length === 0 ? (
                    <div className="p-6 text-center text-[10px] text-[#817B73]">No outstanding {flowTab} are currently in the schedule.</div>
                  ) : flowRows.slice(0, 30).map(row => {
                    const currencyCode = row.currency_code || "THB";
                    const held = row.payment_hold === true;
                    return (
                      <div key={row.id} className="border-b border-black/[0.05] px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[10px] font-semibold text-[#302E2A]">{row.document_number || row.vendor_invoice_id || (flowTab === "receivables" ? "Receivable" : "Payable")}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] text-[#8B857D]">
                              <span>Due {date(row.due_date)}</span>
                              <span>·</span>
                              <span>{text(row.status) || "Open"}</span>
                              {held ? <MiniPill tone="warning">On hold</MiniPill> : null}
                            </div>
                          </div>
                          <div className="whitespace-nowrap text-[10px] font-semibold tabular-nums">{money(row.outstanding_amount, currencyCode)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-black/[0.07] p-4">
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold text-[#4F4A43]"><AlertTriangle size={12} /> Attention</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[9px] text-[#777169]">
                    <span>Stale bank evidence</span><strong className="text-right text-[#302E2A]">{data?.exceptions?.stale_bank_evidence || 0}</strong>
                    <span>Missing bank evidence</span><strong className="text-right text-[#302E2A]">{data?.exceptions?.missing_bank_evidence || 0}</strong>
                    <span>Unreconciled movements</span><strong className="text-right text-[#302E2A]">{data?.exceptions?.unreconciled_bank_movements || 0}</strong>
                    <span>Overdue receivables</span><strong className="text-right text-[#302E2A]">{data?.exceptions?.overdue_receivables || 0}</strong>
                    <span>Overdue payables</span><strong className="text-right text-[#302E2A]">{data?.exceptions?.overdue_payables || 0}</strong>
                    <span>Held payables</span><strong className="text-right text-[#302E2A]">{data?.exceptions?.held_payables || 0}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateFinance("bank-reconciliation")}
                    className="mt-4 flex w-full items-center justify-between rounded-lg border border-black/[0.08] bg-[#FAF9F7] px-3 py-2.5 text-[10px] font-semibold text-[#4F4A43] transition hover:border-[#D6A66A]/45"
                  >
                    Resolve bank exceptions <ChevronRight size={13} />
                  </button>
                </div>
              </aside>
            </div>

            <section className="mt-3 flex flex-col gap-2 rounded-xl border border-black/[0.07] bg-white px-4 py-3 text-[9px] leading-4 text-[#817B73] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2"><Banknote size={12} /> {data?.methodology?.bank_position}</div>
              <div className="flex items-center gap-2"><Clock3 size={12} /> {data?.methodology?.scheduled_position}</div>
            </section>
          </>
        )}
      </div>
      <WorkspaceEventHub organizationId={organizationId} entityId={entityId} periodId={periodId} />
    </main>
  );
}
