"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
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
import FinanceRecordReviewPanel from "@/components/workspace/finance/FinanceRecordReviewPanel";
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

function statusValue(row) {
  return text(row?.status || row?.approval_status || row?.match_status || row?.period_status);
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

function ContextChip({ children }) {
  if (!children) return null;
  return (
    <span className="rounded-full border border-black/[0.08] bg-[#FAF9F7] px-2.5 py-1 text-[10px] text-[#716D66]">
      {children}
    </span>
  );
}

function compareValues(a, b) {
  if (a === null || a === undefined || a === "") return 1;
  if (b === null || b === undefined || b === "") return -1;
  const aNumber = Number(a);
  const bNumber = Number(b);
  if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
  const aDate = new Date(a).getTime();
  const bDate = new Date(b).getTime();
  if (!Number.isNaN(aDate) && !Number.isNaN(bDate) && /[-T/]/.test(String(a))) return aDate - bDate;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
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
  const searchRef = useRef(null);

  const [loading, setLoading] = useState(Boolean(api));
  const [error, setError] = useState("");
  const [payload, setPayload] = useState({});
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortIndex, setSortIndex] = useState(0);
  const [sortDirection, setSortDirection] = useState("asc");
  const [selectedId, setSelectedId] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [activeEngine, setActiveEngine] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState({});
  const [submissionKey, setSubmissionKey] = useState(null);
  const [savedViews, setSavedViews] = useState([]);
  const [selectedViewId, setSelectedViewId] = useState("");

  const currencyCode =
    payload?.currencyCode || payload?.currency_code || payload?.context?.currency || rows.find((row) => row?.currency_code)?.currency_code || null;

  const topMenu = useMemo(() => {
    const source = list(capability?.topMenu || config.topMenu);
    const seen = new Set();
    return source.filter((action) => {
      if (action?.type === "create") return false;
      if (["import", "export", "automation", "settings"].includes(String(action?.type || "").toLowerCase())) return false;
      const key = action?.id || action?.label || action?.type;
      if (!key || seen.has(key)) return false;
      if (!action?.api && !action?.endpoint && !action?.engine && !action?.href && !["report", "reports"].includes(action?.type) && !action?.capability) return false;
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

  useEffect(() => {
    if (!organizationId || !capability?.id) return;
    let active = true;
    async function loadViews() {
      const url = new URL("/api/finance/review", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("capabilityId", capability.id);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (active && response.ok && body?.success !== false) {
        const views = body.saved_views || [];
        setSavedViews(views);
        const defaultView = views.find((view) => view.is_default);
        if (defaultView) applySavedView(defaultView, false);
      }
    }
    loadViews();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, capability?.id]);

  const statuses = useMemo(
    () => [...new Set(rows.map(statusValue).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const searchKeys = Array.isArray(config.search) && config.search.length ? config.search : Object.keys(rows[0] || {});
    const filtered = rows.filter((row) => {
      if (statusFilter && statusValue(row).toLowerCase() !== statusFilter.toLowerCase()) return false;
      if (!needle) return true;
      return searchKeys.some((key) => text(valueAt(row, [key])).toLowerCase().includes(needle));
    });
    const column = columns[sortIndex] || columns[0];
    if (!column) return filtered;
    return [...filtered].sort((a, b) => {
      const comparison = compareValues(valueAt(a, column.keys), valueAt(b, column.keys));
      return sortDirection === "desc" ? -comparison : comparison;
    });
  }, [rows, query, statusFilter, config.search, columns, sortIndex, sortDirection]);

  const selected = filteredRows.find((row) => row.id === selectedId) || filteredRows[0] || null;

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
      const index = Math.max(0, filteredRows.findIndex((row) => row === selected || (row?.id && row.id === selected?.id)));
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
      .filter((field) => field?.required && (form[field.name] === undefined || form[field.name] === null || form[field.name] === ""))
      .map((field) => field.label || field.name);
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
    if (action?.type === "create") return openCreate();
    if (action?.href) return window.location.assign(action.href);
    if (action?.type === "report" || action?.type === "reports") {
      window.dispatchEvent(new CustomEvent("workspace:report", {
        detail: { action, row, organizationId, entityId, periodId, workspaceId: "finance", moduleKey: capability?.id },
      }));
      return;
    }
    setActiveEngine({ action, row });
  }

  function applySavedView(view, select = true) {
    const settings = view?.configuration || {};
    setQuery(text(settings.query));
    setStatusFilter(text(settings.status_filter));
    setSortIndex(Number.isInteger(settings.sort_index) ? settings.sort_index : 0);
    setSortDirection(settings.sort_direction === "desc" ? "desc" : "asc");
    if (select) setSelectedViewId(view?.id || "");
  }

  async function saveCurrentView() {
    const name = window.prompt("Name this Finance view");
    if (!name?.trim()) return;
    const response = await fetch("/api/finance/review", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        capabilityId: capability?.id,
        action: "save_view",
        name: name.trim(),
        configuration: {
          query,
          status_filter: statusFilter,
          sort_index: sortIndex,
          sort_direction: sortDirection,
        },
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success === false) {
      window.alert(body?.error || "Unable to save Finance view");
      return;
    }
    const saved = body.saved_view;
    setSavedViews((current) => [saved, ...current.filter((view) => view.id !== saved.id && view.name !== saved.name)]);
    setSelectedViewId(saved.id);
  }

  const summary = useMemo(() => {
    const statusCounts = new Map();
    for (const row of rows) {
      const status = statusValue(row);
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
                <span>Finance</span><span className="text-black/20">/</span><span>{presentation.family_label || "Accounting"}</span>
              </div>
              <h1 className="mt-1.5 text-[27px] font-semibold tracking-[-0.035em] text-[#1B1A18] sm:text-[30px]">{capability?.name || "Finance Records"}</h1>
              <p className="mt-1 max-w-4xl text-[12px] leading-5 text-[#777169]">{capability?.description || presentation.review_label || "Review accounting records and supporting evidence."}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <ContextChip>{presentation.review_label}</ContextChip>
                <ContextChip>{requiresEntity ? "Legal entity scoped" : "Organization scoped"}</ContextChip>
                {periodId ? <ContextChip>Accounting period selected</ContextChip> : null}
                <ContextChip>↑ ↓ navigate · / search</ContextChip>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={refresh} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/[0.09] bg-white px-3 text-[11px] font-medium text-[#56514A] transition hover:border-[#D6A66A]/45 disabled:opacity-45">
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
              {topMenu.length ? (
                <div className="relative">
                  <button type="button" onClick={() => setMenuId(menuId === "__top__" ? null : "__top__")} className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/[0.09] bg-white px-3 text-[11px] font-medium text-[#56514A]">Actions <MoreHorizontal size={14} /></button>
                  {menuId === "__top__" ? (
                    <div className="absolute right-0 top-11 z-40 w-72 rounded-xl border border-black/[0.1] bg-white p-2 shadow-[0_18px_50px_rgba(31,27,20,0.15)]">
                      <MasterActionMenu actions={topMenu} row={selected} organizationId={organizationId} entityId={entityId} periodId={periodId} workspaceId="finance" moduleKey={capability?.id} onCreate={openCreate} onAction={({ action, row }) => runAction(action, row)} onClose={() => setMenuId(null)} onRefresh={refresh} />
                    </div>
                  ) : null}
                </div>
              ) : null}
              {create ? (
                <button type="button" onClick={openCreate} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1F1E1B] px-3.5 text-[11px] font-semibold text-white transition hover:bg-black"><Plus size={13} /> {create.label || `New ${capability?.document || "record"}`}</button>
              ) : null}
            </div>
          </div>
        </header>

        {!contextReady ? (
          <section className="mt-4 rounded-xl border border-amber-700/15 bg-amber-50 p-4 text-[12px] text-amber-900">Select the required legal entity before working with this Finance capability.</section>
        ) : (
          <>
            <section className="mt-4 grid gap-2 rounded-xl border border-black/[0.07] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)] lg:grid-cols-[minmax(260px,1fr)_180px_200px_auto]">
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-black/[0.08] bg-[#FAF9F7] px-3">
                <Search size={14} className="text-[#9A958D]" />
                <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${String(capability?.name || "records").toLowerCase()}…`} className="h-9 min-w-0 flex-1 bg-transparent text-[12px] text-[#302E2A] outline-none placeholder:text-[#AAA59D]" />
              </div>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[10px] text-[#625D56] outline-none">
                <option value="">All statuses</option>
                {statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
              </select>
              <select
                value={selectedViewId}
                onChange={(event) => {
                  const view = savedViews.find((candidate) => candidate.id === event.target.value);
                  setSelectedViewId(event.target.value);
                  if (view) applySavedView(view, false);
                }}
                className="h-9 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[10px] text-[#625D56] outline-none"
              >
                <option value="">Current view</option>
                {savedViews.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
              </select>
              <button type="button" onClick={saveCurrentView} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 text-[10px] font-medium text-[#625D56]"><BookmarkPlus size={12} /> Save view</button>
              <div className="flex flex-wrap items-center gap-2 lg:col-span-4 text-[10px] text-[#777169]">
                <span className="rounded-lg bg-[#F7F6F3] px-2.5 py-1.5 font-medium">{filteredRows.length} of {rows.length}</span>
                {summary.map(([status, count]) => <span key={status} className={`rounded-lg border px-2.5 py-1.5 font-medium ${statusTone(status)}`}>{label(status)} {count}</span>)}
              </div>
            </section>

            <div className="mt-3 grid min-h-[640px] gap-3 xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_440px]">
              <section className="min-w-0 overflow-visible rounded-xl border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                {loading ? <div className="p-8 text-[12px] text-[#817B73]">Loading accounting records…</div> : error ? <div className="m-4 rounded-lg border border-red-700/15 bg-red-50 p-4 text-[12px] text-red-800">{error}</div> : filteredRows.length === 0 ? <div className="p-8 text-[12px] text-[#817B73]">No records match this accounting view.</div> : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-left text-[11px]">
                      <thead className="sticky top-0 z-10 border-b border-black/[0.07] bg-[#FAF9F7] text-[9px] font-semibold uppercase tracking-[0.12em] text-[#858078]">
                        <tr>
                          {columns.map((column, index) => (
                            <th key={`${column.label}-${index}`} className={`whitespace-nowrap px-3 py-2.5 ${column.align === "right" ? "text-right" : "text-left"}`}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (sortIndex === index) setSortDirection((current) => current === "asc" ? "desc" : "asc");
                                  else { setSortIndex(index); setSortDirection("asc"); }
                                }}
                                className={`inline-flex items-center gap-1 ${column.align === "right" ? "justify-end" : "justify-start"}`}
                              >
                                {column.label}
                                {sortIndex === index ? (sortDirection === "asc" ? <ArrowUp size={9} /> : <ArrowDown size={9} />) : null}
                              </button>
                            </th>
                          ))}
                          <th className="w-12 px-2 py-2.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((row, rowIndex) => {
                          const active = selected?.id === row.id || (!row.id && selected === row);
                          const rowKey = row.id || `${capability?.id}-${rowIndex}`;
                          const rowStatus = statusValue(row);
                          return (
                            <tr key={rowKey} onClick={() => setSelectedId(row.id || null)} className={`group cursor-pointer border-b border-black/[0.05] transition last:border-0 ${active ? "bg-[#D6A66A]/[0.09] shadow-[inset_3px_0_0_#B18150]" : "hover:bg-[#F8F6F1]"}`}>
                              {columns.map((column, columnIndex) => {
                                const raw = valueAt(row, column.keys);
                                const isStatus = String(column.label).toLowerCase().includes("status");
                                return (
                                  <td key={`${column.label}-${columnIndex}`} className={`max-w-[260px] px-3 py-2.5 align-middle ${column.align === "right" ? "text-right tabular-nums" : "text-left"}`}>
                                    {columnIndex === 0 ? (
                                      <div className="min-w-[160px]"><div className="truncate font-medium text-[#35322D]">{raw ?? recordTitle(row, capability)}</div><div className="mt-0.5 max-w-[220px] truncate text-[9px] text-[#99938A]">{recordSubtitle(row) || "Open for accounting review"}</div></div>
                                    ) : isStatus && (raw || rowStatus) ? (
                                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-medium ${statusTone(raw || rowStatus)}`}>{label(raw || rowStatus)}</span>
                                    ) : <span className="block truncate text-[#5F5A53]">{display(raw, column.format, currencyCode)}</span>}
                                  </td>
                                );
                              })}
                              <td className="relative px-2 py-2.5 text-right">
                                {rowMenu.length ? <button type="button" onClick={(event) => { event.stopPropagation(); setMenuId(menuId === rowKey ? null : rowKey); }} className="rounded-md p-1.5 text-[#8D877E] opacity-60 transition hover:bg-black/[0.05] hover:text-[#3F3B35] group-hover:opacity-100" aria-label="Record actions"><MoreHorizontal size={14} /></button> : null}
                                {menuId === rowKey ? (
                                  <div className="absolute right-2 top-9 z-30 w-64 rounded-xl border border-black/[0.1] bg-white p-2 text-left shadow-[0_18px_50px_rgba(31,27,20,0.16)]">
                                    <MasterActionMenu actions={rowMenu} row={row} organizationId={organizationId} entityId={row?.entity_id || entityId} periodId={row?.period_id || periodId} workspaceId="finance" moduleKey={capability?.id} onSelect={() => setSelectedId(row.id || null)} onCreate={openCreate} onAction={({ action, row: actionRow }) => runAction(action, actionRow || row)} onClose={() => setMenuId(null)} onRefresh={refresh} />
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

              <aside className="min-w-0 overflow-hidden rounded-xl border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
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
          </>
        )}
      </div>

      {activeEngine ? (
        <RowActionEngine action={activeEngine.action} row={activeEngine.row} organizationId={organizationId} entityId={activeEngine.row?.entity_id || entityId || null} periodId={activeEngine.row?.period_id || periodId || null} workspaceId="finance" moduleKey={capability?.id} onComplete={() => { setActiveEngine(null); refresh(); }} onClose={() => setActiveEngine(null)} />
      ) : null}

      <CapabilityActionResolver open={createEngine.open} saving={createEngine.saving} action={create} fallbackLabel={create?.label || create?.title || `New ${capability?.document || "record"}`} schema={create?.schema || getForm(create?.form || capability?.id)} values={form} onChange={(name, value) => setForm((current) => ({ ...current, [name]: value }))} onClose={createEngine.hide} onSave={() => createEngine.save(saveCreate)} organizationId={organizationId} entityId={entityId} periodId={periodId} currency={currencyCode} moduleKey={capability?.id} onComplete={refresh} />

      <WorkspaceEventHub organizationId={organizationId} entityId={entityId} periodId={periodId} />
    </main>
  );
}
