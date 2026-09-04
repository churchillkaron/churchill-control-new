"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Landmark, RefreshCw, ShieldCheck } from "lucide-react";

const clean = value => String(value ?? "").trim();
const upper = value => clean(value).toUpperCase();

function money(value, currency = "THB") {
  const number = Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
}

function date(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`));
}

function stateTone(value) {
  const state = upper(value);
  if (["CLEARED", "NO_BALANCE"].includes(state)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (["SETTLEMENT_SETUP_REQUIRED", "LIABILITY_POSTING_REQUIRED", "PAYMENT_DUE", "REFUND_DUE"].includes(state)) return "border-amber-700/15 bg-amber-50 text-amber-900";
  if (["PART_PAID", "PART_REFUNDED", "PAID_AWAITING_BANK_MATCH", "REFUNDED_AWAITING_BANK_MATCH"].includes(state)) return "border-[#A37849]/18 bg-[#FFF9F0] text-[#76583A]";
  return "border-black/[0.08] bg-[#F7F6F3] text-[#716B63]";
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) throw new Error(body?.error || `Request failed (${response.status})`);
  return body;
}

export default function FinanceTaxSettlementRail({ organizationId, entityId, selectedVatReturnId }) {
  const [state, setState] = useState({ loading: false, error: "", body: null, returnId: null });
  const [busy, setBusy] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [postingDate, setPostingDate] = useState(new Date().toISOString().slice(0, 10));
  const [cashForm, setCashForm] = useState({ amount: "", date: new Date().toISOString().slice(0, 10), bank_account_id: "", reference: "" });
  const [accountForm, setAccountForm] = useState({ recoverable_tax_account_id: "", payable_tax_account_id: "", settlement_account_id: "" });

  async function load() {
    if (!organizationId || !entityId || !selectedVatReturnId) {
      setState({ loading: false, error: "", body: null, returnId: selectedVatReturnId || null });
      return;
    }
    try {
      setState(current => ({ ...current, loading: true, error: "" }));
      const taxUrl = new URL("/api/finance/tax/runtime", window.location.origin);
      taxUrl.searchParams.set("organizationId", organizationId);
      taxUrl.searchParams.set("entityId", entityId);
      taxUrl.searchParams.set("vatReturnId", selectedVatReturnId);
      const tax = await requestJson(taxUrl.toString());
      const row = tax.preflight?.return || null;
      if (!row || row.id !== selectedVatReturnId) throw new Error("Tax settlement could not resolve the selected VAT filing. Refresh Tax before continuing.");
      if (upper(row.status) !== "SUBMITTED") {
        setState({ loading: false, error: "", body: null, returnId: row.id });
        return;
      }
      const url = new URL("/api/finance/vat-returns/settlement", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("entityId", entityId);
      url.searchParams.set("vatReturnId", row.id);
      const body = await requestJson(url.toString());
      if (body.return?.id && body.return.id !== row.id) throw new Error("Settlement evidence resolved a different VAT filing. Refresh Tax before continuing.");
      setState({ loading: false, error: "", body, returnId: row.id });
      const config = body.configuration || {};
      setAccountForm({ recoverable_tax_account_id: config.recoverable_tax_account_id || "", payable_tax_account_id: config.payable_tax_account_id || "", settlement_account_id: config.settlement_account_id || "" });
      setSetupMode(!body.settlement?.configuration_ready);
      setCashForm(current => ({ ...current, amount: body.settlement?.amount_remaining ? String(body.settlement.amount_remaining) : current.amount, bank_account_id: current.bank_account_id || body.bank_accounts?.find(item => item.is_default)?.id || body.bank_accounts?.[0]?.id || "" }));
    } catch (error) {
      setState(current => ({ ...current, loading: false, body: null, error: error?.message || "Tax settlement could not be loaded" }));
    }
  }

  useEffect(() => { load(); }, [organizationId, entityId, selectedVatReturnId]);

  const settlement = state.body?.settlement || null;
  const accounts = state.body?.accounts || [];
  const bankAccounts = state.body?.bank_accounts || [];
  const currency = settlement?.currency_code || "THB";
  const unresolvedCash = settlement?.cash_events?.find(event => event.journal_valid && !event.bank_transaction_id) || null;
  const candidates = unresolvedCash ? state.body?.bank_match_candidates?.[unresolvedCash.id] || [] : [];
  const target = settlement?.target || null;
  const accountOptions = useMemo(() => accounts.map(account => ({ value: account.id, label: `${account.account_code} · ${account.account_name}` })), [accounts]);

  async function saveSetup() {
    try {
      setBusy(true); setState(current => ({ ...current, error: "" }));
      await requestJson("/api/finance/vat-returns/settlement", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, entityId, ...accountForm }) });
      setSetupMode(false); await load();
    } catch (error) { setState(current => ({ ...current, error: error?.message || "Settlement setup could not be saved" })); } finally { setBusy(false); }
  }

  async function action(action, extras = {}) {
    if (!state.returnId || state.returnId !== selectedVatReturnId) return;
    try {
      setBusy(true); setState(current => ({ ...current, error: "" }));
      await requestJson("/api/finance/vat-returns/settlement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, entityId, vatReturnId: state.returnId, action, ...extras }) });
      await load(); window.dispatchEvent(new CustomEvent("workspace:refresh"));
    } catch (error) { setState(current => ({ ...current, error: error?.message || "Settlement action failed" })); } finally { setBusy(false); }
  }

  if (!organizationId || !entityId || !selectedVatReturnId || (!state.loading && !state.body && !state.error)) return null;

  return <section className="mx-auto mt-3 max-w-[1760px] px-4 sm:px-5 lg:px-6"><div className="overflow-hidden rounded-xl border border-black/[0.07] bg-white text-[#2A2723]"><div className="flex flex-col gap-3 border-b border-black/[0.07] p-3.5 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9A7045]"><Landmark size={12} /> Tax settlement</span>{settlement ? <span className={`rounded-md border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.07em] ${stateTone(settlement.state)}`}>{String(settlement.state).replaceAll("_", " ")}</span> : null}</div><div className="mt-1 text-[12px] font-semibold">Filing is not finished until the tax control balance is cleared.</div><div className="mt-1 text-[9px] leading-4 text-[#817B73]">Paid is not cleared. Avantiqo keeps the authority liability, payment/refund journal and bank reconciliation evidence separate so accountants can see the exact remaining control.</div></div><button onClick={load} className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg border border-black/[0.09] bg-white px-2.5 text-[9px] font-semibold"><RefreshCw size={10} className={state.loading ? "animate-spin" : ""} /> Refresh</button></div>{state.error ? <div className="m-3 rounded-lg border border-red-700/15 bg-red-50 p-2.5 text-[9px] text-red-800">{state.error}</div> : null}{settlement ? <><div className="grid gap-px border-b border-black/[0.07] bg-black/[0.05] sm:grid-cols-2 lg:grid-cols-5"><div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Filed version</div><div className="mt-1 text-[11px] font-semibold">{target?.label || "Original"}</div></div><div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Authority balance</div><div className="mt-1 text-[11px] font-semibold tabular-nums">{money(Math.abs(settlement.target_signed_balance), currency)} {settlement.target_signed_balance < 0 ? "refund" : "payable"}</div></div><div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Cash settled</div><div className="mt-1 text-[11px] font-semibold tabular-nums">{money(Math.abs(settlement.cash_settled_signed), currency)}</div></div><div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Remaining</div><div className="mt-1 text-[11px] font-semibold tabular-nums">{money(settlement.amount_remaining, currency)}</div></div><div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Bank evidence</div><div className="mt-1 text-[11px] font-semibold">{settlement.bank_evidence_complete ? "Reconciled" : settlement.cash_events?.length ? "Match pending" : "Not applicable yet"}</div></div></div>{settlement.needs_attention ? <div className="m-3 flex items-start gap-2 rounded-lg border border-red-700/15 bg-red-50 p-2.5 text-[9px] text-red-800"><AlertTriangle size={12} className="mt-0.5" /><div><b>Settlement evidence changed.</b> A linked liability/payment journal has been reversed. Avantiqo has stopped counting that journal toward the tax balance.</div></div> : null}{setupMode ? <div className="p-3.5"><div className="text-[10px] font-semibold">Settlement setup required</div><div className="mt-1 text-[9px] text-[#817B73]">Map the actual entity accounts once. Avantiqo does not guess VAT control accounts by account name.</div><div className="mt-3 grid gap-2 lg:grid-cols-3">{[["recoverable_tax_account_id", "Recoverable input VAT"],["payable_tax_account_id", "Output VAT payable"],["settlement_account_id", "Tax settlement control"]].map(([key,label]) => <label key={key} className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#817B73]">{label}<select value={accountForm[key]} onChange={event => setAccountForm(current => ({ ...current, [key]: event.target.value }))} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2 text-[9px] font-normal normal-case tracking-normal"><option value="">Select account</option>{accountOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>)}</div><div className="mt-3 flex justify-end"><button onClick={saveSetup} disabled={busy} className="h-9 rounded-lg bg-[#1F1E1B] px-3.5 text-[9px] font-semibold text-white disabled:opacity-40">Save governed VAT accounts</button></div></div> : null}{!setupMode && settlement.state === "LIABILITY_POSTING_REQUIRED" ? <div className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-[10px] font-semibold">Post filed VAT into settlement control</div><div className="mt-1 text-[9px] text-[#817B73]">Output VAT and recoverable input VAT are closed into the configured tax settlement account. Amendments post only their incremental delta.</div></div><div className="flex gap-2"><input type="date" value={postingDate} onChange={event => setPostingDate(event.target.value)} className="h-9 rounded-lg border border-black/[0.09] bg-white px-2 text-[9px]" /><button onClick={() => action("post_liability", { postingDate })} disabled={busy} className="h-9 rounded-lg bg-[#1F1E1B] px-3.5 text-[9px] font-semibold text-white disabled:opacity-40">Post tax liability</button></div></div> : null}{!setupMode && ["PAYMENT_DUE", "PART_PAID", "REFUND_DUE", "PART_REFUNDED"].includes(settlement.state) ? <div className="border-t border-black/[0.07] p-3.5"><div className="text-[10px] font-semibold">Record {settlement.expected_direction === "REFUND" ? "refund received" : "authority payment"}</div><div className="mt-1 text-[9px] text-[#817B73]">Partial settlement is allowed. The journal posts immediately; the return stays uncleared until the bank feed evidence is matched and reconciled.</div><div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4"><input type="date" value={cashForm.date} onChange={event => setCashForm(current => ({ ...current, date: event.target.value }))} className="h-9 rounded-lg border border-black/[0.09] px-2 text-[9px]" /><input type="number" min="0.01" step="0.01" value={cashForm.amount} onChange={event => setCashForm(current => ({ ...current, amount: event.target.value }))} className="h-9 rounded-lg border border-black/[0.09] px-2 text-[9px]" placeholder="Amount" /><select value={cashForm.bank_account_id} onChange={event => setCashForm(current => ({ ...current, bank_account_id: event.target.value }))} className="h-9 rounded-lg border border-black/[0.09] px-2 text-[9px]"><option value="">Select bank account</option>{bankAccounts.map(item => <option key={item.id} value={item.id}>{item.bank_name} · {item.account_name}</option>)}</select><input value={cashForm.reference} onChange={event => setCashForm(current => ({ ...current, reference: event.target.value }))} className="h-9 rounded-lg border border-black/[0.09] px-2 text-[9px]" placeholder="Authority/payment reference" /></div><div className="mt-3 flex justify-end"><button disabled={busy || !cashForm.bank_account_id || !cashForm.reference || !Number(cashForm.amount)} onClick={() => action("record_cash", { direction: settlement.expected_direction, amount: Number(cashForm.amount), paymentDate: cashForm.date, bankAccountId: cashForm.bank_account_id, reference: cashForm.reference })} className="h-9 rounded-lg bg-[#1F1E1B] px-3.5 text-[9px] font-semibold text-white disabled:opacity-40">Record {settlement.expected_direction === "REFUND" ? "refund" : "payment"}</button></div></div> : null}{unresolvedCash ? <div className="border-t border-black/[0.07] p-3.5"><div className="flex items-center gap-1.5 text-[10px] font-semibold"><ShieldCheck size={12} /> Match bank evidence</div><div className="mt-1 text-[9px] text-[#817B73]">Journal {unresolvedCash.journal_number || unresolvedCash.journal_entry_id} · {date(unresolvedCash.payment_date)} · {money(unresolvedCash.amount, currency)}. Matching links the cash evidence; the existing Bank Reconciliation workspace still owns the reconciled flag.</div>{candidates.length ? <div className="mt-2 space-y-1.5">{candidates.map(candidate => <div key={candidate.id} className="flex flex-col gap-2 rounded-lg border border-black/[0.07] bg-[#FAF9F7] p-2.5 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="text-[9px] font-semibold">{date(candidate.transaction_date)} · {money(Math.abs(candidate.amount), currency)} · {candidate.reference || candidate.description || "Bank transaction"}</div><div className="mt-0.5 text-[8px] text-[#918B83]">{candidate.reconciled ? "Already reconciled in Banking" : "Bank reconciliation still pending"}</div></div><button onClick={() => action("link_bank_transaction", { cashEventId: unresolvedCash.id, bankTransactionId: candidate.id })} disabled={busy} className="h-8 rounded-lg border border-black/[0.09] bg-white px-2.5 text-[8px] font-semibold">Link transaction</button></div>)}</div> : <div className="mt-2 rounded-lg border border-amber-700/12 bg-amber-50 p-2.5 text-[9px] text-amber-900">No exact bank-feed candidate found within ±14 days. Import/reconcile the bank statement in Banking, then refresh Tax.</div>}</div> : null}{["CLEARED", "NO_BALANCE"].includes(settlement.state) ? <div className="m-3 flex items-start gap-2 rounded-lg border border-emerald-700/15 bg-emerald-50 p-2.5 text-[9px] text-emerald-800"><CheckCircle2 size={12} className="mt-0.5" /><div><b>{settlement.state === "CLEARED" ? "Tax balance cleared." : "Filed return has no payable/refund balance."}</b> {settlement.state === "CLEARED" ? "The effective filed version, tax settlement journal, cash journal and bank reconciliation evidence agree." : "The filing is recognized in the tax settlement control with no cash settlement required."}</div></div> : null}{(settlement.liability_events?.length || settlement.cash_events?.length) ? <div className="border-t border-black/[0.07] p-3.5"><div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#817B73]">Settlement evidence history</div><div className="mt-2 grid gap-1.5">{settlement.liability_events?.map(event => <div key={event.id} className="rounded-lg border border-black/[0.06] bg-[#FAF9F7] px-2.5 py-2 text-[8px]"><b>{event.source_version_label}</b> liability · {event.zero_value ? "No-value control event" : event.journal_number || event.journal_entry_id} · {event.journal_valid ? "Posted" : "Reversed / invalid"}</div>)}{settlement.cash_events?.map(event => <div key={event.id} className="rounded-lg border border-black/[0.06] bg-[#FAF9F7] px-2.5 py-2 text-[8px]"><b>{event.direction}</b> · {money(event.amount, currency)} · {event.reference} · {event.journal_valid ? "journal posted" : "journal reversed"} · {event.bank_transaction_id ? event.bank_reconciled ? "bank reconciled" : "bank linked, reconciliation pending" : "bank match pending"}</div>)}</div></div> : null}</> : state.loading ? <div className="p-4 text-[9px] text-[#817B73]">Loading tax settlement evidence…</div> : null}</div></section>;
}
