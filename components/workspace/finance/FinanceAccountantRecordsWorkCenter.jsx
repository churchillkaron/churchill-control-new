"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";

import CapabilityActionResolver from "@/components/workspace/master-data/CapabilityActionResolver";
import MasterActionMenu from "@/components/workspace/actions/MasterActionMenu";
import RowActionEngine from "@/components/workspace/engines/RowActionEngine";
import WorkspaceEventHub from "@/components/workspace/WorkspaceEventHub";
import useCreateEngine from "@/components/workspace/engines/useCreateEngine";
import { getForm } from "@/lib/platform/forms";
import { resolveFinanceActionPresentation } from "@/lib/finance/actions/resolveFinanceAction";

function list(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.entries(value).map(([id, action]) => ({ id, ...(action || {}) }));
  }
  return [];
}

function firstArray(payload, preferredKey) {
  if (preferredKey && Array.isArray(payload?.[preferredKey])) return payload[preferredKey];
  for (const key of [
    "rows", "items", "records", "results", "data", "entries", "journals", "invoices",
    "payments", "payables", "receivables", "vendors", "customers", "assets", "budgets",
    "periods", "issues", "events", "matches", "purchaseOrders", "receipts", "roles",
  ]) {
    if (Array.isArray(payload?.[key])) return payload[key];
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

function valueAt(row, keys = []) {
  for (const key of keys) {
    const value = String(key || "").split(".").reduce((current, part) => current?.[part], row);
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function number(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value === null || value === undefined || value === "" ? "—" : String(value);
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(numeric);
}

function money(value, currencyCode) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
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
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function display(value, format, currencyCode) {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "date") return date(value);
  if (format === "number") return number(value);
  if (format === "money") return money(value, currencyCode);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return "Structured data";
  return String(value);
}

function statusTone(value) {
  const status = text(value).toLowerCase();
  if (["posted", "paid", "approved", "complete", "completed", "closed", "active", "reconciled", "submitted", "ready"].includes(status)) {
    return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  }
  if (["overdue", "failed", "rejected", "blocked", "out_of_balance", "unreconciled"].includes(status)) {
    return "border-red-700/15 bg-red-50 text-red-800";
  }
  if (["draft", "pending", "review", "open", "in_progress", "needs_attention", "waiting"].includes(status)) {
    return "border-amber-700/15 bg-amber-50 text-amber-800";
  }
  return "border-black/[0.08] bg-[#F7F6F3] text-[#706B63]";
}

function recordTitle(row, capability) {
  return text(
    row?.invoice_number || row?.journal_number || row?.payment_number || row?.purchase_order_number ||
    row?.receipt_number || row?.transaction_number || row?.statement_number || row?.case_number ||
    row?.account_name || row?.vendor_name || row?.customer_name || row?.asset_name || row?.legal_name ||
    row?.period_name || row?.name || row?.title || row?.code || capability?.document || capability?.name || "Record"
  );
}

function recordSubtitle(row) {
  return [
    row?.account_code,
    row?.customer_name,
    row?.vendor_name,
    row?.reference,
    row?.currency_code,
    row?.status,
  ].filter(Boolean).slice(0, 3).join(" · ");
}

function defaultDetailFields(row) {
  if (!row) return [];
  const hidden = new Set([
    "id", "organization_id", "entity_id", "period_id", "party_id", "staff_id", "created_by", "updated_by",
  ]);
  return Object.entries(row)
    .filter(([key, value]) => !hidden.has(key) && !key.endsWith("_id") && value !== null && value !== undefined && value !== "" && typeof value !== "object")
    .slice(0, 24)
    .map(([key, value]) => ({ label: label(key), value }));
}

function ContextChip({ children }) {
  if (!children) return null;
  return (
    <span className="rounded-full border border-black/[0.08] bg-[#FAF9F7] px-2.5 py-1 text-[10px] text-[#716D66]">
      {children}
    </span>
  );
}

export default function FinanceAccountantRecordsWorkCenter({
  capability,
  organizationId,
  entityId,
  periodId,
}) {
  const config = capability?.ui || {};
  const presentation = config.financePresentation || capability?.runtime?.financePresentation || {};
  const columns = Array.isArray(presentation.columns) ? presentation.columns : [];
  const contextScope = capability?.contextScope || presentation.scope || "entity";
  const requiresEntity = contextScope === "entity";
  const contextReady = Boolean(organizationId && (!requiresEntity || entityId));
  const api = config.api || capability?.runtime?.listApi || null;
  const create = capability?.create?.enabled === true ? capability.create : null;
  const createEngine = useCreateEngine();

  const [loading, setLoading] = useState(Boolean(api));
  const [error, setError] = useState("");
  const [payload, setPayload] = useState({});
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [activeEngine, setActiveEngine] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState({});
  const [submissionKey, setSubmissionKey] = useState(null);

  const currencyCode =
    payload?.currencyCode || payload?.currency_code || payload?.context?.currency || rows.find((row) => row?.currency_code)?.currency_code || null;

  const actions = useMemo(() => list(capability?.actions), [capability]);
  const topMenu = useMemo(() => {
    const source = list(capability?.topMenu || config.topMenu);
    const seen = new Set();
    return source.filter((action) => {
      if (action?.type === "create") return false;
      if (["import", "export", "automation", "settings"].includes(String(action?.type || "").toLowerCase())) return false;
      const key = action?.id || action?.label || action?.type;
      if (!key || seen.has(key)) return false;
      if (!action?.api && !action?.endpoint && !action?.engine && !action?.href && action?.type !== "report" && !action?.capability) return false;
      seen.add(key);
      return true;
    });
  }, [capability, config.topMenu]);
  const rowMenu = useMemo(() => list(capability?.rowMenu || config.rowMenu), [capability, config.rowMenu]);

  useEffect(() => {
    if (!api || !contextReady) {
      setRows([]);
      setPayload({});
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
        url.searchParams.set("workspaceId", "finance");
        url.searchParams.set("capabilityId", capability?.id || "");
        const response = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body?.success === false) throw new Error(body?.error || `Finance data load failed (${response.status})`);
        if (!active) return;
        setPayload(body || {});
        const loaded = firstArray(body || {}, config.rowsKey);
        setRows(loaded);
        setSelectedId((current) => current && loaded.some((row) => row.id === current) ? current : loaded[0]?.id || null);
      } catch (loadError) {
        if (active) {
          setRows([]);
          setPayload({});
          setError(loadError?.message || "Finance data load failed");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [api, contextReady, organizationId, entityId, periodId, capability?.id, config.rowsKey, refreshKey]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    const searchKeys = Array.isArray(config.search) && config.search.length ? config.search : Object.keys(rows[0] || {});
    return rows.filter((row) => searchKeys.some((key) => text(valueAt(row, [key])).toLowerCase().includes(needle)));
  }, [rows, query, config.search]);

  const selected = filteredRows.find((row) => row.id === selectedId) || filteredRows[0] || null;
  const detailFields = defaultDetailFields(selected);
  const collections = selected
    ? Object.entries(selected).filter(([, value]) => Array.isArray(value) && value.length).slice(0, 4)
    : [];

  function refresh() {
    setRefreshKey((value) => value + 1);
  }

  function openCreate() {
    if (!create) return;
    setSubmissionKey(globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);
    setForm({});
    createEngine.show();
  }

  async function saveCreate() {
    if (!create) return;
    const schema = create.schema || getForm(create.form || capability?.id) || [];
    const missing = schema.filter((field) => field?.required && (form[field.name] === undefined || form[field.name] === null || form[field.name] === "")).map((field) => field.label || field.name);
    if (missing.length) throw new Error(`Complete required fields: ${missing.join(", ")}`);

    const endpoint = create.endpoint || create.api || (create.capability && create.action ? "/api/ubte/execute" : "/api/workspace/create");
    const resolvedKey = submissionKey || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const context = {
      organizationId,
      organization_id: organizationId,
      entityId,
      entity_id: entityId,
      periodId,
      period_id: periodId,
    };
    const payloadBody = {
      ...form,
      ...context,
      idempotencyKey: resolvedKey,
      idempotency_key: resolvedKey,
      module: capability?.id,
      action: create,
      capability: create.capability,
    };
    const requestBody = create.capability && create.action && !create.endpoint && !create.api
      ? { ...context, domain: create.domain || "finance", capability: create.capability, action: create.action, payload: payloadBody }
      : payloadBody;
    const response = await fetch(endpoint, {
      method: String(create.method || "POST").toUpperCase(),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.success === false) throw new Error(result?.error || `Create failed (${response.status})`);
    createEngine.hide();
    setForm({});
    setSubmissionKey(null);
    refresh();
  }

  function runAction(rawAction, row = null) {
    const action = resolveFinanceActionPresentation(rawAction);
    if (!action) return;
    if (action?.type === "create") {
      openCreate();
      return;
    }
    if (action?.href) {
      window.location.assign(action.href);
      return;
    }
    if (action?.type === "report" || action?.type === "reports") {
      window.dispatchEvent(new CustomEvent("workspace:report", {
        detail: { action, row, organizationId, entityId, periodId, workspaceId: "finance", moduleKey: capability?.id },
      }));
      return;
    }
    setActiveEngine({
      action,
      row,
    });
  }

  const summary = useMemo(() => {
    const statusCounts = new Map();
    for (const row of rows) {
      const status = text(row?.status || row?.approval_status || row?.match_status || row?.period_status);
      if (status) statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    }
    return [...statusCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [rows]);

  return (
    <main className="min-h-[calc(100vh-112px)] bg-[#F7F6F3] text-[#1B1A18]">
      <div className="mx-auto max-w-[1760px] px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
        <header className="sticky top-0 z-20 -mx-4 border-b border-black/[0.07] bg-[#F7F6F3]/95 px-4 pb-4 backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.21em] text-[#9A7045]">
                <span>Finance</span>
                <span className="text-black/20">/</span>
                <span>{presentation.family_label || "Accounting"}</span>
              </div>
              <h1 className="mt-1.5 text-[27px] font-semibold tracking-[-0.035em] text-[#1B1A18] sm:text-[30px]">
                {capability?.name || "Finance Records"}
              </h1>
              <p className="mt-1 max-w-4xl text-[12px] leading-5 text-[#777169]">
                {capability?.description || presentation.review_label || "Review accounting records and supporting evidence."}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <ContextChip>{presentation.review_label}</ContextChip>
                <ContextChip>{requiresEntity ? "Legal entity scoped" : "Organization scoped"}</ContextChip>
                {periodId ? <ContextChip>Accounting period selected</ContextChip> : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={refresh}
                disabled={loading}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/[0.09] bg-white px-3 text-[11px] font-medium text-[#56514A] transition hover:border-[#D6A66A]/45 hover:bg-[#D6A66A]/[0.05] disabled:opacity-45"
              >
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
              {topMenu.length ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuId(menuId === "__top__" ? null : "__top__")}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/[0.09] bg-white px-3 text-[11px] font-medium text-[#56514A] transition hover:border-[#D6A66A]/45"
                  >
                    Actions <MoreHorizontal size={14} />
                  </button>
                  {menuId === "__top__" ? (
                    <div className="absolute right-0 top-11 z-40 w-72 rounded-xl border border-black/[0.1] bg-white p-2 shadow-[0_18px_50px_rgba(31,27,20,0.15)]">
                      <MasterActionMenu
                        actions={topMenu}
                        row={selected}
                        organizationId={organizationId}
                        entityId={entityId}
                        periodId={periodId}
                        workspaceId="finance"
                        moduleKey={capability?.id}
                        onCreate={openCreate}
                        onAction={({ action, row }) => runAction(action, row)}
                        onClose={() => setMenuId(null)}
                        onRefresh={refresh}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
              {create ? (
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1F1E1B] px-3.5 text-[11px] font-semibold text-white transition hover:bg-black"
                >
                  <Plus size={13} /> {create.label || `New ${capability?.document || "record"}`}
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {!contextReady ? (
          <section className="mt-4 rounded-xl border border-amber-700/15 bg-amber-50 p-4 text-[12px] text-amber-900">
            Select the required legal entity before working with this Finance capability.
          </section>
        ) : (
          <>
            <section className="mt-4 flex flex-col gap-3 rounded-xl border border-black/[0.07] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)] md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-black/[0.08] bg-[#FAF9F7] px-3">
                <Search size={14} className="text-[#9A958D]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Search ${String(capability?.name || "records").toLowerCase()}…`}
                  className="h-9 min-w-0 flex-1 bg-transparent text-[12px] text-[#302E2A] outline-none placeholder:text-[#AAA59D]"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#777169]">
                <span className="rounded-lg bg-[#F7F6F3] px-2.5 py-1.5 font-medium">{filteredRows.length} records</span>
                {summary.map(([status, count]) => (
                  <span key={status} className={`rounded-lg border px-2.5 py-1.5 font-medium ${statusTone(status)}`}>
                    {label(status)} {count}
                  </span>
                ))}
              </div>
            </section>

            <div className="mt-3 grid min-h-[620px] gap-3 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
              <section className="min-w-0 overflow-visible rounded-xl border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                {loading ? (
                  <div className="p-8 text-[12px] text-[#817B73]">Loading accounting records…</div>
                ) : error ? (
                  <div className="m-4 rounded-lg border border-red-700/15 bg-red-50 p-4 text-[12px] text-red-800">{error}</div>
                ) : filteredRows.length === 0 ? (
                  <div className="p-8 text-[12px] text-[#817B73]">No records exist for this context.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-left text-[11px]">
                      <thead className="sticky top-0 z-10 border-b border-black/[0.07] bg-[#FAF9F7] text-[9px] font-semibold uppercase tracking-[0.12em] text-[#858078]">
                        <tr>
                          {columns.map((column, index) => (
                            <th key={`${column.label}-${index}`} className={`whitespace-nowrap px-3 py-2.5 ${column.align === "right" ? "text-right" : "text-left"}`}>
                              {column.label}
                            </th>
                          ))}
                          <th className="w-12 px-2 py-2.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((row, rowIndex) => {
                          const active = selected?.id === row.id || (!row.id && selected === row);
                          const rowKey = row.id || `${capability?.id}-${rowIndex}`;
                          const rowStatus = valueAt(row, ["status", "approval_status", "match_status", "period_status"]);
                          return (
                            <tr
                              key={rowKey}
                              onClick={() => setSelectedId(row.id || null)}
                              className={`group cursor-pointer border-b border-black/[0.05] transition last:border-0 ${active ? "bg-[#D6A66A]/[0.09] shadow-[inset_3px_0_0_#B18150]" : "hover:bg-[#F8F6F1]"}`}
                            >
                              {columns.map((column, columnIndex) => {
                                const raw = valueAt(row, column.keys);
                                const isStatus = String(column.label).toLowerCase().includes("status");
                                return (
                                  <td key={`${column.label}-${columnIndex}`} className={`max-w-[260px] px-3 py-2.5 align-middle ${column.align === "right" ? "text-right tabular-nums" : "text-left"}`}>
                                    {columnIndex === 0 ? (
                                      <div className="min-w-[160px]">
                                        <div className="truncate font-medium text-[#35322D]">{raw ?? recordTitle(row, capability)}</div>
                                        <div className="mt-0.5 max-w-[220px] truncate text-[9px] text-[#99938A]">{recordSubtitle(row) || "Open for accounting review"}</div>
                                      </div>
                                    ) : isStatus && (raw || rowStatus) ? (
                                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-medium ${statusTone(raw || rowStatus)}`}>
                                        {label(raw || rowStatus)}
                                      </span>
                                    ) : (
                                      <span className="block truncate text-[#5F5A53]">{display(raw, column.format, currencyCode)}</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="relative px-2 py-2.5 text-right">
                                {rowMenu.length ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setMenuId(menuId === rowKey ? null : rowKey);
                                    }}
                                    className="rounded-md p-1.5 text-[#8D877E] opacity-60 transition hover:bg-black/[0.05] hover:text-[#3F3B35] group-hover:opacity-100"
                                    aria-label="Record actions"
                                  >
                                    <MoreHorizontal size={14} />
                                  </button>
                                ) : null}
                                {menuId === rowKey ? (
                                  <div className="absolute right-2 top-9 z-30 w-64 rounded-xl border border-black/[0.1] bg-white p-2 text-left shadow-[0_18px_50px_rgba(31,27,20,0.16)]">
                                    <MasterActionMenu
                                      actions={rowMenu}
                                      row={row}
                                      organizationId={organizationId}
                                      entityId={row?.entity_id || entityId}
                                      periodId={row?.period_id || periodId}
                                      workspaceId="finance"
                                      moduleKey={capability?.id}
                                      onSelect={() => setSelectedId(row.id || null)}
                                      onCreate={openCreate}
                                      onAction={({ action, row: actionRow }) => runAction(action, actionRow || row)}
                                      onClose={() => setMenuId(null)}
                                      onRefresh={refresh}
                                    />
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <aside className="min-w-0 rounded-xl border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                {selected ? (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="border-b border-black/[0.07] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#9A7045]">Record review</div>
                          <h2 className="mt-1 truncate text-[18px] font-semibold tracking-[-0.02em] text-[#292621]">{recordTitle(selected, capability)}</h2>
                          <p className="mt-1 truncate text-[10px] text-[#8C867E]">{recordSubtitle(selected) || presentation.review_label}</p>
                        </div>
                        {valueAt(selected, ["status", "approval_status", "match_status"]) ? (
                          <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-medium ${statusTone(valueAt(selected, ["status", "approval_status", "match_status"]))}`}>
                            {label(valueAt(selected, ["status", "approval_status", "match_status"]))}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-black/[0.06] pt-3 text-[9px] text-[#918B83]">
                        <span>{filteredRows.findIndex((row) => row === selected) + 1} of {filteredRows.length}</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const index = filteredRows.findIndex((row) => row === selected);
                              const previous = filteredRows[Math.max(0, index - 1)];
                              if (previous) setSelectedId(previous.id || null);
                            }}
                            className="rounded-md border border-black/[0.07] p-1 text-[#716B63] hover:bg-[#F7F6F3]"
                          ><ChevronLeft size={13} /></button>
                          <button
                            type="button"
                            onClick={() => {
                              const index = filteredRows.findIndex((row) => row === selected);
                              const next = filteredRows[Math.min(filteredRows.length - 1, index + 1)];
                              if (next) setSelectedId(next.id || null);
                            }}
                            className="rounded-md border border-black/[0.07] p-1 text-[#716B63] hover:bg-[#F7F6F3]"
                          ><ChevronRight size={13} /></button>
                        </div>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                      <div className="flex gap-4 border-b border-black/[0.06] text-[10px] font-medium text-[#6E685F]">
                        <span className="border-b-2 border-[#B18150] pb-2 text-[#463F37]">Overview</span>
                        {collections.length ? <span className="pb-2 text-[#9A948C]">Lines</span> : null}
                        <span className="pb-2 text-[#B0AAA2]">Audit</span>
                      </div>
                      <dl className="mt-3 divide-y divide-black/[0.055]">
                        {detailFields.map((field) => (
                          <div key={field.label} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-2.5 text-[10px]">
                            <dt className="text-[#918B83]">{field.label}</dt>
                            <dd className="min-w-0 break-words font-medium text-[#514C45]">{display(field.value, null, currencyCode)}</dd>
                          </div>
                        ))}
                      </dl>
                      {collections.map(([key, items]) => (
                        <section key={key} className="mt-5">
                          <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#918B83]">{label(key)}</div>
                          <div className="overflow-x-auto rounded-lg border border-black/[0.07]">
                            <table className="min-w-full text-[9px]">
                              <tbody className="divide-y divide-black/[0.05]">
                                {items.slice(0, 20).map((item, index) => (
                                  <tr key={item?.id || index}>
                                    <td className="px-2.5 py-2 text-[#5D5750]">{recordTitle(item || {}, capability)}</td>
                                    <td className="px-2.5 py-2 text-right tabular-nums text-[#7D766D]">{money(item?.amount ?? item?.debit ?? item?.credit ?? item?.total, item?.currency_code || currencyCode)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </section>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-[11px] text-[#8B857D]">Select a record to review details.</div>
                )}
              </aside>
            </div>
          </>
        )}
      </div>

      {activeEngine ? (
        <RowActionEngine
          action={activeEngine.action}
          row={activeEngine.row}
          organizationId={organizationId}
          entityId={activeEngine.row?.entity_id || entityId || null}
          periodId={activeEngine.row?.period_id || periodId || null}
          workspaceId="finance"
          moduleKey={capability?.id}
          onComplete={() => {
            setActiveEngine(null);
            refresh();
          }}
          onClose={() => setActiveEngine(null)}
        />
      ) : null}

      <CapabilityActionResolver
        open={createEngine.open}
        saving={createEngine.saving}
        action={create}
        fallbackLabel={create?.label || create?.title || `New ${capability?.document || "record"}`}
        schema={create?.schema || getForm(create?.form || capability?.id)}
        values={form}
        onChange={(name, value) => setForm((current) => ({ ...current, [name]: value }))}
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
