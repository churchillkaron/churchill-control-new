"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, CheckCircle2, FileCheck2, LoaderCircle, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { useFinanceLandingRuntime } from "@/components/workspace/finance/FinanceLandingRuntimeProvider";

function clean(value) { return String(value ?? "").trim(); }
function label(value) { return clean(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function money(value, currency) {
  const n = Number(value || 0);
  try { return new Intl.NumberFormat(undefined, currency ? { style: "currency", currency, maximumFractionDigits: 2 } : { maximumFractionDigits: 2 }).format(n); }
  catch { return `${currency || ""} ${n.toFixed(2)}`.trim(); }
}
function tone(status) {
  const state = clean(status).toUpperCase();
  if (["BLOCKED", "REJECTED"].includes(state)) return "border-red-700/15 bg-red-50 text-red-800";
  if (["ACTION_REQUIRED", "DRAFT", "PENDING", "APPROVED"].includes(state)) return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (["POSTED", "ON_TRACK", "RESOLVED"].includes(state)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  return "border-black/[0.08] bg-[#F7F6F3] text-[#716B63]";
}

export default function FinanceCorrectionWorkspace({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const landing = useFinanceLandingRuntime();
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const currency = landing.currency || businessContext.entity?.currency || businessContext.organization?.default_currency || null;
  const [state, setState] = useState({ loading: true, error: "", corrections: [], accounts: [], documents: [] });
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ resolutionMode: "CONTROL", summary: "", rationale: "", evidenceBasis: "", postingDate: "", description: "", lines: [] });

  async function load() {
    if (!organizationId || !entityId || !periodId) return;
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const correctionsUrl = new URL("/api/workspace/finance/corrections", window.location.origin);
      correctionsUrl.searchParams.set("organizationId", organizationId); correctionsUrl.searchParams.set("clientOrganizationId", organizationId); correctionsUrl.searchParams.set("entityId", entityId); correctionsUrl.searchParams.set("periodId", periodId);
      const response = await fetch(correctionsUrl.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load corrections");
      const corrections = body.corrections || [];
      setState({ loading: false, error: "", corrections, accounts: body.accounts || [], documents: body.documents || [] });
      setSelectedId((current) => corrections.some((row) => row.id === current) ? current : corrections[0]?.id || null);
    } catch (error) { setState((current) => ({ ...current, loading: false, error: error?.message || "Unable to load correction workflow" })); }
  }
  useEffect(() => { load(); }, [organizationId, entityId, periodId]);

  const health = landing.accountHealth;
  const exceptions = useMemo(() => (health?.health?.accounts || []).filter((row) => ["BLOCKED", "ACTION_REQUIRED"].includes(row.state)), [health]);
  const selected = state.corrections.find((row) => row.id === selectedId) || null;
  const activeCorrectionAccountIds = useMemo(() => new Set(state.corrections.filter((row) => ["DRAFT", "REJECTED", "PENDING", "APPROVED"].includes(clean(row.status).toUpperCase())).map((row) => clean(row.metadata?.exception?.account_id)).filter(Boolean)), [state.corrections]);

  useEffect(() => {
    if (!selected) return;
    const meta = selected.metadata || {}; const draft = meta.journal_draft || {};
    setForm({ resolutionMode: meta.resolution_mode || "CONTROL", summary: meta.treatment?.summary || "", rationale: meta.treatment?.rationale || "", evidenceBasis: meta.treatment?.evidence_basis || "", postingDate: draft.posting_date || health?.context?.as_of || "", description: draft.description || "", lines: Array.isArray(draft.lines) ? draft.lines : [] });
  }, [selectedId, health?.context?.as_of]);

  async function refreshAll() {
    await Promise.all([load(), landing.refresh()]);
  }

  async function act(action, payload = {}) {
    if (busy) return null;
    try {
      setBusy(action); setState((current) => ({ ...current, error: "" }));
      const response = await fetch("/api/workspace/finance/corrections", { method: "POST", cache: "no-store", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, action, ...payload }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Correction action failed");
      const correction = body.result?.correction || body.result;
      await refreshAll(); if (correction?.id) setSelectedId(correction.id); return body.result;
    } catch (error) { setState((current) => ({ ...current, error: error?.message || "Correction action failed" })); await refreshAll().catch(() => null); return null; }
    finally { setBusy(""); }
  }

  async function create(exception) { await act("create", { clientOrganizationId: organizationId, entityId, periodId, accountId: exception.account_id, currencyCode: currency }); }
  function updateLine(index, key, value) { setForm((current) => ({ ...current, lines: current.lines.map((line, i) => i === index ? { ...line, [key]: value } : line) })); }
  function addLine() { setForm((current) => ({ ...current, lines: [...current.lines, { account_id: "", debit: 0, credit: 0, description: "" }] })); }
  function save(submit = false) {
    return act(submit ? "submit" : "save", { correctionId: selected.id, resolutionMode: form.resolutionMode, treatment: { summary: form.summary, rationale: form.rationale, evidence_basis: form.evidenceBasis }, journalDraft: { ...(selected.metadata?.journal_draft || {}), posting_date: form.postingDate, document_date: form.postingDate, description: form.description, currency_code: selected.currency_code || currency, exchange_rate: 1, lines: form.lines } });
  }

  if (!organizationId || !entityId || !periodId) return null;
  if ((state.loading || landing.loading) && !health) return <div className="mx-auto mb-4 flex min-h-[74px] max-w-[1720px] items-center justify-center rounded-[20px] border border-black/[0.07] bg-white text-[8px] text-[#817A72]"><LoaderCircle size={11} className="mr-2 animate-spin text-[#A37849]" /> Preparing correction control loop…</div>;
  if (!exceptions.length && !state.corrections.length) return null;

  return (
    <section aria-label="Accounting correction workflow" className="mx-auto mb-4 max-w-[1720px] overflow-hidden rounded-[22px] border border-[#A37849]/15 bg-[#FBF8F3] text-[#2A2723]">
      <div className="flex flex-col gap-3 border-b border-black/[0.06] px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between md:px-5">
        <div><div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]"><ShieldCheck size={11} /> Correction control</div><h2 className="mt-1 text-[14px] font-semibold">Exception → evidence → approval → post → re-check</h2><p className="mt-0.5 text-[8px] leading-4 text-[#918B83]">Avantiqo proposes the treatment path, never the balancing amount. The original exception is revalidated before submit, approval and posting.</p></div>
        <button onClick={refreshAll} disabled={state.loading || landing.refreshing} className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg border border-black/[0.08] bg-white px-2.5 text-[8px] font-semibold text-[#76583A]"><RefreshCw size={10} className={state.loading || landing.refreshing ? "animate-spin" : ""} /> Refresh</button>
      </div>
      {state.error ? <div className="mx-4 mt-3 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[8px] text-red-800 md:mx-5">{state.error}</div> : null}
      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(300px,.65fr)_minmax(640px,1.35fr)] md:p-5">
        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white"><div className="border-b border-black/[0.06] bg-[#FAF9F7] px-3 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8A867F]">Open structural exceptions · {exceptions.length}</div>{exceptions.slice(0,8).map((row) => { const hasOpenCase = activeCorrectionAccountIds.has(clean(row.account_id)); return <div key={row.account_id} className="border-b border-black/[0.05] p-3 last:border-0"><div className="flex items-start justify-between gap-2"><div><div className="text-[9px] font-semibold">{row.account_code ? `${row.account_code} · ` : ""}{row.account_name}</div><div className="mt-1 text-[7px] leading-3.5 text-[#8C857D]">{row.reason}</div></div><span className={`rounded-full border px-2 py-1 text-[6px] font-semibold uppercase ${tone(row.state)}`}>{label(row.state)}</span></div><button onClick={() => create(row)} disabled={Boolean(busy) || hasOpenCase} className="mt-2 h-7 rounded-lg border border-[#A37849]/20 bg-[#FFF9F0] px-2.5 text-[7px] font-semibold text-[#76583A] disabled:opacity-40">{hasOpenCase ? "Correction already open" : "Open correction case"}</button></div>; })}</div>
          {state.corrections.length ? <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white"><div className="border-b border-black/[0.06] px-3 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8A867F]">Correction cases</div>{state.corrections.slice(0,12).map((row) => <button key={row.id} onClick={() => setSelectedId(row.id)} className={`w-full border-b border-black/[0.05] px-3 py-2.5 text-left last:border-0 ${selectedId === row.id ? "bg-[#FFF8EE]" : ""}`}><div className="flex items-center justify-between gap-2"><div className="truncate text-[8px] font-semibold">{row.metadata?.exception?.account_code || "Account"} · {row.metadata?.exception?.account_name || "Correction"}</div><span className={`rounded-full border px-2 py-1 text-[6px] font-semibold uppercase ${tone(row.status)}`}>{row.status}</span></div><div className="mt-1 truncate text-[7px] text-[#958F87]">{row.metadata?.treatment?.summary}</div></button>)}</div> : null}
        </div>

        <div className="rounded-2xl border border-black/[0.07] bg-white p-4">
          {!selected ? <div className="flex min-h-[260px] items-center justify-center text-center text-[9px] text-[#8B857D]">Choose an exception to open a governed correction case.</div> : <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/[0.06] pb-3"><div><div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8A633C]">Correction case</div><div className="mt-1 text-[14px] font-semibold">{selected.metadata?.exception?.account_code} · {selected.metadata?.exception?.account_name}</div><div className="mt-1 text-[8px] text-[#8F8981]">Observed {money(selected.metadata?.exception?.closing_amount, selected.currency_code || currency)} · {selected.metadata?.exception?.reason}</div></div><span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase ${tone(selected.status)}`}>{selected.status}</span></div>
            {selected.metadata?.recheck ? <div className={`mt-3 rounded-xl border p-3 text-[8px] ${selected.metadata.recheck.resolved ? "border-emerald-700/15 bg-emerald-50 text-emerald-800" : "border-amber-700/15 bg-amber-50 text-amber-800"}`}><div className="font-semibold">Exception re-check: {selected.metadata.recheck.resolved ? "original structural exception cleared" : label(selected.metadata.recheck.resulting_state)}</div><div className="mt-1">{selected.metadata.recheck.reason}</div></div> : null}
            <div className="mt-3 grid gap-3 lg:grid-cols-2"><label className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#8A867F]">Resolution mode<select disabled={!['DRAFT','REJECTED'].includes(selected.status)} value={form.resolutionMode} onChange={(e) => setForm((c) => ({ ...c, resolutionMode: e.target.value }))} className="mt-1 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2 text-[9px] normal-case"><option value="CONTROL">Control / configuration</option><option value="JOURNAL">Journal correction</option></select></label><div className="rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3"><div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase text-[#8A867F]"><FileCheck2 size={9}/> Evidence discipline</div><div className="mt-1 text-[8px] leading-4 text-[#777169]">{state.documents.length} recent source documents are available in the client file. Record which evidence proves the treatment before submission.</div></div></div>
            <div className="mt-3 grid gap-2"><textarea disabled={!['DRAFT','REJECTED'].includes(selected.status)} value={form.summary} onChange={(e) => setForm((c) => ({ ...c, summary: e.target.value }))} className="min-h-16 rounded-lg border border-black/[0.08] p-2 text-[8px]" placeholder="Accounting treatment"/><textarea disabled={!['DRAFT','REJECTED'].includes(selected.status)} value={form.rationale} onChange={(e) => setForm((c) => ({ ...c, rationale: e.target.value }))} className="min-h-14 rounded-lg border border-black/[0.08] p-2 text-[8px]" placeholder="Why this treatment is correct"/><textarea disabled={!['DRAFT','REJECTED'].includes(selected.status)} value={form.evidenceBasis} onChange={(e) => setForm((c) => ({ ...c, evidenceBasis: e.target.value }))} className="min-h-14 rounded-lg border border-black/[0.08] p-2 text-[8px]" placeholder="Evidence basis / source documents"/></div>
            {form.resolutionMode === 'JOURNAL' ? <div className="mt-4 rounded-xl border border-black/[0.07] bg-[#FCFBF9] p-3"><div className="flex items-center justify-between"><div className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8A633C]">Draft correcting journal</div>{['DRAFT','REJECTED'].includes(selected.status) ? <button onClick={addLine} className="text-[7px] font-semibold text-[#76583A]">+ Line</button> : null}</div><div className="mt-2 grid gap-2 sm:grid-cols-2"><input type="date" disabled={!['DRAFT','REJECTED'].includes(selected.status)} value={form.postingDate} onChange={(e) => setForm((c) => ({ ...c, postingDate: e.target.value }))} className="h-9 rounded-lg border border-black/[0.08] px-2 text-[8px]"/><input disabled={!['DRAFT','REJECTED'].includes(selected.status)} value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} className="h-9 rounded-lg border border-black/[0.08] px-2 text-[8px]" placeholder="Journal description"/></div><div className="mt-2 space-y-2">{form.lines.map((line,index) => <div key={index} className="grid gap-2 md:grid-cols-[1.4fr_.55fr_.55fr_1fr]"><select disabled={!['DRAFT','REJECTED'].includes(selected.status)} value={line.account_id || ''} onChange={(e) => updateLine(index,'account_id',e.target.value)} className="h-9 rounded-lg border border-black/[0.08] bg-white px-2 text-[8px]"><option value="">Select account</option>{state.accounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} · {a.account_name}</option>)}</select><input disabled={!['DRAFT','REJECTED'].includes(selected.status)} type="number" min="0" step="0.01" value={line.debit || ''} onChange={(e) => updateLine(index,'debit',e.target.value)} className="h-9 rounded-lg border border-black/[0.08] px-2 text-[8px]" placeholder="Debit"/><input disabled={!['DRAFT','REJECTED'].includes(selected.status)} type="number" min="0" step="0.01" value={line.credit || ''} onChange={(e) => updateLine(index,'credit',e.target.value)} className="h-9 rounded-lg border border-black/[0.08] px-2 text-[8px]" placeholder="Credit"/><input disabled={!['DRAFT','REJECTED'].includes(selected.status)} value={line.description || ''} onChange={(e) => updateLine(index,'description',e.target.value)} className="h-9 rounded-lg border border-black/[0.08] px-2 text-[8px]" placeholder="Line evidence"/></div>)}</div></div> : null}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-black/[0.06] pt-3">{['DRAFT','REJECTED'].includes(selected.status) ? <><button onClick={() => save(false)} disabled={Boolean(busy)} className="h-8 rounded-lg border border-black/[0.08] px-3 text-[7px] font-semibold">Save draft</button><button onClick={() => save(true)} disabled={Boolean(busy)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#3F352A] px-3 text-[7px] font-semibold text-white"><Send size={9}/> Submit for independent approval</button></> : null}{selected.status === 'PENDING' ? <><button onClick={() => act('reject',{ correctionId:selected.id,note:'Accounting correction requires changes' })} disabled={Boolean(busy)} className="h-8 rounded-lg border border-red-700/15 bg-red-50 px-3 text-[7px] font-semibold text-red-800">Reject</button><button onClick={() => act('approve',{ correctionId:selected.id })} disabled={Boolean(busy)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#3F352A] px-3 text-[7px] font-semibold text-white"><BadgeCheck size={9}/> Approve</button></> : null}{selected.status === 'APPROVED' && selected.metadata?.resolution_mode === 'JOURNAL' ? <button onClick={() => act('post',{ correctionId:selected.id })} disabled={Boolean(busy)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#3F352A] px-3 text-[7px] font-semibold text-white"><CheckCircle2 size={9}/> Post & re-check</button> : null}{selected.metadata?.resolution_mode === 'CONTROL' && ['APPROVED','POSTED'].includes(selected.status) ? <button onClick={() => act('recheck',{ correctionId:selected.id })} disabled={Boolean(busy)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#A37849]/20 bg-[#FFF9F0] px-3 text-[7px] font-semibold text-[#76583A]"><RefreshCw size={9}/> Re-check original exception</button> : null}</div>
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-3 text-[7px] leading-4 text-[#817B73]"><AlertTriangle size={9} className="mt-0.5 shrink-0 text-[#9A744B]"/> Approval and posting are re-authorized server-side. The preparer cannot approve their own case, and the source exception must still exist at every control boundary.</div>
          </>}
        </div>
      </div>
    </section>
  );
}
