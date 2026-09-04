"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Search, Upload } from "lucide-react";

import CapabilityActionResolver from "@/components/workspace/master-data/CapabilityActionResolver";
import useCreateEngine from "@/components/workspace/engines/useCreateEngine";
import WorkspaceEventHub from "@/components/workspace/WorkspaceEventHub";
import { getForm } from "@/lib/platform/forms";

const LINE_LIMIT = 100;

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

function money(value, currencyCode) {
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
    return `${currencyCode || "THB"} ${numeric.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

function statementSearchText(row) {
  return [
    row?.statement_number,
    row?.bank_account_name,
    row?.bank_name,
    row?.bank_account_number,
    row?.import_reference,
    row?.status,
    row?.currency_code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function lineSearchText(row) {
  return [
    row?.statement_line_number,
    row?.transaction_date,
    row?.description,
    row?.reference_number,
    row?.direction,
    row?.matched ? "matched" : "unmatched",
  ]
    .filter(value => value !== null && value !== undefined)
    .join(" ")
    .toLowerCase();
}

function statusTone(status) {
  const normalized = text(status).toUpperCase();
  if (["IMPORTED", "MATCHED", "RECONCILED", "COMPLETE", "COMPLETED"].includes(normalized)) {
    return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  }
  if (["FAILED", "REJECTED", "BLOCKED"].includes(normalized)) {
    return "border-red-700/15 bg-red-50 text-red-800";
  }
  return "border-amber-700/15 bg-amber-50 text-amber-900";
}

function StatusPill({ value }) {
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] ${statusTone(value)}`}>
      {text(value) || "Unknown"}
    </span>
  );
}

function MatchPill({ matched }) {
  return matched ? (
    <span className="inline-flex rounded-md border border-emerald-700/15 bg-emerald-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-emerald-800">
      Matched
    </span>
  ) : (
    <span className="inline-flex rounded-md border border-amber-700/15 bg-amber-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-amber-900">
      Unmatched
    </span>
  );
}

async function loadJson(url) {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) {
    throw new Error(body?.error || `Request failed (${response.status})`);
  }
  return body;
}

