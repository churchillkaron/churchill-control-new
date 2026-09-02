"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Printer, RefreshCw, Search, X } from "lucide-react";

function firstArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ["rows", "entries", "lines", "items", "records", "data", "results", "metrics"]) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === "object") {
      const nested = firstArray(candidate);
      if (nested.length) return nested;
    }
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

function number(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value === null || value === undefined || value === "" ? "—" : String(value);
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric);
}

function money(value, currencyCode) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value === null || value === undefined || value === "" ? "—" : String(value);
  if (!currencyCode) return number(numeric);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${currencyCode} ${number(numeric)}`;
  }
}

function date(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function isNumericKey(key, value) {
  if (typeof value === "number") return true;
  return /amount|balance|debit|credit|total|value|variance|revenue|cost|profit|cash|budget|forecast|rate|percent/i.test(String(key || ""));
}

function display(key, value, currencyCode) {
  if (value === null || value === undefined || value === "") return "—";
  if (/date|_at$|period_start|period_end/i.test(key)) return date(value);
  if (isNumericKey(key, value)) {
    if (/percent|rate/i.test(key) && !/exchange_rate/i.test(key)) return number(value);
    return money(value, currencyCode);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return "Structured data";
  return String(value);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function statusTone(good) {
  return good
    ? "border-emerald-700/15 bg-emerald-50 text-emerald-800"
    : "border-amber-700/15 bg-amber-50 text-amber-800";
}

export default function FinanceAccountantReportWorkCenter({
  capability,
  organizationId,
  entityId,
  periodId,
}) {
  const api = capability?.ui?.api || capability?.runtime?.listApi || null;
  const presentation = capability?.ui?.financePresentation || capability?.runtime?.financePresentation || {};
  const requiresEntity = (capability?.contextScope || presentation.scope || "entity") === "entity";
  const contextReady = Boolean(organizationId && (!requiresEntity || entityId));

  const [loading, setLoading] = useState(Boolean(api));
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [query, setQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [ledgerRows, setLedgerRows] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState("");

  useEffect(() => {
    if (!api || !contextReady) {
      setPayload(null);
      setLoading(false);
      return;
    }
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError("");
        const url = new URL(api, window.location.origin);
        url.searchParams.set("organizationId", organizationId);
        if (entityId) url.searchParams.set("entityId", entityId);
        if (periodId) url.searchParams.set("periodId", periodId);
        const response = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body?.success === false) throw new Error(body?.error || `Report load failed (${response.status})`);
        if (active) setPayload(body);
      } catch (loadError) {
        if (active) {
          setPayload(null);
          setError(loadError?.message || "Report load failed");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [api, contextReady, organizationId, entityId, periodId, refreshKey]);

  const rows = useMemo(() => firstArray(payload), [payload]);
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row || {}).filter((value) => typeof value !== "object").join(" ").toLowerCase().includes(needle));
  }, [rows, query]);

  const isTrialBalance = capability?.id === "trial_balance" || payload?.reportType === "trial_balance";
  const currencyCode = payload?.currencyCode || payload?.currency_code || rows.find((row) => row?.currency_code)?.currency_code || null;
  const columns = useMemo(() => {
    if (isTrialBalance) {
      return [
        "account_code", "account_name", "account_type", "period_debits", "period_credits", "debit_balance", "credit_balance",
      ];
    }
    const preferred = Array.isArray(presentation.columns) ? presentation.columns : [];
    if (preferred.length) {
      const resolved = preferred.map((column) => {
        const key = (column.keys || []).find((candidate) => rows.some((row) => row?.[candidate] !== undefined && row?.[candidate] !== null));
        return key ? { key, label: column.label, align: column.align } : null;
      }).filter(Boolean);
      if (resolved.length >= 2) return resolved;
    }
    return Object.keys(rows[0] || {})
      .filter((key) => !key.endsWith("_id") && !["id", "organization_id", "entity_id", "period_id"].includes(key) && typeof rows[0]?.[key] !== "object")
      .slice(0, 9)
      .map((key) => ({ key, label: label(key), align: isNumericKey(key, rows[0]?.[key]) ? "right" : "left" }));
  }, [rows, isTrialBalance, presentation.columns]);

  const normalizedColumns = columns.map((column) => typeof column === "string"
    ? { key: column, label: label(column), align: isNumericKey(column, rows[0]?.[column]) ? "right" : "left" }
    : column);

  async function openLedger(row) {
    if (!isTrialBalance || !row?.account_id || !organizationId || !entityId) return;
    setSelectedAccount(row);
    setLedgerRows([]);
    setLedgerError("");
    setLedgerLoading(true);
    try {
      const url = new URL("/api/finance/general-ledger", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("entityId", entityId);
      url.searchParams.set("accountId", row.account_id);
      if (payload?.startDate) url.searchParams.set("startDate", payload.startDate);
      if (payload?.endDate) url.searchParams.set("endDate", payload.endDate);
      const response = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Ledger drill-down failed");
      setLedgerRows(body.rows || body.entries || []);
    } catch (loadError) {
      setLedgerError(loadError?.message || "Ledger drill-down failed");
    } finally {
      setLedgerLoading(false);
    }
  }

  function exportCsv() {
    const lines = [
      normalizedColumns.map((column) => csvCell(column.label)).join(","),
      ...filteredRows.map((row) => normalizedColumns.map((column) => csvCell(row?.[column.key])).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${capability?.id || "finance-report"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-[calc(100vh-112px)] bg-[#F7F6F3] text-[#1B1A18]">
      <div className="mx-auto max-w-[1760px] px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
        <header className="border-b border-black/[0.07] pb-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.21em] text-[#9A7045]">
                Finance / {presentation.family_label || "Reporting"}
              </div>
              <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-0.035em] sm:text-[31px]">
                {capability?.name || "Finance Report"}
              </h1>
              <p className="mt-1 max-w-4xl text-[12px] leading-5 text-[#777169]">
                {capability?.description || "Review the selected accounting context and drill into supporting evidence."}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-[#777169]">
                {payload?.startDate || payload?.endDate ? (
                  <span className="rounded-full border border-black/[0.08] bg-white px-2.5 py-1">
                    {date(payload?.startDate)} – {date(payload?.endDate)}
                  </span>
                ) : null}
                {currencyCode ? <span className="rounded-full border border-black/[0.08] bg-white px-2.5 py-1">{currencyCode}</span> : null}
                <span className="rounded-full border border-black/[0.08] bg-white px-2.5 py-1">{filteredRows.length} rows</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/[0.09] bg-white px-3 text-[11px] font-medium text-[#575149] hover:border-[#D6A66A]/45 disabled:opacity-45">
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
              <button type="button" onClick={exportCsv} disabled={!filteredRows.length} className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/[0.09] bg-white px-3 text-[11px] font-medium text-[#575149] hover:border-[#D6A66A]/45 disabled:opacity-35">
                <Download size={13} /> Export CSV
              </button>
              <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1F1E1B] px-3 text-[11px] font-medium text-white hover:bg-black">
                <Printer size={13} /> Print
              </button>
            </div>
          </div>
        </header>

        {!contextReady ? (
          <section className="mt-4 rounded-xl border border-amber-700/15 bg-amber-50 p-4 text-[12px] text-amber-900">
            Select the required legal entity before opening this Finance report.
          </section>
        ) : error ? (
          <section className="mt-4 rounded-xl border border-red-700/15 bg-red-50 p-4 text-[12px] text-red-800">{error}</section>
        ) : (
          <>
            {isTrialBalance ? (
              <section className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                <div className="rounded-xl border border-black/[0.07] bg-white p-3.5">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8E887F]">Accounts</div>
                  <div className="mt-1.5 text-[21px] font-semibold tabular-nums">{payload?.accountCount ?? rows.length}</div>
                </div>
                <div className="rounded-xl border border-black/[0.07] bg-white p-3.5">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8E887F]">Debit balances</div>
                  <div className="mt-1.5 text-[18px] font-semibold tabular-nums">{money(payload?.totalDebits, currencyCode)}</div>
                </div>
                <div className="rounded-xl border border-black/[0.07] bg-white p-3.5">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8E887F]">Credit balances</div>
                  <div className="mt-1.5 text-[18px] font-semibold tabular-nums">{money(payload?.totalCredits, currencyCode)}</div>
                </div>
                <div className={`rounded-xl border p-3.5 ${statusTone(Boolean(payload?.balanced))}`}>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.12em] opacity-70">Control</div>
                  <div className="mt-1.5 text-[18px] font-semibold">{payload?.balanced ? "Balanced" : "Review difference"}</div>
                  <div className="mt-0.5 text-[10px] opacity-70">Difference {money(payload?.difference, currencyCode)}</div>
                </div>
              </section>
            ) : null}

            <section className="mt-3 rounded-xl border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="flex items-center border-b border-black/[0.06] bg-[#FAF9F7] px-3">
                <Search size={13} className="text-[#969087]" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search report…" className="h-9 min-w-0 flex-1 bg-transparent px-2 text-[11px] outline-none placeholder:text-[#AAA49B]" />
              </div>
              {loading ? (
                <div className="p-8 text-[12px] text-[#817B73]">Loading report…</div>
              ) : filteredRows.length === 0 ? (
                <div className="p-8 text-[12px] text-[#817B73]">No report rows exist for this accounting context.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-left text-[11px]">
                    <thead className="sticky top-0 border-b border-black/[0.07] bg-[#FAF9F7] text-[9px] font-semibold uppercase tracking-[0.11em] text-[#858078]">
                      <tr>
                        {normalizedColumns.map((column) => (
                          <th key={column.key} className={`whitespace-nowrap px-3 py-2.5 ${column.align === "right" ? "text-right" : "text-left"}`}>{column.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row, index) => (
                        <tr key={row?.id || row?.account_id || index} onClick={() => openLedger(row)} className={`border-b border-black/[0.05] last:border-0 ${isTrialBalance && row?.account_id ? "cursor-pointer hover:bg-[#F8F6F1]" : ""}`}>
                          {normalizedColumns.map((column) => (
                            <td key={column.key} className={`max-w-[300px] px-3 py-2.5 ${column.align === "right" ? "text-right tabular-nums" : "text-left"}`}>
                              <span className="block truncate text-[#59544D]">{display(column.key, row?.[column.key], currencyCode)}</span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    {isTrialBalance && filteredRows.length ? (
                      <tfoot className="border-t border-black/[0.08] bg-[#FAF9F7] font-semibold text-[#39352F]">
                        <tr>
                          <td className="px-3 py-3" colSpan={Math.max(1, normalizedColumns.length - 2)}>Total</td>
                          <td className="px-3 py-3 text-right tabular-nums">{money(payload?.totalDebits, currencyCode)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{money(payload?.totalCredits, currencyCode)}</td>
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {selectedAccount ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm print:hidden">
          <section className="max-h-[86vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-black/[0.1] bg-[#F7F6F3] shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
            <header className="flex items-start justify-between gap-4 border-b border-black/[0.07] bg-white p-5">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#9A7045]">Ledger drill-through</div>
                <h2 className="mt-1 text-[21px] font-semibold tracking-[-0.025em]">{selectedAccount.account_code} · {selectedAccount.account_name}</h2>
                <div className="mt-1 text-[10px] text-[#89837B]">{date(payload?.startDate)} – {date(payload?.endDate)}</div>
              </div>
              <button type="button" onClick={() => setSelectedAccount(null)} className="rounded-lg border border-black/[0.08] bg-white p-2 text-[#6F6961] hover:bg-[#F7F6F3]"><X size={15} /></button>
            </header>
            <div className="max-h-[70vh] overflow-auto p-4">
              {ledgerLoading ? <div className="p-5 text-[11px] text-[#817B73]">Loading ledger evidence…</div> : ledgerError ? (
                <div className="rounded-lg border border-red-700/15 bg-red-50 p-4 text-[11px] text-red-800">{ledgerError}</div>
              ) : ledgerRows.length === 0 ? (
                <div className="p-5 text-[11px] text-[#817B73]">No ledger activity exists for this account in the selected period.</div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-black/[0.07] bg-white">
                  <table className="min-w-full text-left text-[10px]">
                    <thead className="border-b border-black/[0.07] bg-[#FAF9F7] text-[9px] font-semibold uppercase tracking-[0.1em] text-[#858078]">
                      <tr><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Journal / reference</th><th className="px-3 py-2.5">Description</th><th className="px-3 py-2.5 text-right">Debit</th><th className="px-3 py-2.5 text-right">Credit</th></tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.05]">
                      {ledgerRows.map((line, index) => (
                        <tr key={line?.id || index}>
                          <td className="px-3 py-2.5 text-[#655F57]">{date(line?.posting_date || line?.entry_date || line?.created_at)}</td>
                          <td className="px-3 py-2.5 font-medium text-[#4B4740]">{line?.journal_number || line?.reference || line?.source_document || "—"}</td>
                          <td className="max-w-[420px] px-3 py-2.5 text-[#655F57]">{line?.description || "—"}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[#4B4740]">{money(line?.debit, currencyCode)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[#4B4740]">{money(line?.credit, currencyCode)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
