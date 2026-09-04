"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CircleAlert,
  Landmark,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";

import RowActionEngine from "@/components/workspace/engines/RowActionEngine";
import WorkspaceEventHub from "@/components/workspace/WorkspaceEventHub";
import FinanceRecordReviewPanel from "@/components/workspace/finance/FinanceRecordReviewPanel";
import { resolveFinanceActionPresentation } from "@/lib/finance/actions/resolveFinanceAction";

function list(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.entries(value).map(([id, action]) => ({ id, ...(action || {}) }));
  }
  return [];
}

function text(value) {
  return String(value ?? "").trim();
}

function label(value) {
  return text(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function numeric(value) {
  const resolved = Number(value);
  return Number.isFinite(resolved) ? resolved : 0;
}

function differenceOf(row) {
  if (!row) return 0;
  if (row.difference_amount !== null && row.difference_amount !== undefined) {
    return numeric(row.difference_amount);
  }
  if (row.difference !== null && row.difference !== undefined) {
    return numeric(row.difference);
  }
  return numeric(row.statement_closing_balance) - numeric(row.book_closing_balance);
}

function isReconciled(row) {
  const status = text(row?.status).toUpperCase();
  return status === "RECONCILED" || Math.abs(differenceOf(row)) < 0.005;
}

function formatDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatMoney(value, currencyCode) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  if (currencyCode) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      // Fall through to a neutral accounting number if the stored code is not ISO-compatible.
    }
  }
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function accountTitle(account) {
  return text(
    account?.account_name ||
    account?.display_name ||
    account?.bank_name ||
    account?.name ||
    "Bank account"
  );
}

function accountSecondary(account) {
  const parts = [
    account?.bank_name && account?.bank_name !== accountTitle(account) ? account.bank_name : null,
    account?.account_number_masked || account?.masked_account_number || account?.last_four,
    account?.currency_code || account?.currency,
  ].filter(Boolean);
  return parts.join(" · ");
}

function accountFallback(row) {
  const value = text(row?.bank_account_id);
  if (!value) return "Bank account";
  return `Account ${value.slice(0, 8)}`;
}

function statusTone(row) {
  return isReconciled(row)
    ? "border-emerald-700/15 bg-emerald-50 text-emerald-800"
    : "border-amber-700/15 bg-amber-50 text-amber-900";
}

function ContextChip({ children }) {
  if (!children) return null;
  return (
    <span className="rounded-full border border-black/[0.08] bg-white px-2.5 py-1 text-[10px] text-[#716D66]">
      {children}
    </span>
  );
}

function MetricCard({ label: metricLabel, value, detail, emphasis = false, positive = false, warning = false }) {
  const valueTone = positive
    ? "text-emerald-800"
    : warning
      ? "text-amber-900"
      : "text-[#2E2A25]";

  return (
    <div className={`min-w-0 border-r border-black/[0.06] px-4 py-3 last:border-r-0 ${emphasis ? "bg-[#FBF7F0]" : ""}`}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#918B83]">{metricLabel}</div>
      <div className={`mt-1.5 truncate tabular-nums ${emphasis ? "text-[22px]" : "text-[18px]"} font-semibold tracking-[-0.025em] ${valueTone}`}>
        {value}
      </div>
      <div className="mt-0.5 truncate text-[9px] text-[#989188]">{detail}</div>
    </div>
  );
}

