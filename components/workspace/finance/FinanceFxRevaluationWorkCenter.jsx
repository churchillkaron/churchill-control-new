"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Search } from "lucide-react";
import WorkspaceEventHub from "@/components/workspace/WorkspaceEventHub";

function text(value) {
  return String(value ?? "").trim();
}

function date(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
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
    return `${currencyCode || ""} ${numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
  }
}

function statusTone(value) {
  const status = text(value).toUpperCase();
  if (["COMPLETED", "NO_ADJUSTMENT"].includes(status)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (["FAILED", "BLOCKED"].includes(status)) return "border-red-700/15 bg-red-50 text-red-800";
  return "border-amber-700/15 bg-amber-50 text-amber-900";
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) throw new Error(body?.error || `Request failed (${response.status})`);
  return body;
}

function selectedIdsFromRun(run) {
  if (!Array.isArray(run?.account_ids)) return [];
  return run.account_ids.map(item => text(item?.account_id || item)).filter(Boolean);
}

function runSearchText(run) {
  return [run.revaluation_date, run.currency_code, run.functional_currency, run.rate_source, run.status, run.journal_entry_id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function AccountEvidenceTable({ rows, functionalCurrency }) {
  const values = Array.isArray(rows) ? rows : [];
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-[10px]">
        <thead className="border-b border-black/[0.07] bg-[#FAF9F7] text-[9px] font-semibold uppercase tracking-[0.08em] text-[#858078]">
          <tr>
            <th className="px-3 py-2.5">Account</th>
            <th className="px-3 py-2.5 text-right">Foreign balance</th>
            <th className="px-3 py-2.5 text-right">Historical carrying</th>
            <th className="px-3 py-2.5 text-right">Prior FX</th>
            <th className="px-3 py-2.5 text-right">Closing value</th>
            <th className="px-3 py-2.5 text-right">Adjustment</th>
            <th className="px-3 py-2.5">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {values.map(row => (
            <tr key={row.account_id} className="border-b border-black/[0.055]">
              <td className="px-3 py-3"><div className="font-medium text-[#37332F]">{row.account_code} · {row.account_name}</div><div className="mt-0.5 text-[9px] text-[#979189]">{row.account_type} · {row.source_row_count} ledger rows</div></td>
              <td className="px-3 py-3 text-right tabular-nums">{Number(row.foreign_balance || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
              <td className="px-3 py-3 text-right tabular-nums">{money(row.historical_carrying_base, functionalCurrency)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{money(row.prior_adjustment, functionalCurrency)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{money(row.closing_value, functionalCurrency)}</td>
              <td className={`px-3 py-3 text-right font-semibold tabular-nums ${row.adjustment > 0 ? "text-[#2F6B4F]" : row.adjustment < 0 ? "text-[#8D4B43]" : ""}`}>{row.adjustment === null ? "Blocked" : money(row.adjustment, functionalCurrency)}</td>
              <td className="px-3 py-3">{row.blocked ? <span className="inline-flex items-center gap-1 text-[9px] text-red-800"><AlertTriangle size={11} /> Missing historical rate</span> : <span className="inline-flex items-center gap-1 text-[9px] text-emerald-800"><CheckCircle2 size={11} /> Complete</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FinanceFxRevaluationWorkCenter({ organizationId, entityId, periodId }) {
  const searchRef = useRef(null);
  const [workspace, setWorkspace] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [newMode, setNewMode] = useState(false);
  const [form, setForm] = useState({ revaluation_date: new Date().toISOString().slice(0, 10), currency_code: "", account_ids: [], unrealized_gain_account_id: "", unrealized_loss_account_id: "", notes: "" });
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!organizationId || !entityId) { setWorkspace(null); return; }
    let active = true;
    async function load() {
      try {
        setLoading(true); setError("");
        const url = new URL("/api/finance/fx-revaluation/runtime", window.location.origin);
        url.searchParams.set("organizationId", organizationId);
        url.searchParams.set("entityId", entityId);
        const body = await requestJson(url.toString());
        if (!active) return;
        setWorkspace(body);
        setSelectedRunId(current => current && body.runs?.some(run => run.id === current) ? current : body.runs?.[0]?.id || null);
        setForm(current => ({
          ...current,
          currency_code: current.currency_code || body.currencies?.[0] || "",
          account_ids: current.account_ids.length ? current.account_ids : (body.accounts || []).filter(account => account.currency_code && account.currency_code !== body.entity?.functional_currency).map(account => account.id),
        }));
      } catch (loadError) {
        if (active) { setWorkspace(null); setError(loadError?.message || "FX Revaluation could not be loaded"); }
      } finally { if (active) setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [entityId, organizationId, refreshKey]);

  const runs = Array.isArray(workspace?.runs) ? workspace.runs : [];
  const visibleRuns = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return runs.filter(run => {
      if (statusFilter && text(run.status).toUpperCase() !== statusFilter) return false;
      if (currencyFilter && run.currency_code !== currencyFilter) return false;
      return !needle || runSearchText(run).includes(needle);
    });
  }, [currencyFilter, query, runs, statusFilter]);
  const selectedRun = visibleRuns.find(run => run.id === selectedRunId) || visibleRuns[0] || null;

  const eligibleForCurrency = useMemo(() => {
    const accounts = Array.isArray(workspace?.accounts) ? workspace.accounts : [];
    if (!form.currency_code) return accounts;
    return accounts.filter(account => !account.currency_code || account.currency_code === form.currency_code);
  }, [form.currency_code, workspace?.accounts]);

  function toggleAccount(id) {
    setPreview(null);
    setForm(current => ({ ...current, account_ids: current.account_ids.includes(id) ? current.account_ids.filter(value => value !== id) : [...current.account_ids, id] }));
  }

  async function loadPreview() {
    if (!form.revaluation_date || !form.currency_code || !form.account_ids.length) {
      setError("Choose a revaluation date, currency and at least one monetary account before previewing.");
      return;
    }
    try {
      setPreviewLoading(true); setError("");
      const url = new URL("/api/finance/fx-revaluation/runtime", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("entityId", entityId);
      url.searchParams.set("preview", "1");
      url.searchParams.set("revaluationDate", form.revaluation_date);
      url.searchParams.set("currencyCode", form.currency_code);
      url.searchParams.set("accountIds", form.account_ids.join(","));
      const body = await requestJson(url.toString());
      setPreview(body.plan);
    } catch (previewError) { setPreview(null); setError(previewError?.message || "FX preview failed"); }
    finally { setPreviewLoading(false); }
  }

  async function saveDraft() {
    if (!preview) { setError("Preview the revaluation before saving the draft."); return; }
    if (!form.unrealized_gain_account_id || !form.unrealized_loss_account_id) { setError("Choose unrealised gain and loss accounts."); return; }
    try {
      setSaving(true); setError("");
      const body = await requestJson("/api/finance/fx-revaluation/runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId, entityId, periodId,
          revaluationDate: form.revaluation_date,
          currencyCode: form.currency_code,
          accountIds: form.account_ids,
          unrealizedGainAccountId: form.unrealized_gain_account_id,
          unrealizedLossAccountId: form.unrealized_loss_account_id,
          notes: form.notes,
        }),
      });
      setNewMode(false); setPreview(null); setSelectedRunId(body.run?.id || null); setRefreshKey(value => value + 1);
    } catch (saveError) { setError(saveError?.message || "FX draft could not be saved"); }
    finally { setSaving(false); }
  }

  async function postRun(run) {
    if (!run?.id) return;
    try {
      setPosting(true); setError("");
      await requestJson("/api/finance/fx-revaluation/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, entityId, runId: run.id }),
      });
      setRefreshKey(value => value + 1);
    } catch (postError) { setError(postError?.message || "FX Revaluation could not be posted"); }
    finally { setPosting(false); }
  }

  useEffect(() => {
    function onKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase();
      if (["input", "textarea", "select"].includes(tag)) return;
      if (event.key === "/") { event.preventDefault(); searchRef.current?.focus(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const postingAccounts = Array.isArray(workspace?.posting_accounts) ? workspace.posting_accounts : [];

  return (
    <main className="min-h-[calc(100vh-112px)] bg-[#F7F6F3] text-[#1B1A18]">
      <div className="mx-auto max-w-[1760px] px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
        <header className="flex flex-col gap-3 border-b border-black/[0.07] pb-4 xl:flex-row xl:items-end xl:justify-between">
          <div><div className="text-[9px] font-semibold uppercase tracking-[0.21em] text-[#9A7045]">Finance / Accounting</div><h1 className="mt-1.5 text-[28px] font-semibold tracking-[-0.035em]">FX Revaluation</h1><p className="mt-1 max-w-4xl text-[12px] leading-5 text-[#777169]">Preview foreign-currency carrying values at the governed closing rate, inspect account evidence, then post the unrealised adjustment.</p></div>
          <div className="flex items-center gap-2"><button onClick={() => setRefreshKey(value => value + 1)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/[0.09] bg-white px-3 text-[11px] font-medium"><RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh</button><button onClick={() => { setNewMode(true); setPreview(null); }} className="h-9 rounded-lg bg-[#1F1E1B] px-3.5 text-[11px] font-semibold text-white">New Revaluation</button></div>
        </header>

        {!organizationId || !entityId ? <div className="mt-4 rounded-xl border border-amber-700/15 bg-amber-50 p-4 text-[12px] text-amber-900">Select a legal entity before running FX Revaluation.</div> : <>
          <section className="mt-4 grid gap-2 rounded-xl border border-black/[0.07] bg-white p-3 lg:grid-cols-[minmax(260px,1fr)_150px_150px]">
            <div className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-[#FAF9F7] px-3"><Search size={14} className="text-[#9A958D]" /><input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search date, currency, rate source, journal…" className="h-9 min-w-0 flex-1 bg-transparent text-[12px] outline-none" /></div>
            <select value={currencyFilter} onChange={event => setCurrencyFilter(event.target.value)} className="h-9 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[10px]"><option value="">All currencies</option>{workspace?.currencies?.map(value => <option key={value}>{value}</option>)}</select>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-9 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[10px]"><option value="">All statuses</option>{["DRAFT","EXECUTING","COMPLETED","NO_ADJUSTMENT"].map(value => <option key={value}>{value}</option>)}</select>
          </section>
          {error ? <div className="mt-3 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[11px] text-red-800">{error}</div> : null}

          {newMode ? <section className="mt-3 overflow-hidden rounded-xl border border-black/[0.07] bg-white">
            <div className="grid gap-3 border-b border-black/[0.07] p-4 lg:grid-cols-4">
              <label className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#817B73]">Revaluation date<input type="date" value={form.revaluation_date} onChange={event => { setPreview(null); setForm(current => ({ ...current, revaluation_date: event.target.value })); }} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2.5 text-[11px] font-normal normal-case tracking-normal" /></label>
              <label className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#817B73]">Foreign currency<select value={form.currency_code} onChange={event => { setPreview(null); setForm(current => ({ ...current, currency_code: event.target.value, account_ids: [] })); }} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2.5 text-[11px] font-normal normal-case tracking-normal"><option value="">Select</option>{workspace?.currencies?.map(value => <option key={value}>{value}</option>)}</select></label>
              <label className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#817B73]">Unrealised gain account<select value={form.unrealized_gain_account_id} onChange={event => setForm(current => ({ ...current, unrealized_gain_account_id: event.target.value }))} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2.5 text-[11px] font-normal normal-case tracking-normal"><option value="">Select</option>{postingAccounts.map(account => <option key={account.id} value={account.id}>{account.account_code} · {account.account_name}</option>)}</select></label>
              <label className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#817B73]">Unrealised loss account<select value={form.unrealized_loss_account_id} onChange={event => setForm(current => ({ ...current, unrealized_loss_account_id: event.target.value }))} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2.5 text-[11px] font-normal normal-case tracking-normal"><option value="">Select</option>{postingAccounts.map(account => <option key={account.id} value={account.id}>{account.account_code} · {account.account_name}</option>)}</select></label>
            </div>
            <div className="grid gap-3 p-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div><div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#817B73]">Monetary accounts · {form.account_ids.length} selected</div><div className="max-h-[420px] overflow-y-auto rounded-lg border border-black/[0.07]">{eligibleForCurrency.map(account => <label key={account.id} className="flex cursor-pointer items-center gap-2 border-b border-black/[0.055] px-3 py-2.5 text-[10px] hover:bg-[#FAF9F7]"><input type="checkbox" checked={form.account_ids.includes(account.id)} onChange={() => toggleAccount(account.id)} /><span className="min-w-0"><span className="font-medium">{account.account_code} · {account.account_name}</span><span className="ml-2 text-[9px] text-[#98928A]">{account.account_type}{account.currency_code ? ` · ${account.currency_code}` : ""}</span></span></label>)}</div><textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Notes for the revaluation run…" className="mt-3 min-h-[74px] w-full rounded-lg border border-black/[0.09] bg-[#FAF9F7] p-2.5 text-[10px] outline-none" /></div>
              <div className="overflow-hidden rounded-lg border border-black/[0.07]">{preview ? <><div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-black/[0.07] bg-[#FAF9F7] px-3 py-2 text-[9px] text-[#777169]"><span>{preview.currency_code} → {preview.functional_currency}</span><span>Closing rate <strong className="text-[#36322E]">{preview.rate?.exchange_rate}</strong></span><span>Source <strong className="text-[#36322E]">{preview.rate?.configured_source || preview.rate?.resolver_source}</strong></span><span>Effective {date(preview.rate?.rate_effective_date)}</span><span>{preview.rate?.rate_type || "Configured rate"}</span></div><AccountEvidenceTable rows={preview.account_adjustments} functionalCurrency={preview.functional_currency} /><div className="flex flex-wrap items-center justify-end gap-5 border-t border-black/[0.07] bg-[#FAF9F7] px-3 py-2.5 text-[10px]"><span>Gain <strong>{money(preview.total_gain, preview.functional_currency)}</strong></span><span>Loss <strong>{money(preview.total_loss, preview.functional_currency)}</strong></span><span>Total adjustment <strong>{money(preview.total_adjustment, preview.functional_currency)}</strong></span>{preview.blocking_account_count ? <span className="text-red-800">{preview.blocking_account_count} blocked account(s)</span> : <span className="text-emerald-800">Evidence complete</span>}</div></> : <div className="p-8 text-center text-[11px] text-[#8A857D]">Select the foreign currency and monetary accounts, then preview before saving a draft.</div>}</div>
            </div>
            <div className="flex justify-end gap-2 border-t border-black/[0.07] p-3"><button onClick={() => { setNewMode(false); setPreview(null); }} className="h-9 rounded-lg border border-black/[0.09] bg-white px-3 text-[10px] font-medium">Cancel</button><button onClick={loadPreview} disabled={previewLoading} className="h-9 rounded-lg border border-black/[0.09] bg-white px-3 text-[10px] font-semibold">{previewLoading ? "Previewing…" : "Preview Revaluation"}</button><button onClick={saveDraft} disabled={saving || !preview || preview?.can_post === false} className="h-9 rounded-lg bg-[#1F1E1B] px-3.5 text-[10px] font-semibold text-white disabled:opacity-40">{saving ? "Saving…" : "Save Draft"}</button></div>
          </section> : null}

          <div className="mt-3 grid min-h-[620px] gap-3 xl:grid-cols-[minmax(0,1fr)_430px]">
            <section className="overflow-hidden rounded-xl border border-black/[0.07] bg-white"><table className="min-w-full border-collapse text-left text-[10px]"><thead className="border-b border-black/[0.07] bg-[#FAF9F7] text-[9px] font-semibold uppercase tracking-[0.09em] text-[#858078]"><tr><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Currency</th><th className="px-3 py-2.5">Rate</th><th className="px-3 py-2.5">Accounts</th><th className="px-3 py-2.5 text-right">Adjustment</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Journal</th></tr></thead><tbody>{visibleRuns.map(run => <tr key={run.id} onClick={() => setSelectedRunId(run.id)} className={`cursor-pointer border-b border-black/[0.055] ${selectedRun?.id === run.id ? "bg-[#F5EFE7]" : "hover:bg-[#FAF9F7]"}`}><td className="px-3 py-3 font-medium">{date(run.revaluation_date)}</td><td className="px-3 py-3">{run.currency_code}{run.functional_currency ? ` → ${run.functional_currency}` : ""}</td><td className="px-3 py-3"><div>{run.closing_exchange_rate || "Pending"}</div><div className="text-[9px] text-[#98928A]">{run.rate_source}</div></td><td className="px-3 py-3">{run.selected_account_count}</td><td className="px-3 py-3 text-right font-semibold">{run.functional_currency ? money(run.total_adjustment, run.functional_currency) : Number(run.total_adjustment || 0).toLocaleString()}</td><td className="px-3 py-3"><span className={`rounded-md border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${statusTone(run.status)}`}>{run.status}</span></td><td className="px-3 py-3 text-[9px] text-[#777169]">{run.journal_entry_id ? `${run.journal_entry_id.slice(0,8)}…${run.journal?.reversed ? " · Reversed" : ""}` : "—"}</td></tr>)}</tbody></table>{!visibleRuns.length ? <div className="p-8 text-center text-[11px] text-[#8A857D]">No FX revaluation runs yet.</div> : null}</section>
            <aside className="overflow-hidden rounded-xl border border-black/[0.07] bg-white">{selectedRun ? <><div className="p-4"><div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#9A7045]">Run evidence</div><div className="mt-1 flex items-start justify-between gap-3"><div><h2 className="text-[18px] font-semibold">{selectedRun.currency_code} · {date(selectedRun.revaluation_date)}</h2><div className="mt-1 text-[10px] text-[#817B73]">{selectedRun.selected_account_count} monetary accounts · {selectedRun.rate_source}</div></div><span className={`rounded-md border px-2 py-1 text-[9px] font-semibold uppercase ${statusTone(selectedRun.status)}`}>{selectedRun.status}</span></div><div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-black/[0.07] pt-3 text-[10px]"><div><div className="text-[#99938B]">Closing rate</div><div className="mt-0.5 font-medium">{selectedRun.closing_exchange_rate || "Pending"}</div></div><div><div className="text-[#99938B]">Adjustment</div><div className="mt-0.5 font-medium">{selectedRun.functional_currency ? money(selectedRun.total_adjustment, selectedRun.functional_currency) : "Pending"}</div></div><div><div className="text-[#99938B]">Functional currency</div><div className="mt-0.5 font-medium">{selectedRun.functional_currency || workspace?.entity?.functional_currency || "—"}</div></div><div><div className="text-[#99938B]">Journal</div><div className="mt-0.5 break-all font-medium">{selectedRun.journal_entry_id || "Not posted"}</div></div></div></div><div className="border-t border-black/[0.07] p-4"><div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-[#817B73]">Selected accounts</div><div className="space-y-1.5">{selectedRun.selected_accounts?.map(account => <div key={account.id} className="rounded-lg border border-black/[0.06] bg-[#FAF9F7] px-2.5 py-2 text-[10px]"><span className="font-medium">{account.account_code} · {account.account_name}</span><span className="ml-2 text-[9px] text-[#98928A]">{account.account_type}</span></div>)}</div></div>{selectedRun.notes ? <div className="border-t border-black/[0.07] p-4 text-[10px] text-[#777169]">{selectedRun.notes}</div> : null}<div className="border-t border-black/[0.07] p-3">{text(selectedRun.status).toUpperCase() === "DRAFT" ? <button onClick={() => postRun(selectedRun)} disabled={posting} className="h-9 w-full rounded-lg bg-[#1F1E1B] text-[10px] font-semibold text-white disabled:opacity-50">{posting ? "Posting…" : "Post Revaluation"}</button> : <div className="text-[9px] leading-4 text-[#8B857D]">Completed accounting terms are immutable. A reversal action is not exposed here until Avantiqo has an FX-specific governed reversal contract.</div>}</div></> : <div className="p-8 text-center text-[11px] text-[#8A857D]">Select a revaluation run to inspect its evidence.</div>}</aside>
          </div>
        </>}
      </div>
      <WorkspaceEventHub organizationId={organizationId} entityId={entityId} periodId={periodId} />
    </main>
  );
}