export default function FinanceBankStatementsWorkCenter({
  capability,
  organizationId,
  entityId,
  periodId,
}) {
  const create = capability?.create?.enabled === true ? capability.create : null;
  const createEngine = useCreateEngine();
  const searchRef = useRef(null);

  const [statements, setStatements] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [query, setQuery] = useState("");
  const [lineQuery, setLineQuery] = useState("");
  const [bankAccountFilter, setBankAccountFilter] = useState("");
  const [lineOffset, setLineOffset] = useState(0);
  const [form, setForm] = useState({});
  const [submissionKey, setSubmissionKey] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey(value => value + 1);
  }, []);

  useEffect(() => {
    if (!organizationId || !entityId) {
      setStatements([]);
      setSelectedId(null);
      setDetail(null);
      return;
    }

    let active = true;
    async function loadStatements() {
      try {
        setLoading(true);
        setError("");
        const url = new URL("/api/finance/bank-statements/runtime", window.location.origin);
        url.searchParams.set("organizationId", organizationId);
        url.searchParams.set("entityId", entityId);
        const body = await loadJson(url.toString());
        if (!active) return;
        const rows = Array.isArray(body?.rows) ? body.rows : [];
        setStatements(rows);
        setSelectedId(current =>
          current && rows.some(row => row.id === current)
            ? current
            : rows[0]?.id || null
        );
      } catch (loadError) {
        if (active) {
          setStatements([]);
          setSelectedId(null);
          setDetail(null);
          setError(loadError?.message || "Bank statements could not be loaded");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadStatements();
    return () => {
      active = false;
    };
  }, [entityId, organizationId, refreshKey]);

  useEffect(() => {
    if (!organizationId || !entityId || !selectedId) {
      setDetail(null);
      return;
    }

    let active = true;
    async function loadDetail() {
      try {
        setDetailLoading(true);
        setDetailError("");
        const url = new URL("/api/finance/bank-statements/runtime", window.location.origin);
        url.searchParams.set("organizationId", organizationId);
        url.searchParams.set("entityId", entityId);
        url.searchParams.set("statementImportId", selectedId);
        url.searchParams.set("lineOffset", String(lineOffset));
        url.searchParams.set("lineLimit", String(LINE_LIMIT));
        const body = await loadJson(url.toString());
        if (active) setDetail(body);
      } catch (loadError) {
        if (active) {
          setDetail(null);
          setDetailError(loadError?.message || "Statement evidence could not be loaded");
        }
      } finally {
        if (active) setDetailLoading(false);
      }
    }

    loadDetail();
    return () => {
      active = false;
    };
  }, [entityId, lineOffset, organizationId, refreshKey, selectedId]);

  useEffect(() => {
    setLineOffset(0);
    setLineQuery("");
  }, [selectedId]);

  useEffect(() => {
    function onKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase();
      if (["input", "textarea", "select"].includes(tag)) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;

      const rows = visibleStatements;
      if (!rows.length) return;
      event.preventDefault();
      const currentIndex = Math.max(0, rows.findIndex(row => row.id === selectedId));
      const nextIndex = event.key === "ArrowDown"
        ? Math.min(rows.length - 1, currentIndex + 1)
        : Math.max(0, currentIndex - 1);
      setSelectedId(rows[nextIndex]?.id || null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const bankAccounts = useMemo(() => {
    const values = new Map();
    for (const row of statements) {
      if (!row?.bank_account_id) continue;
      values.set(row.bank_account_id, row.bank_account_name || row.bank_name || row.bank_account_number || "Bank account");
    }
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [statements]);

  const visibleStatements = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return statements.filter(row => {
      if (bankAccountFilter && row.bank_account_id !== bankAccountFilter) return false;
      if (!needle) return true;
      return statementSearchText(row).includes(needle);
    });
  }, [bankAccountFilter, query, statements]);

  const visibleLines = useMemo(() => {
    const lines = Array.isArray(detail?.lines) ? detail.lines : [];
    const needle = lineQuery.trim().toLowerCase();
    if (!needle) return lines;
    return lines.filter(line => lineSearchText(line).includes(needle));
  }, [detail?.lines, lineQuery]);

  const selectedStatement = detail?.statement || statements.find(row => row.id === selectedId) || null;
  const currencyCode = selectedStatement?.currency_code || "THB";
  const movement = selectedStatement
    ? Number(selectedStatement.closing_balance || 0) - Number(selectedStatement.opening_balance || 0)
    : 0;

  function openCreate() {
    if (!create) return;
    setSubmissionKey(globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);
    setForm({});
    createEngine.show();
  }

  async function saveCreate() {
    if (!create) return;
    const schema = create.schema || getForm(create.form || capability?.id) || [];
    const missing = schema
      .filter(field => field?.required && (form[field.name] === undefined || form[field.name] === null || form[field.name] === ""))
      .map(field => field.label || field.name);
    if (missing.length) throw new Error(`Complete required fields: ${missing.join(", ")}`);

    const endpoint = create.endpoint || create.api || "/api/finance/bank-statements/import";
    const resolvedKey = submissionKey || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const response = await fetch(endpoint, {
      method: String(create.method || "POST").toUpperCase(),
      headers: { "Content-Type": "application/json", "Idempotency-Key": resolvedKey },
      body: JSON.stringify({
        ...form,
        organizationId,
        organization_id: organizationId,
        entityId,
        entity_id: entityId,
        periodId,
        period_id: periodId,
        idempotencyKey: resolvedKey,
        idempotency_key: resolvedKey,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success === false) {
      throw new Error(body?.error || `Bank statement import failed (${response.status})`);
    }

    createEngine.hide();
    setForm({});
    setSubmissionKey(null);
    refresh();
  }

  function openReconciliation() {
    if (!organizationId) return;
    window.location.assign(`/workspace/${organizationId}/finance/bank-reconciliation`);
  }

  if (!entityId) {
    return (
      <main className="min-h-[calc(100vh-112px)] bg-[#F7F6F3] px-5 py-6 text-[#1B1A18]">
        <div className="rounded-xl border border-amber-700/15 bg-amber-50 p-5 text-[12px] text-amber-900">
          Select a legal entity before working with Bank Statements.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-112px)] bg-[#F7F6F3] text-[#1B1A18]">
      <div className="mx-auto max-w-[1780px] px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
        <header className="sticky top-0 z-20 -mx-4 border-b border-black/[0.07] bg-[#F7F6F3]/95 px-4 pb-4 backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.21em] text-[#9A7045]">
                Finance / Treasury
              </div>
              <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-0.035em] text-[#1B1A18]">
                {capability?.name || "Bank Statements"}
              </h1>
              <p className="mt-1 max-w-3xl text-[12px] leading-5 text-[#777169]">
                Review imported statements and transaction evidence, then continue unmatched bank activity into reconciliation.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={refresh}
                disabled={loading}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/[0.09] bg-white px-3 text-[11px] font-medium text-[#56514A] transition hover:border-[#D6A66A]/45 disabled:opacity-45"
              >
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
              {create ? (
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1F1E1B] px-3.5 text-[11px] font-semibold text-white transition hover:bg-black"
                >
                  <Upload size={13} /> {create.label || "Import Statement"}
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <section className="mt-4 grid gap-2 rounded-xl border border-black/[0.07] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)] lg:grid-cols-[minmax(300px,1fr)_240px_auto]">
          <div className="flex min-w-0 items-center gap-2 rounded-lg border border-black/[0.08] bg-[#FAF9F7] px-3">
            <Search size={14} className="text-[#9A958D]" />
            <input
              ref={searchRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search statement, account or reference…"
              className="h-9 min-w-0 flex-1 bg-transparent text-[12px] text-[#302E2A] outline-none placeholder:text-[#AAA59D]"
            />
          </div>
          <select
            value={bankAccountFilter}
            onChange={event => setBankAccountFilter(event.target.value)}
            className="h-9 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[10px] text-[#625D56] outline-none"
          >
            <option value="">All bank accounts</option>
            {bankAccounts.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <div className="flex items-center justify-end gap-2 text-[10px] text-[#777169]">
            <span className="rounded-lg bg-[#F7F6F3] px-2.5 py-1.5 font-medium">{visibleStatements.length} statements</span>
            <span className="hidden xl:inline">↑ ↓ navigate · / search</span>
          </div>
        </section>

        <div className="mt-3 grid min-h-[690px] gap-3 xl:grid-cols-[minmax(520px,0.85fr)_minmax(640px,1.15fr)]">
          <section className="min-w-0 overflow-hidden rounded-xl border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            {loading ? (
              <div className="p-8 text-[12px] text-[#817B73]">Loading bank statements…</div>
            ) : error ? (
              <div className="m-4 rounded-lg border border-red-700/15 bg-red-50 p-4 text-[12px] text-red-800">{error}</div>
            ) : visibleStatements.length === 0 ? (
              <div className="p-8">
                <div className="text-[13px] font-semibold text-[#3E3A35]">No bank statements in this view.</div>
                <div className="mt-1 text-[12px] leading-5 text-[#817B73]">
                  Import a statement to create the bank evidence used by reconciliation.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-[11px]">
                  <thead className="border-b border-black/[0.07] bg-[#FAF9F7] text-[9px] font-semibold uppercase tracking-[0.12em] text-[#858078]">
                    <tr>
                      <th className="px-3 py-2.5">Statement</th>
                      <th className="px-3 py-2.5">Bank account</th>
                      <th className="px-3 py-2.5">Period</th>
                      <th className="px-3 py-2.5 text-right">Closing</th>
                      <th className="px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleStatements.map(row => {
                      const selected = row.id === selectedId;
                      return (
                        <tr
                          key={row.id}
                          onClick={() => setSelectedId(row.id)}
                          className={`cursor-pointer border-b border-black/[0.055] transition last:border-b-0 ${selected ? "bg-[#F3EEE7]" : "hover:bg-[#FAF9F7]"}`}
                        >
                          <td className="px-3 py-3 align-top">
                            <div className="font-semibold text-[#302E2A]">{row.statement_number || "Statement"}</div>
                            <div className="mt-1 max-w-[180px] truncate text-[10px] text-[#928C83]">{row.import_reference || "No import reference"}</div>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <div className="text-[#4F4A44]">{row.bank_account_name || row.bank_name || "Bank account"}</div>
                            <div className="mt-1 text-[10px] text-[#928C83]">{row.bank_account_number || "—"}</div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 align-top text-[#625D56]">
                            {date(row.statement_start_date)} – {date(row.statement_end_date)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right align-top font-medium tabular-nums text-[#302E2A]">
                            {money(row.closing_balance, row.currency_code)}
                          </td>
                          <td className="px-3 py-3 align-top"><StatusPill value={row.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="min-w-0 overflow-hidden rounded-xl border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            {!selectedStatement ? (
              <div className="p-8 text-[12px] text-[#817B73]">Select a statement to review its evidence.</div>
            ) : (
              <div className="flex h-full min-h-[690px] flex-col">
                <div className="border-b border-black/[0.07] px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#9A7045]">Statement evidence</div>
                      <div className="mt-1 text-[18px] font-semibold tracking-[-0.025em] text-[#2B2925]">{selectedStatement.statement_number}</div>
                      <div className="mt-1 text-[11px] text-[#777169]">
                        {selectedStatement.bank_account_name || selectedStatement.bank_name || "Bank account"}
                        {selectedStatement.bank_account_number ? ` · ${selectedStatement.bank_account_number}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={openReconciliation}
                      className="h-8 rounded-lg border border-black/[0.09] bg-[#FAF9F7] px-3 text-[10px] font-semibold text-[#514C45] transition hover:border-[#D6A66A]/45"
                    >
                      Open Reconciliation
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-black/[0.06] pt-3 text-[10px] sm:grid-cols-4">
                    <div><div className="uppercase tracking-[0.12em] text-[#9B958D]">Period</div><div className="mt-1 font-medium text-[#4B4741]">{date(selectedStatement.statement_start_date)} – {date(selectedStatement.statement_end_date)}</div></div>
                    <div><div className="uppercase tracking-[0.12em] text-[#9B958D]">Opening</div><div className="mt-1 font-medium tabular-nums text-[#4B4741]">{money(selectedStatement.opening_balance, currencyCode)}</div></div>
                    <div><div className="uppercase tracking-[0.12em] text-[#9B958D]">Closing</div><div className="mt-1 font-medium tabular-nums text-[#4B4741]">{money(selectedStatement.closing_balance, currencyCode)}</div></div>
                    <div><div className="uppercase tracking-[0.12em] text-[#9B958D]">Movement</div><div className="mt-1 font-medium tabular-nums text-[#4B4741]">{money(movement, currencyCode)}</div></div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[#777169]">
                    <StatusPill value={selectedStatement.status} />
                    {detail ? <span>{detail.line_count || 0} lines</span> : null}
                    {detail ? <span className="text-emerald-700">{detail.matched_count || 0} matched</span> : null}
                    {detail ? <span className="text-amber-800">{detail.unmatched_count || 0} unmatched</span> : null}
                    {selectedStatement.import_reference ? <span>Reference: {selectedStatement.import_reference}</span> : null}
                  </div>
                </div>

                <div className="border-b border-black/[0.07] p-3">
                  <div className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-[#FAF9F7] px-3">
                    <Search size={13} className="text-[#9A958D]" />
                    <input
                      value={lineQuery}
                      onChange={event => setLineQuery(event.target.value)}
                      placeholder="Search loaded statement lines…"
                      className="h-8 min-w-0 flex-1 bg-transparent text-[11px] text-[#302E2A] outline-none placeholder:text-[#AAA59D]"
                    />
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto">
                  {detailLoading ? (
                    <div className="p-6 text-[11px] text-[#817B73]">Loading statement evidence…</div>
                  ) : detailError ? (
                    <div className="m-3 rounded-lg border border-red-700/15 bg-red-50 p-3 text-[11px] text-red-800">{detailError}</div>
                  ) : visibleLines.length === 0 ? (
                    <div className="p-6 text-[11px] leading-5 text-[#817B73]">
                      {detail?.line_count ? "No loaded lines match this search." : "This statement import has no transaction lines stored yet."}
                    </div>
                  ) : (
                    <table className="min-w-full border-collapse text-left text-[10px]">
                      <thead className="sticky top-0 z-10 border-b border-black/[0.07] bg-[#FAF9F7] text-[8px] font-semibold uppercase tracking-[0.11em] text-[#858078]">
                        <tr>
                          <th className="px-3 py-2.5">#</th>
                          <th className="px-3 py-2.5">Date</th>
                          <th className="px-3 py-2.5">Description / reference</th>
                          <th className="px-3 py-2.5 text-right">Money in</th>
                          <th className="px-3 py-2.5 text-right">Money out</th>
                          <th className="px-3 py-2.5">Match</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleLines.map(line => (
                          <tr key={line.id} className="border-b border-black/[0.055] last:border-b-0">
                            <td className="px-3 py-2.5 text-[#928C83]">{line.statement_line_number || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-[#625D56]">{date(line.transaction_date)}</td>
                            <td className="max-w-[260px] px-3 py-2.5">
                              <div className="truncate font-medium text-[#413D37]">{line.description || "Bank transaction"}</div>
                              <div className="mt-0.5 truncate text-[9px] text-[#9B958D]">{line.reference_number || "No reference"}</div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums text-emerald-800">
                              {text(line.direction).toUpperCase() === "IN" ? money(line.amount, currencyCode) : "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums text-[#5A5550]">
                              {text(line.direction).toUpperCase() === "OUT" ? money(line.amount, currencyCode) : "—"}
                            </td>
                            <td className="px-3 py-2.5"><MatchPill matched={line.matched === true} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-black/[0.07] bg-[#FAF9F7] px-3 py-2.5 text-[9px] text-[#777169]">
                  <span>
                    {detail?.line_count
                      ? `${lineOffset + 1}–${Math.min(lineOffset + LINE_LIMIT, detail.line_count)} of ${detail.line_count}`
                      : "No statement lines"}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={lineOffset <= 0 || detailLoading}
                      onClick={() => setLineOffset(value => Math.max(0, value - LINE_LIMIT))}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-black/[0.08] bg-white px-2 text-[#625D56] disabled:opacity-35"
                    >
                      <ChevronLeft size={11} /> Previous
                    </button>
                    <button
                      type="button"
                      disabled={!detail?.pagination?.has_more || detailLoading}
                      onClick={() => setLineOffset(value => value + LINE_LIMIT)}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-black/[0.08] bg-white px-2 text-[#625D56] disabled:opacity-35"
                    >
                      Next <ChevronRight size={11} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

      <CapabilityActionResolver
        open={createEngine.open}
        saving={createEngine.saving}
        action={create}
        fallbackLabel={create?.label || create?.title || "Import Statement"}
        schema={create?.schema || getForm(create?.form || capability?.id)}
        values={form}
        onChange={(name, value) => setForm(current => ({ ...current, [name]: value }))}
        onClose={createEngine.hide}
        onSave={() => createEngine.save(saveCreate)}
        organizationId={organizationId}
        entityId={entityId}
        periodId={periodId}
        currency={currencyCode}
        moduleKey={capability?.id}
        onComplete={refresh}
      />

      <WorkspaceEventHub organizationId={organizationId} entityId={entityId} periodId={periodId} />
    </main>
  );
}
