"use client";

import { useEffect, useMemo, useState } from "react";
import ReportWorkCenter from "@/components/workspace/reports/ReportWorkCenter";

function firstArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ["rows", "entries", "lines", "items", "records", "data"]) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === "object") {
      const nested = firstArray(candidate);
      if (nested.length) return nested;
    }
  }
  return [];
}

function label(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function number(value) {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function money(value, currencyCode) {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currencyCode || "GBP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${currencyCode || ""} ${number(value)}`.trim();
  }
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

function display(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return number(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function TrialBalanceWorkspace({
  capability,
  organizationId,
  entityId,
  periodId,
  payload,
  rows,
}) {
  const [selected, setSelected] = useState(null);
  const [ledgerRows, setLedgerRows] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState("");
  const currencyCode = payload?.currencyCode || "GBP";

  async function openAccount(row) {
    setSelected(row);
    setLedgerLoading(true);
    setLedgerError("");
    setLedgerRows([]);

    try {
      const url = new URL("/api/finance/general-ledger", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("entityId", entityId);
      url.searchParams.set("accountId", row.account_id);
      if (payload?.startDate) url.searchParams.set("startDate", payload.startDate);
      if (payload?.endDate) url.searchParams.set("endDate", payload.endDate);

      const response = await fetch(url.toString(), {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || "Ledger drill-down failed");
      }
      setLedgerRows(result.rows || result.entries || []);
    } catch (error) {
      setLedgerError(error.message || "Ledger drill-down failed");
    } finally {
      setLedgerLoading(false);
    }
  }

  function exportCsv() {
    const headers = [
      "Account Code",
      "Account Name",
      "Account Type",
      "Period Debits",
      "Period Credits",
      "Debit Balance",
      "Credit Balance",
    ];
    const lines = [
      headers.map(csvCell).join(","),
      ...rows.map(row => [
        row.account_code,
        row.account_name,
        row.account_type,
        row.period_debits,
        row.period_credits,
        row.debit_balance,
        row.credit_balance,
      ].map(csvCell).join(",")),
      ["", "TOTAL", "", "", "", payload?.totalDebits, payload?.totalCredits]
        .map(csvCell)
        .join(","),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `trial-balance-${payload?.startDate || "period"}-${payload?.endDate || "end"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-6">
      <header className="rounded-[30px] border border-white/10 bg-white/[0.035] p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-[#D6A66A]">
              Accounting Report
            </div>
            <h1 className="mt-3 text-4xl font-light tracking-[-0.05em] text-white">
              {capability?.name || "Trial Balance"}
            </h1>
            <p className="mt-2 text-sm text-white/45">
              {date(payload?.startDate)} – {date(payload?.endDate)} · {currencyCode}
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/65 hover:bg-white/[0.05]"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-xl bg-[#D6A66A] px-4 py-2 text-sm font-medium text-black"
            >
              Print
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.025] p-5">
          <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Accounts</div>
          <div className="mt-3 text-3xl font-light text-white">{payload?.accountCount ?? rows.length}</div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.025] p-5">
          <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Debit Balances</div>
          <div className="mt-3 text-2xl font-light text-white">{money(payload?.totalDebits, currencyCode)}</div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.025] p-5">
          <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Credit Balances</div>
          <div className="mt-3 text-2xl font-light text-white">{money(payload?.totalCredits, currencyCode)}</div>
        </div>
        <div className={`rounded-[24px] border p-5 ${payload?.balanced ? "border-emerald-400/20 bg-emerald-400/[0.05]" : "border-red-400/25 bg-red-400/[0.06]"}`}>
          <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Control</div>
          <div className={`mt-3 text-2xl font-light ${payload?.balanced ? "text-emerald-200" : "text-red-200"}`}>
            {payload?.balanced ? "Balanced" : "Out of Balance"}
          </div>
          <div className="mt-1 text-xs text-white/45">Difference {money(payload?.difference, currencyCode)}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.02]">
        {rows.length === 0 ? (
          <div className="p-8 text-sm text-white/45">No posted balances exist for the selected entity and period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-[0.18em] text-white/35">
                <tr>
                  <th className="px-5 py-4">Account</th>
                  <th className="px-5 py-4">Type</th>
                  <th className="px-5 py-4 text-right">Period Debit</th>
                  <th className="px-5 py-4 text-right">Period Credit</th>
                  <th className="px-5 py-4 text-right">Debit Balance</th>
                  <th className="px-5 py-4 text-right">Credit Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr
                    key={row.account_id}
                    onClick={() => openAccount(row)}
                    className="cursor-pointer border-b border-white/[0.06] text-white/70 last:border-0 hover:bg-white/[0.035]"
                  >
                    <td className="px-5 py-4">
                      <div className="text-white/85">{row.account_code} · {row.account_name}</div>
                      <div className="mt-1 text-xs text-white/35">Open ledger activity</div>
                    </td>
                    <td className="px-5 py-4">{label(row.account_type || row.account_category)}</td>
                    <td className="px-5 py-4 text-right tabular-nums">{money(row.period_debits, currencyCode)}</td>
                    <td className="px-5 py-4 text-right tabular-nums">{money(row.period_credits, currencyCode)}</td>
                    <td className="px-5 py-4 text-right tabular-nums">{money(row.debit_balance, currencyCode)}</td>
                    <td className="px-5 py-4 text-right tabular-nums">{money(row.credit_balance, currencyCode)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-white/10 bg-white/[0.025] text-white/85">
                <tr>
                  <td className="px-5 py-4 font-medium" colSpan={4}>Total</td>
                  <td className="px-5 py-4 text-right font-medium tabular-nums">{money(payload?.totalDebits, currencyCode)}</td>
                  <td className="px-5 py-4 text-right font-medium tabular-nums">{money(payload?.totalCredits, currencyCode)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm print:hidden">
          <div className="w-full max-w-6xl overflow-hidden rounded-[30px] border border-white/10 bg-[#090909] shadow-2xl">
            <div className="flex items-start justify-between border-b border-white/10 p-6">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[#D6A66A]">Ledger Drill-down</div>
                <h2 className="mt-2 text-2xl font-light text-white">{selected.account_code} · {selected.account_name}</h2>
                <div className="mt-1 text-sm text-white/40">{date(payload?.startDate)} – {date(payload?.endDate)}</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60">Close</button>
            </div>
            <div className="max-h-[70vh] overflow-auto p-6">
              {ledgerLoading ? (
                <div className="text-sm text-white/45">Loading ledger activity…</div>
              ) : ledgerError ? (
                <div className="rounded-2xl border border-red-400/25 bg-red-400/[0.06] p-4 text-sm text-red-200">{ledgerError}</div>
              ) : ledgerRows.length === 0 ? (
                <div className="text-sm text-white/45">No ledger lines exist for this account in the selected period.</div>
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-white/10 text-[10px] uppercase tracking-[0.18em] text-white/35">
                    <tr>
                      <th className="px-3 py-3">Date</th>
                      <th className="px-3 py-3">Journal / Reference</th>
                      <th className="px-3 py-3">Description</th>
                      <th className="px-3 py-3 text-right">Debit</th>
                      <th className="px-3 py-3 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerRows.map((line, index) => (
                      <tr key={line.id || index} className="border-b border-white/[0.06] text-white/65 last:border-0">
                        <td className="px-3 py-3">{date(line.posting_date || line.entry_date || line.created_at)}</td>
                        <td className="px-3 py-3">{line.journal_number || line.reference || line.source_document || "—"}</td>
                        <td className="px-3 py-3">{line.description || "—"}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(line.debit, currencyCode)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(line.credit, currencyCode)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function FinanceReportRuntimeWorkCenter({
  capability,
  organizationId,
  entityId,
  periodId,
  workspaceId,
}) {
  const api = capability?.ui?.api || capability?.runtime?.listApi || null;
  const contextScope = capability?.contextScope || capability?.runtime?.scope || capability?.scope || "entity";
  const requiresEntityContext = contextScope === "entity";
  const contextReady = Boolean(organizationId && (!requiresEntityContext || (entityId && periodId)));
  const [loading, setLoading] = useState(Boolean(api));
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    if (!api) return;
    if (!contextReady) {
      setLoading(true);
      setError("");
      setPayload(null);
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
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.success === false) throw new Error(result?.error || `Report load failed (${response.status})`);
        if (active) setPayload(result);
      } catch (loadError) {
        if (active) {
          setPayload(null);
          setError(loadError.message || "Report load failed");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [api, contextReady, organizationId, entityId, periodId]);

  const rows = useMemo(() => firstArray(payload), [payload]);
  const columns = useMemo(() => {
    const row = rows[0] || {};
    return Object.keys(row)
      .filter(key => !key.endsWith("_id") && key !== "organization_id" && key !== "entity_id")
      .slice(0, 8);
  }, [rows]);

  if (!api) {
    return <ReportWorkCenter capability={capability} organizationId={organizationId} entityId={entityId} periodId={periodId} workspaceId={workspaceId} />;
  }

  if (loading) {
    return <div className="rounded-[28px] border border-white/10 bg-white/[0.025] p-8 text-sm text-white/45">Loading report…</div>;
  }

  if (error) {
    return <div className="rounded-[28px] border border-red-400/25 bg-red-400/[0.06] p-8 text-sm text-red-200">{error}</div>;
  }

  if (payload?.reportType === "trial_balance" || capability?.id === "trial_balance") {
    return (
      <TrialBalanceWorkspace
        capability={capability}
        organizationId={organizationId}
        entityId={entityId}
        periodId={periodId}
        payload={payload || {}}
        rows={rows}
      />
    );
  }

  return (
    <section className="space-y-6">
      <header className="rounded-[30px] border border-white/10 bg-white/[0.035] p-6">
        <div className="text-[11px] uppercase tracking-[0.28em] text-[#D6A66A]">Finance Report</div>
        <h1 className="mt-3 text-4xl font-light tracking-[-0.05em] text-white">{capability?.name || "Finance Report"}</h1>
        <p className="mt-2 text-sm text-white/45">{capability?.description || "Review the selected entity and accounting period."}</p>
      </header>
      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.02]">
        {rows.length === 0 ? (
          <div className="p-8 text-sm text-white/45">No report rows exist for the selected context.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-[0.2em] text-white/35">
                <tr>{columns.map(column => <th key={column} className="px-5 py-4">{label(column)}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id || row.account_id || index} className="border-b border-white/[0.06] text-white/70 last:border-0">
                    {columns.map(column => <td key={column} className="px-5 py-4">{display(row[column])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