function QueueTab({ active, count, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-2 border-b-2 px-1 text-[10px] font-medium transition ${
        active
          ? "border-[#B18150] text-[#403B35]"
          : "border-transparent text-[#8E887F] hover:text-[#5C5750]"
      }`}
    >
      {children}
      <span className={`rounded-full px-1.5 py-0.5 text-[8px] ${active ? "bg-[#D6A66A]/15 text-[#7C5834]" : "bg-black/[0.045] text-[#8E887F]"}`}>
        {count}
      </span>
    </button>
  );
}

export default function FinanceBankReconciliationWorkCenter({
  capability,
  organizationId,
  entityId,
  periodId,
}) {
  const presentation = capability?.ui?.financePresentation || capability?.runtime?.financePresentation || {};
  const api = capability?.runtime?.listApi || capability?.ui?.api || "/api/finance/reconciliation/runtime";
  const contextReady = Boolean(organizationId && entityId);
  const searchRef = useRef(null);

  const actions = useMemo(
    () => list(capability?.topMenu || capability?.ui?.topMenu || capability?.actions)
      .filter((action) => action?.endpoint || action?.api || action?.engine || action?.capability),
    [capability]
  );
  const primaryAction = actions.find((action) => action?.id === "run_reconciliation") || actions[0] || null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState("");
  const [queue, setQueue] = useState("attention");
  const [accountFilter, setAccountFilter] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [activeEngine, setActiveEngine] = useState(null);

  useEffect(() => {
    if (!contextReady) {
      setRows([]);
      setBankAccounts([]);
      setLoading(false);
      return;
    }

    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError("");

        const reconciliationUrl = new URL(api, window.location.origin);
        reconciliationUrl.searchParams.set("organizationId", organizationId);
        reconciliationUrl.searchParams.set("entityId", entityId);
        if (periodId) reconciliationUrl.searchParams.set("periodId", periodId);

        const accountsUrl = new URL("/api/finance/bank-accounts", window.location.origin);
        accountsUrl.searchParams.set("organizationId", organizationId);

        const [reconciliationResponse, accountsResponse] = await Promise.all([
          fetch(reconciliationUrl.toString(), { cache: "no-store", credentials: "include" }),
          fetch(accountsUrl.toString(), { cache: "no-store", credentials: "include" }),
        ]);

        const reconciliationBody = await reconciliationResponse.json().catch(() => ({}));
        const accountsBody = await accountsResponse.json().catch(() => ({}));

        if (!reconciliationResponse.ok || reconciliationBody?.success === false) {
          throw new Error(reconciliationBody?.error || `Reconciliation load failed (${reconciliationResponse.status})`);
        }

        if (!active) return;

        const loadedRows = Array.isArray(reconciliationBody?.data)
          ? reconciliationBody.data
          : Array.isArray(reconciliationBody?.rows)
            ? reconciliationBody.rows
            : [];
        const loadedAccounts = accountsResponse.ok && accountsBody?.success !== false
          ? (Array.isArray(accountsBody?.bankAccounts) ? accountsBody.bankAccounts : (Array.isArray(accountsBody?.rows) ? accountsBody.rows : []))
          : [];

        setRows(loadedRows);
        setBankAccounts(loadedAccounts);
        setSelectedId((current) => current && loadedRows.some((row) => row?.id === current)
          ? current
          : loadedRows[0]?.id || null);
      } catch (loadError) {
        if (active) {
          setRows([]);
          setError(loadError?.message || "Reconciliation load failed");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [api, contextReady, organizationId, entityId, periodId, refreshKey]);

  const entityAccounts = useMemo(
    () => bankAccounts.filter((account) => !entityId || !account?.entity_id || account.entity_id === entityId),
    [bankAccounts, entityId]
  );

  const accountMap = useMemo(
    () => new Map(bankAccounts.filter((account) => account?.id).map((account) => [account.id, account])),
    [bankAccounts]
  );

  const normalizedRows = useMemo(
    () => rows.map((row) => {
      const account = accountMap.get(row?.bank_account_id) || null;
      const resolvedName = account ? accountTitle(account) : accountFallback(row);
      return {
        ...row,
        account_name: row?.account_name || resolvedName,
        bank_account_name: row?.bank_account_name || resolvedName,
        currency_code: row?.currency_code || account?.currency_code || account?.currency || null,
      };
    }),
    [rows, accountMap]
  );

  const attentionRows = useMemo(() => normalizedRows.filter((row) => !isReconciled(row)), [normalizedRows]);
  const reconciledRows = useMemo(() => normalizedRows.filter(isReconciled), [normalizedRows]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const source = queue === "attention" ? attentionRows : queue === "reconciled" ? reconciledRows : normalizedRows;
    return source.filter((row) => {
      if (accountFilter && row?.bank_account_id !== accountFilter) return false;
      if (!needle) return true;
      return [
        row?.account_name,
        row?.bank_account_name,
        row?.reconciliation_date,
        row?.status,
        row?.notes,
        row?.bank_statement_id,
      ].some((value) => text(value).toLowerCase().includes(needle));
    });
  }, [normalizedRows, attentionRows, reconciledRows, queue, accountFilter, query]);

  const selected = filteredRows.find((row) => row?.id === selectedId) || filteredRows[0] || null;
  const selectedAccount = selected ? accountMap.get(selected.bank_account_id) || null : null;
  const selectedCurrency = selected?.currency_code || selectedAccount?.currency_code || selectedAccount?.currency || null;
  const selectedDifference = differenceOf(selected);
  const selectedReconciled = isReconciled(selected);

  useEffect(() => {
    function handleKeydown(event) {
      const tag = event.target?.tagName?.toLowerCase();
      if (["input", "textarea", "select"].includes(tag)) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp"].includes(event.key) || filteredRows.length === 0) return;
      event.preventDefault();
      const index = Math.max(0, filteredRows.findIndex((row) => row?.id === selected?.id));
      const nextIndex = event.key === "ArrowDown"
        ? Math.min(filteredRows.length - 1, index + 1)
        : Math.max(0, index - 1);
      setSelectedId(filteredRows[nextIndex]?.id || null);
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [filteredRows, selected]);

  function refresh() {
    setRefreshKey((value) => value + 1);
  }

  function startReconciliation() {
    if (!primaryAction || !contextReady) return;
    const action = resolveFinanceActionPresentation(primaryAction) || primaryAction;
    setActiveEngine({ action, row: null });
  }

  return (
    <main className="min-h-[calc(100vh-112px)] bg-[#F7F6F3] text-[#1B1A18]">
      <div className="mx-auto max-w-[1760px] px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
        <header className="sticky top-0 z-20 -mx-4 border-b border-black/[0.07] bg-[#F7F6F3]/95 px-4 pb-4 backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.21em] text-[#9A7045]">
                <span>Finance</span><span className="text-black/20">/</span><span>{presentation.family_label || "Treasury"}</span>
              </div>
              <h1 className="mt-1.5 text-[27px] font-semibold tracking-[-0.035em] text-[#1B1A18] sm:text-[30px]">Bank Reconciliation</h1>
              <p className="mt-1 max-w-4xl text-[12px] leading-5 text-[#777169]">
                Close the bank-to-ledger gap, isolate runs that need attention, and leave a reviewable accounting trail.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <ContextChip>{presentation.review_label || "Review cash and reconciliation exceptions"}</ContextChip>
                <ContextChip>Legal entity scoped</ContextChip>
                {periodId ? <ContextChip>Accounting period selected</ContextChip> : null}
                <ContextChip>↑ ↓ navigate · / search</ContextChip>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={refresh}
                disabled={loading || !contextReady}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/[0.09] bg-white px-3 text-[11px] font-medium text-[#56514A] transition hover:border-[#D6A66A]/45 disabled:opacity-45"
              >
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
              <button
                type="button"
                onClick={startReconciliation}
                disabled={!primaryAction || !contextReady}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1F1E1B] px-3.5 text-[11px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Play size={12} /> {primaryAction?.label || "Start Reconciliation"}
              </button>
            </div>
          </div>
        </header>

        {!contextReady ? (
          <section className="mt-4 rounded-xl border border-amber-700/15 bg-amber-50 p-4 text-[12px] text-amber-900">
            Select a legal entity before working with bank reconciliation.
          </section>
        ) : (
          <>
            {error ? (
              <section className="mt-4 flex items-start gap-3 rounded-xl border border-red-700/15 bg-red-50 p-4 text-red-900">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-700" />
                <div><div className="text-[11px] font-semibold">Reconciliation data could not be loaded</div><div className="mt-1 text-[10px] leading-5 text-red-800/80">{error}</div></div>
              </section>
            ) : null}

            <section className="mt-4 overflow-hidden rounded-xl border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="grid divide-y divide-black/[0.06] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
                <MetricCard
                  label="Statement balance"
                  value={selected ? formatMoney(selected.statement_closing_balance, selectedCurrency) : "—"}
                  detail={selected ? `Selected run · ${formatDate(selected.reconciliation_date)}` : "No reconciliation selected"}
                />
                <MetricCard
                  label="Book balance"
                  value={selected ? formatMoney(selected.book_closing_balance, selectedCurrency) : "—"}
                  detail="Posted ledger through reconciliation date"
                />
                <MetricCard
                  label="Difference"
                  value={selected ? formatMoney(selectedDifference, selectedCurrency) : "—"}
                  detail={selected ? "Statement − ledger" : "Target: 0.00"}
                  emphasis
                  positive={Boolean(selected && selectedReconciled)}
                  warning={Boolean(selected && !selectedReconciled)}
                />
                <MetricCard
                  label="Review state"
                  value={selected ? (selectedReconciled ? "Reconciled" : "Needs attention") : "No run"}
                  detail={selected ? `${attentionRows.length} open · ${reconciledRows.length} reconciled` : `${entityAccounts.length} bank accounts available`}
                  positive={Boolean(selected && selectedReconciled)}
                  warning={Boolean(selected && !selectedReconciled)}
                />
              </div>
            </section>

            <section className="mt-3 rounded-xl border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="flex flex-col gap-3 border-b border-black/[0.06] px-4 py-2.5 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-center gap-4 overflow-x-auto">
                  <QueueTab active={queue === "attention"} count={attentionRows.length} onClick={() => setQueue("attention")}>Needs attention</QueueTab>
                  <QueueTab active={queue === "reconciled"} count={reconciledRows.length} onClick={() => setQueue("reconciled")}>Reconciled</QueueTab>
                  <QueueTab active={queue === "all"} count={normalizedRows.length} onClick={() => setQueue("all")}>All runs</QueueTab>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    value={accountFilter}
                    onChange={(event) => setAccountFilter(event.target.value)}
                    className="h-8 min-w-[190px] rounded-lg border border-black/[0.08] bg-[#FAF9F7] px-2.5 text-[10px] text-[#625D56] outline-none focus:border-[#B18150]/50"
                    aria-label="Filter by bank account"
                  >
                    <option value="">All bank accounts</option>
                    {entityAccounts.map((account) => (
                      <option key={account.id} value={account.id}>{accountTitle(account)}</option>
                    ))}
                  </select>
                  <label className="flex h-8 min-w-[240px] items-center gap-2 rounded-lg border border-black/[0.08] bg-[#FAF9F7] px-2.5 focus-within:border-[#B18150]/50">
                    <Search size={12} className="shrink-0 text-[#99938A]" />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search account, date, status or note"
                      className="w-full bg-transparent text-[10px] text-[#4E4942] outline-none placeholder:text-[#AAA49B]"
                    />
                  </label>
                </div>
              </div>

              {loading ? (
                <div className="flex min-h-[360px] items-center justify-center text-[10px] text-[#8B857D]">
                  <RefreshCw size={13} className="mr-2 animate-spin" /> Loading reconciliation evidence…
                </div>
              ) : normalizedRows.length === 0 ? (
                <div className="flex min-h-[360px] items-center justify-center px-6 py-10">
                  <div className="max-w-xl text-center">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-black/[0.07] bg-[#FAF9F7] text-[#8D877E]"><Landmark size={17} /></div>
                    <h2 className="mt-4 text-[16px] font-semibold tracking-[-0.02em] text-[#38342E]">No reconciliation run yet</h2>
                    <p className="mx-auto mt-1.5 max-w-md text-[10px] leading-5 text-[#817B73]">Choose the bank account, set the reconciliation date and statement closing balance, then Avantiqo calculates the posted-ledger balance and the difference.</p>
                    <button type="button" onClick={startReconciliation} disabled={!primaryAction} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-[#1F1E1B] px-3.5 text-[11px] font-semibold text-white disabled:opacity-40"><Play size={12} /> Start Reconciliation</button>
                    <div className="mt-5 grid gap-2 text-left sm:grid-cols-3">
                      {["Select bank account", "Enter statement balance", "Review the difference"].map((step, index) => (
                        <div key={step} className="rounded-lg border border-black/[0.06] bg-[#FAF9F7] px-3 py-2.5 text-[9px] text-[#716B63]"><span className="mr-2 font-semibold text-[#A27547]">{index + 1}</span>{step}</div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="flex min-h-[280px] items-center justify-center px-6 text-center text-[10px] text-[#8B857D]">
                  No reconciliation runs match the selected queue, account and search filters.
                </div>
              ) : (
                <div className="grid min-h-[560px] xl:grid-cols-[minmax(0,1.58fr)_minmax(360px,0.72fr)]">
                  <div className="min-w-0 overflow-x-auto border-r border-black/[0.06]">
                    <table className="min-w-[900px] w-full border-collapse text-[10px]">
                      <thead className="sticky top-0 z-10 bg-[#FAF9F7] text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8D877F]">
                        <tr className="border-b border-black/[0.06]">
                          <th className="px-3 py-2.5 text-left">Bank account</th>
                          <th className="px-3 py-2.5 text-left">Reconciliation date</th>
                          <th className="px-3 py-2.5 text-right">Statement</th>
                          <th className="px-3 py-2.5 text-right">Book</th>
                          <th className="px-3 py-2.5 text-right">Difference</th>
                          <th className="px-3 py-2.5 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((row, index) => {
                          const active = selected?.id === row?.id || (!row?.id && selected === row);
                          const account = accountMap.get(row?.bank_account_id) || null;
                          const currency = row?.currency_code || account?.currency_code || account?.currency || null;
                          const difference = differenceOf(row);
                          const reconciled = isReconciled(row);
                          return (
                            <tr
                              key={row?.id || `${row?.created_at || row?.reconciliation_date}-${index}`}
                              onClick={() => setSelectedId(row?.id || null)}
                              className={`cursor-pointer border-b border-black/[0.05] transition last:border-0 ${active ? "bg-[#D6A66A]/[0.09] shadow-[inset_3px_0_0_#B18150]" : "hover:bg-[#F8F6F1]"}`}
                            >
                              <td className="px-3 py-3">
                                <div className="min-w-[180px]"><div className="truncate font-medium text-[#35322D]">{account ? accountTitle(account) : accountFallback(row)}</div><div className="mt-0.5 truncate text-[9px] text-[#99938A]">{account ? (accountSecondary(account) || "Linked Finance bank account") : "Linked bank account"}</div></div>
                              </td>
                              <td className="px-3 py-3 text-[#615C54]">{formatDate(row?.reconciliation_date)}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-[#514C45]">{formatMoney(row?.statement_closing_balance, currency)}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-[#514C45]">{formatMoney(row?.book_closing_balance, currency)}</td>
                              <td className={`px-3 py-3 text-right font-semibold tabular-nums ${reconciled ? "text-emerald-800" : "text-amber-900"}`}>{formatMoney(difference, currency)}</td>
                              <td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-medium ${statusTone(row)}`}>{reconciled ? "Reconciled" : label(row?.status || "Open")}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <aside className="min-w-0 bg-white">
                    {selected ? (
                      <div className="border-b border-black/[0.07] bg-[#FCFBF8] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#9A7045]">Selected reconciliation</div>
                            <div className="mt-1 truncate text-[15px] font-semibold text-[#37332E]">{selected?.account_name || accountFallback(selected)}</div>
                            <div className="mt-0.5 text-[9px] text-[#918B83]">{formatDate(selected.reconciliation_date)}</div>
                          </div>
                          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-medium ${statusTone(selected)}`}>
                            {selectedReconciled ? <CheckCircle2 size={11} /> : <CircleAlert size={11} />}
                            {selectedReconciled ? "Reconciled" : "Needs attention"}
                          </span>
                        </div>

                        <div className={`mt-3 rounded-lg border p-3 ${selectedReconciled ? "border-emerald-700/12 bg-emerald-50/60" : "border-amber-700/12 bg-amber-50/70"}`}>
                          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#837A70]">Difference</div>
                          <div className={`mt-1 text-[23px] font-semibold tracking-[-0.03em] tabular-nums ${selectedReconciled ? "text-emerald-800" : "text-amber-950"}`}>{formatMoney(selectedDifference, selectedCurrency)}</div>
                          <div className="mt-0.5 text-[9px] text-[#8F877D]">Statement balance minus posted ledger balance</div>
                        </div>

                        <dl className="mt-3 divide-y divide-black/[0.055] rounded-lg border border-black/[0.06] bg-white px-3">
                          <div className="grid grid-cols-[1fr_auto] gap-3 py-2.5 text-[10px]"><dt className="text-[#918B83]">Statement closing balance</dt><dd className="font-medium tabular-nums text-[#4F4942]">{formatMoney(selected.statement_closing_balance, selectedCurrency)}</dd></div>
                          <div className="grid grid-cols-[1fr_auto] gap-3 py-2.5 text-[10px]"><dt className="text-[#918B83]">Book closing balance</dt><dd className="font-medium tabular-nums text-[#4F4942]">{formatMoney(selected.book_closing_balance, selectedCurrency)}</dd></div>
                          {selected.bank_statement_id ? <div className="grid grid-cols-[1fr_auto] gap-3 py-2.5 text-[10px]"><dt className="text-[#918B83]">Bank statement</dt><dd className="max-w-[160px] truncate font-medium text-[#4F4942]">{String(selected.bank_statement_id).slice(0, 12)}</dd></div> : null}
                        </dl>

                        {!selectedReconciled ? (
                          <div className="mt-3 flex gap-2 rounded-lg border border-amber-700/12 bg-amber-50 px-3 py-2.5 text-[9px] leading-4 text-amber-900">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0" /> This run remains open because the statement and posted-ledger balances do not agree. Review the evidence before sign-off.
                          </div>
                        ) : (
                          <div className="mt-3 flex gap-2 rounded-lg border border-emerald-700/12 bg-emerald-50 px-3 py-2.5 text-[9px] leading-4 text-emerald-900">
                            <ShieldCheck size={12} className="mt-0.5 shrink-0" /> The balance difference is zero within the reconciliation tolerance. Review evidence remains available below.
                          </div>
                        )}
                      </div>
                    ) : null}

                    <FinanceRecordReviewPanel
                      selected={selected}
                      capability={capability}
                      organizationId={organizationId}
                      entityId={entityId}
                      periodId={periodId}
                      presentation={presentation}
                      rows={filteredRows}
                      onSelect={(row) => row && setSelectedId(row.id || null)}
                    />
                  </aside>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {activeEngine ? (
        <RowActionEngine
          action={activeEngine.action}
          row={activeEngine.row}
          organizationId={organizationId}
          entityId={entityId}
          periodId={periodId}
          workspaceId="finance"
          moduleKey="bank_reconciliation"
          onComplete={() => {
            setActiveEngine(null);
            refresh();
          }}
          onClose={() => setActiveEngine(null)}
        />
      ) : null}

      <WorkspaceEventHub organizationId={organizationId} entityId={entityId} periodId={periodId} />
    </main>
  );
}
