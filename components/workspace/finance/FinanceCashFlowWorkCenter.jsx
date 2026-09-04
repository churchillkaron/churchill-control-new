"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CalendarRange, RefreshCw, Search } from "lucide-react";
import WorkspaceEventHub from "@/components/workspace/WorkspaceEventHub";

function text(value) {
  return String(value ?? "").trim();
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
    return `${currencyCode || ""} ${numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
  }
}

function date(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function phaseTone(value) {
  const phase = text(value).toUpperCase();
  if (phase === "HISTORICAL") return "border-black/[0.08] bg-[#F7F6F3] text-[#666159]";
  if (phase === "CURRENT") return "border-amber-700/15 bg-amber-50 text-amber-900";
  return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
}

function sourceLabel(values) {
  const list = Array.isArray(values) ? values : [];
  if (!list.length) return "No actual bank activity";
  if (list.includes("BANK_STATEMENT") && list.includes("BANK_LEDGER")) return "Statement + ledger fallback";
  if (list.includes("BANK_STATEMENT")) return "Bank statement";
  return "Bank ledger fallback";
}

function rowSearchText(row) {
  return [row?.period_start, row?.period_end, row?.phase, row?.currency_code, ...(row?.actual_sources || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

async function loadJson(url) {
  const response = await fetch(url, { cache: "no-store", credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) throw new Error(body?.error || `Request failed (${response.status})`);
  return body;
}

function EvidenceList({ title, entries, currencyCode, direction }) {
  const rows = Array.isArray(entries) ? entries : [];
  return (
    <section className="border-t border-black/[0.07] px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#777169]">{title}</h3>
        <span className="text-[9px] text-[#9B958C]">{rows.length ? `Top ${rows.length}` : "None"}</span>
      </div>
      {rows.length ? (
        <div className="space-y-1.5">
          {rows.map((entry) => (
            <div key={`${title}-${entry.id}-${entry.date || entry.due_date}`} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-black/[0.06] bg-[#FAF9F7] px-2.5 py-2 text-[10px]">
              <span className="text-[#817B73]">{date(entry.date || entry.due_date)}</span>
              <div className="min-w-0">
                <div className="truncate font-medium text-[#36322E]">{entry.document_number || entry.reference_number || entry.description || entry.bank_account_name || entry.source}</div>
                <div className="truncate text-[9px] text-[#9A958D]">{entry.bank_account_name || entry.status || entry.source}</div>
              </div>
              <span className={direction === "out" ? "font-semibold text-[#8D4B43]" : "font-semibold text-[#2F6B4F]"}>{direction === "out" ? "−" : "+"}{money(entry.amount, currencyCode)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-black/[0.08] bg-[#FAF9F7] px-3 py-4 text-[10px] text-[#8A857D]">No evidence in this period.</div>
      )}
    </section>
  );
}

export default function FinanceCashFlowWorkCenter({ organizationId, entityId, periodId }) {
  const searchRef = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [grain, setGrain] = useState("week");
  const [historyDays, setHistoryDays] = useState("28");
  const [horizonDays, setHorizonDays] = useState("91");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!organizationId || !entityId) {
      setData(null);
      setSelectedId(null);
      return;
    }
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError("");
        const url = new URL("/api/finance/cash-flow/run", window.location.origin);
        url.searchParams.set("organizationId", organizationId);
        url.searchParams.set("entityId", entityId);
        url.searchParams.set("grain", grain);
        url.searchParams.set("historyDays", historyDays);
        url.searchParams.set("horizonDays", horizonDays);
        const body = await loadJson(url.toString());
        if (!active) return;
        setData(body);
        const rows = Array.isArray(body?.rows) ? body.rows : [];
        setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : rows.find((row) => row.phase === "CURRENT")?.id || rows[0]?.id || null);
      } catch (loadError) {
        if (active) {
          setData(null);
          setSelectedId(null);
          setError(loadError?.message || "Cash flow could not be loaded");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [entityId, grain, historyDays, horizonDays, organizationId, refreshKey]);

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const currencies = Array.isArray(data?.currencies) ? data.currencies : [];
  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (currencyFilter && row.currency_code !== currencyFilter) return false;
      if (needle && !rowSearchText(row).includes(needle)) return false;
      return true;
    });
  }, [currencyFilter, query, rows]);
  const selected = visibleRows.find((row) => row.id === selectedId) || visibleRows[0] || null;

  useEffect(() => {
    function onKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase();
      if (["input", "textarea", "select"].includes(tag)) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp"].includes(event.key) || !visibleRows.length) return;
      event.preventDefault();
      const index = Math.max(0, visibleRows.findIndex((row) => row.id === selected?.id));
      const nextIndex = event.key === "ArrowDown" ? Math.min(visibleRows.length - 1, index + 1) : Math.max(0, index - 1);
      setSelectedId(visibleRows[nextIndex]?.id || null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected?.id, visibleRows]);

  return (
    <main className="min-h-[calc(100vh-112px)] bg-[#F7F6F3] text-[#1B1A18]">
      <div className="mx-auto max-w-[1760px] px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
        <header className="flex flex-col gap-3 border-b border-black/[0.07] pb-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.21em] text-[#9A7045]">Finance / Treasury</div>
            <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-0.035em]">Cash Flow</h1>
            <p className="mt-1 max-w-4xl text-[12px] leading-5 text-[#777169]">Actual bank cash movement and scheduled receipts/payments through time. Actuals and forecasts remain separate; currencies are never blended.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/[0.09] bg-white px-3 text-[11px] font-medium text-[#56514A]"><RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh</button>
            <button type="button" onClick={() => window.location.assign("/finance/cash-management")} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1F1E1B] px-3.5 text-[11px] font-semibold text-white">Open Cash Management</button>
          </div>
        </header>

        {!organizationId || !entityId ? (
          <section className="mt-4 rounded-xl border border-amber-700/15 bg-amber-50 p-4 text-[12px] text-amber-900">Select a legal entity before reviewing Cash Flow.</section>
        ) : (
          <>
            <section className="mt-4 grid gap-2 rounded-xl border border-black/[0.07] bg-white p-3 lg:grid-cols-[minmax(260px,1fr)_130px_150px_150px_140px]">
              <div className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-[#FAF9F7] px-3"><Search size={14} className="text-[#9A958D]" /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search period or evidence source…" className="h-9 min-w-0 flex-1 bg-transparent text-[12px] outline-none" /></div>
              <select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)} className="h-9 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[10px]"><option value="">All currencies</option>{currencies.map((value) => <option key={value} value={value}>{value}</option>)}</select>
              <select value={grain} onChange={(event) => setGrain(event.target.value)} className="h-9 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[10px]"><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select>
              <select value={historyDays} onChange={(event) => setHistoryDays(event.target.value)} className="h-9 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[10px]"><option value="28">28d history</option><option value="91">91d history</option><option value="182">182d history</option></select>
              <select value={horizonDays} onChange={(event) => setHorizonDays(event.target.value)} className="h-9 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[10px]"><option value="30">30d forecast</option><option value="91">91d forecast</option><option value="182">182d forecast</option><option value="365">365d forecast</option></select>
              <div className="lg:col-span-5 flex flex-wrap items-center gap-2 text-[9px] text-[#817B73]"><span>{date(data?.history_start)} → {date(data?.horizon_end)}</span><span>·</span><span>{data?.evidence?.statement_actual_rows || 0} statement actuals</span><span>·</span><span>{data?.evidence?.ledger_actual_rows || 0} ledger fallback actuals</span>{data?.evidence?.ambiguous_actual_rows ? <><span>·</span><span className="text-amber-800">{data.evidence.ambiguous_actual_rows} ambiguous rows excluded</span></> : null}</div>
            </section>

            {error ? <div className="mt-3 rounded-xl border border-red-700/15 bg-red-50 p-4 text-[12px] text-red-800">{error}</div> : null}

            <div className="mt-3 grid min-h-[650px] gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
              <section className="overflow-hidden rounded-xl border border-black/[0.07] bg-white">
                {loading && !data ? <div className="p-8 text-[12px] text-[#817B73]">Loading cash-flow evidence…</div> : !visibleRows.length ? <div className="p-8 text-[12px] text-[#817B73]">No cash-flow periods match this view.</div> : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-left text-[11px]">
                      <thead className="border-b border-black/[0.07] bg-[#FAF9F7] text-[9px] font-semibold uppercase tracking-[0.11em] text-[#858078]"><tr><th className="px-3 py-2.5">Period</th><th className="px-3 py-2.5">Phase</th><th className="px-3 py-2.5 text-right">Actual In</th><th className="px-3 py-2.5 text-right">Actual Out</th><th className="px-3 py-2.5 text-right">Actual Net</th><th className="px-3 py-2.5 text-right">Scheduled In</th><th className="px-3 py-2.5 text-right">Scheduled Out</th><th className="px-3 py-2.5 text-right">Scheduled Net</th><th className="px-3 py-2.5">Evidence</th></tr></thead>
                      <tbody>{visibleRows.map((row) => {
                        const active = row.id === selected?.id;
                        return <tr key={row.id} onClick={() => setSelectedId(row.id)} className={`cursor-pointer border-b border-black/[0.055] ${active ? "bg-[#F5EFE7]" : "hover:bg-[#FAF9F7]"}`}><td className="whitespace-nowrap px-3 py-3"><div className="font-medium">{date(row.period_start)}</div><div className="text-[9px] text-[#9A958D]">to {date(row.period_end)} · {row.currency_code}</div></td><td className="px-3 py-3"><span className={`rounded-md border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${phaseTone(row.phase)}`}>{row.phase}</span></td><td className="px-3 py-3 text-right text-[#2F6B4F]">{money(row.actual_in,row.currency_code)}</td><td className="px-3 py-3 text-right text-[#8D4B43]">{money(row.actual_out,row.currency_code)}</td><td className="px-3 py-3 text-right font-semibold">{money(row.actual_net,row.currency_code)}</td><td className="px-3 py-3 text-right text-[#2F6B4F]">{money(row.scheduled_in,row.currency_code)}</td><td className="px-3 py-3 text-right text-[#8D4B43]">{money(row.scheduled_out,row.currency_code)}</td><td className="px-3 py-3 text-right font-semibold">{money(row.scheduled_net,row.currency_code)}</td><td className="px-3 py-3 text-[9px] text-[#817B73]">{sourceLabel(row.actual_sources)}</td></tr>;
                      })}</tbody>
                    </table>
                  </div>
                )}
              </section>

              <aside className="overflow-hidden rounded-xl border border-black/[0.07] bg-white">
                {selected ? <>
                  <div className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#9A7045]">Selected period</div><h2 className="mt-1 text-[17px] font-semibold">{date(selected.period_start)} – {date(selected.period_end)}</h2><div className="mt-1 text-[10px] text-[#817B73]">{selected.currency_code} · {sourceLabel(selected.actual_sources)}</div></div><CalendarRange size={18} className="text-[#9A7045]" /></div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-lg border border-black/[0.06] bg-[#FAF9F7] p-2.5"><div className="text-[#8A857D]">Actual movement</div><div className="mt-1 font-semibold">{money(selected.actual_net,selected.currency_code)}</div><div className="mt-1 text-[9px] text-[#A09A92]">{selected.actual_count} bank rows</div></div><div className="rounded-lg border border-black/[0.06] bg-[#FAF9F7] p-2.5"><div className="text-[#8A857D]">Scheduled movement</div><div className="mt-1 font-semibold">{money(selected.scheduled_net,selected.currency_code)}</div><div className="mt-1 text-[9px] text-[#A09A92]">{selected.scheduled_receipt_count} in · {selected.scheduled_payment_count} out</div></div></div>
                  </div>
                  <EvidenceList title="Actual bank evidence" entries={selected.actual_preview} currencyCode={selected.currency_code} direction="in" />
                  <EvidenceList title="Scheduled receipts" entries={selected.scheduled_receipts_preview} currencyCode={selected.currency_code} direction="in" />
                  <EvidenceList title="Scheduled payments" entries={selected.scheduled_payments_preview} currencyCode={selected.currency_code} direction="out" />
                  <section className="border-t border-black/[0.07] p-4 text-[10px] leading-5 text-[#777169]"><div className="font-semibold text-[#4F4A44]">Method</div><p>{data?.methodology?.actuals}</p><p className="mt-1">{data?.methodology?.forecast}</p><p className="mt-1">{data?.methodology?.currency}</p></section>
                </> : <div className="p-8 text-[12px] text-[#817B73]">Select a cash-flow period to inspect evidence.</div>}
              </aside>
            </div>
          </>
        )}
      </div>
      <WorkspaceEventHub organizationId={organizationId} entityId={entityId} periodId={periodId} />
    </main>
  );
}
