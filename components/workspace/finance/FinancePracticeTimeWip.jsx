"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, LoaderCircle, RefreshCw, Save, WalletCards } from "lucide-react";

function number(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function money(value, currency = "THB") { try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(number(value)); } catch { return `${currency} ${number(value).toFixed(2)}`; } }
function shortDate(value) { return value ? String(value).slice(0, 10) : "—"; }
function tone(status) {
  if (status === "APPROVED" || status === "BILLED") return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (status === "SUBMITTED") return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (status === "VOID") return "border-black/[0.08] bg-[#F4F2EF] text-[#8C877F]";
  return "border-black/[0.08] bg-white text-[#716B63]";
}

function Metric({ label, value, detail, attention = false }) {
  return <div className="rounded-xl border border-black/[0.07] bg-white px-3.5 py-3"><div className="text-[8px] font-medium uppercase tracking-[0.13em] text-[#8C877F]">{label}</div><div className={`mt-1.5 text-[19px] font-semibold tracking-[-0.03em] ${attention ? "text-[#9A533D]" : "text-[#2A2723]"}`}>{value}</div><div className="mt-0.5 text-[8px] text-[#99938A]">{detail}</div></div>;
}

export default function FinancePracticeTimeWip({ organizationId }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ workItemId: "", minutes: 30, billable: true, description: "" });
  const [billingForm, setBillingForm] = useState({ engagementId: "", billingMethod: "TIME_AND_MATERIALS", currencyCode: "THB", defaultHourlyRate: "", fixedFeeAmount: "", billingEntityId: "", customerPartyId: "", revenueAccountId: "", taxRuleId: "", taxTreatmentConfirmed: false, paymentTermsDays: 0, billingCadence: "ON_DEMAND", nextBillingDate: "", applyRateToUnpriced: false });

  async function load() {
    if (!organizationId) return;
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/workspace/finance/practice-time", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load time and WIP");
      setState({ loading: false, error: "", data: body });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Unable to load time and WIP", data: null });
    }
  }

  useEffect(() => { load(); }, [organizationId]);

  const selectedWorkItem = useMemo(() => (state.data?.work_items || []).find((row) => row.id === form.workItemId) || null, [state.data, form.workItemId]);
  const selectedEngagement = useMemo(() => (state.data?.engagement_context || []).find((row) => row.id === billingForm.engagementId) || null, [state.data, billingForm.engagementId]);
  const selectedBillingEntity = useMemo(() => (state.data?.billing_options?.entities || []).find((row) => row.id === billingForm.billingEntityId) || null, [state.data, billingForm.billingEntityId]);
  const applicableTaxRules = useMemo(() => {
    const country = String(selectedBillingEntity?.country || "").trim().toUpperCase();
    if (!country) return [];
    return (state.data?.billing_options?.tax_rules || []).filter((rule) => (rule.applicable_countries || []).includes(country));
  }, [state.data, selectedBillingEntity?.id, selectedBillingEntity?.country]);

  useEffect(() => {
    const profile = selectedEngagement?.billing_profile;
    if (!selectedEngagement) return;
    setBillingForm((current) => ({
      ...current,
      billingMethod: profile?.billing_method || "TIME_AND_MATERIALS",
      currencyCode: profile?.currency_code || "THB",
      defaultHourlyRate: profile?.default_hourly_rate ?? "",
      fixedFeeAmount: profile?.fixed_fee_amount ?? "",
      billingEntityId: profile?.billing_entity_id || "",
      customerPartyId: profile?.customer_party_id || "",
      revenueAccountId: profile?.revenue_account_id || "",
      taxRuleId: profile?.tax_rule_id || "",
      taxTreatmentConfirmed: profile?.tax_treatment_confirmed === true,
      paymentTermsDays: profile?.payment_terms_days ?? 0,
      billingCadence: profile?.billing_cadence || "ON_DEMAND",
      nextBillingDate: profile?.next_billing_date || "",
      applyRateToUnpriced: false,
    }));
  }, [selectedEngagement?.id]);

  async function recordTime(event) {
    event.preventDefault();
    if (!form.workItemId || number(form.minutes) <= 0) return;
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/workspace/finance/practice-time", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ organizationId, workItemId: form.workItemId, minutes: number(form.minutes), billable: form.billable, description: form.description }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to record time");
      setForm((current) => ({ ...current, minutes: 30, description: "" }));
      setNotice("Time recorded. WIP has been recalculated from governed entries.");
      await load();
    } catch (error) { setNotice(error?.message || "Unable to record time"); }
    finally { setSaving(false); }
  }


  async function saveBillingPolicy(event) {
    event.preventDefault();
    if (!billingForm.engagementId) return;
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/workspace/finance/practice-time", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          organizationId, action: "upsert_billing_profile", engagementId: billingForm.engagementId,
          billingMethod: billingForm.billingMethod, currencyCode: billingForm.currencyCode,
          defaultHourlyRate: billingForm.defaultHourlyRate === "" ? null : number(billingForm.defaultHourlyRate),
          fixedFeeAmount: billingForm.fixedFeeAmount === "" ? null : number(billingForm.fixedFeeAmount),
          billingEntityId: billingForm.billingEntityId || null, customerPartyId: billingForm.customerPartyId || null,
          revenueAccountId: billingForm.revenueAccountId || null, taxRuleId: billingForm.taxRuleId || null,
          taxTreatmentConfirmed: billingForm.taxTreatmentConfirmed,
          paymentTermsDays: number(billingForm.paymentTermsDays), billingCadence: billingForm.billingCadence, nextBillingDate: billingForm.nextBillingDate || null, applyRateToUnpriced: billingForm.applyRateToUnpriced,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to save billing policy");
      setNotice(`Billing policy saved.${body?.repriced_entries ? ` ${body.repriced_entries} unpriced WIP entr${body.repriced_entries === 1 ? "y" : "ies"} updated by your explicit choice.` : " Future time entries will snapshot the governed rate."}`);
      await load();
    } catch (error) { setNotice(error?.message || "Unable to save billing policy"); }
    finally { setSaving(false); }
  }

  async function createInvoice(engagementId) {
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/workspace/finance/practice-billing", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ organizationId, engagementId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to create customer invoice");
      setNotice(`Customer invoice created through Finance AR: ${body.invoice_id}.`);
      await load();
    } catch (error) { setNotice(error?.message || "Unable to create customer invoice"); }
    finally { setSaving(false); }
  }

  async function approve(entryId) {
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/workspace/finance/practice-time", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ organizationId, entryId, action: "approve" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to approve time");
      setNotice("Time approved for WIP.");
      await load();
    } catch (error) { setNotice(error?.message || "Unable to approve time"); }
    finally { setSaving(false); }
  }

  const data = state.data;
  const totals = data?.totals || {};
  const currency = data?.entries?.find((row) => row.currency_code)?.currency_code || data?.billing_profiles?.find((row) => row.currency_code)?.currency_code || "THB";

  if (state.loading && !data) return <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-black/[0.07] bg-white text-[10px] text-[#817D76]"><LoaderCircle size={14} className="mr-2 animate-spin text-[#A37849]" />Loading actual time and WIP…</div>;
  if (state.error && !data) return <div className="rounded-xl border border-red-700/15 bg-red-50 p-3 text-[10px] text-red-800">{state.error}</div>;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-[10px] font-semibold text-[#403C37]">Time & WIP</div><div className="mt-0.5 text-[9px] text-[#918B83]">Actual accountant time, budget variance and unbilled work. Rates are explicit policy; Avantiqo never invents a billing rate.</div></div><button type="button" onClick={load} disabled={state.loading} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.07] bg-white px-2.5 text-[8px] font-semibold text-[#716B63]"><RefreshCw size={10} className={state.loading ? "animate-spin" : ""} />Refresh</button></div>

    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <Metric label="Actual time" value={`${number(totals.hours)}h`} detail="All non-void entries" />
      <Metric label="Billable" value={`${number(totals.billable_hours)}h`} detail={`${number(totals.utilization)}% of entered time`} />
      <Metric label="Approved WIP" value={`${number(totals.approved_unbilled_hours)}h`} detail="Ready for billing review" />
      <Metric label="Unbilled value" value={money(totals.unbilled_value, currency)} detail="Priced, not billed" />
      <Metric label="Needs rate" value={`${number(totals.unpriced_hours)}h`} detail="Blocked from billing readiness" attention={number(totals.unpriced_hours) > 0} />
    </div>

    <form onSubmit={saveBillingPolicy} className="rounded-2xl border border-black/[0.07] bg-white p-4">
      <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]"><WalletCards size={11} />Billing policy</div>
      <div className="mt-1 text-[8px] text-[#918B83]">Choose the exact firm entity and Finance customer that will bill this engagement. Tax treatment must be confirmed by a human before invoice creation is allowed.</div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Client engagement<select value={billingForm.engagementId} onChange={(event) => setBillingForm({ ...billingForm, engagementId: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal"><option value="">Select engagement…</option>{(data?.engagement_context || []).map((engagement) => <option key={engagement.id} value={engagement.id}>{engagement.client_name} — {engagement.service_package || "Accounting"}</option>)}</select></label>
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Billing entity<select value={billingForm.billingEntityId} onChange={(event) => { const entity = (data?.billing_options?.entities || []).find((row) => row.id === event.target.value); setBillingForm({ ...billingForm, billingEntityId: event.target.value, currencyCode: entity?.currency || billingForm.currencyCode, taxRuleId: "", taxTreatmentConfirmed: false }); }} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal"><option value="">Select legal entity…</option>{(data?.billing_options?.entities || []).map((entity) => <option key={entity.id} value={entity.id}>{entity.display_name || entity.legal_name || entity.code || entity.id}{entity.country ? ` · ${entity.country}` : ""}{entity.is_default_accounting_entity ? " · default" : ""}</option>)}</select></label>
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Finance customer<select value={billingForm.customerPartyId} onChange={(event) => setBillingForm({ ...billingForm, customerPartyId: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal"><option value="">Select customer party…</option>{(data?.billing_options?.customer_parties || []).map((party) => <option key={party.id} value={party.id}>{party.display_name || party.legal_name || party.email || party.id}</option>)}</select></label>
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Method<select value={billingForm.billingMethod} onChange={(event) => setBillingForm({ ...billingForm, billingMethod: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal"><option value="TIME_AND_MATERIALS">Time & materials</option><option value="FIXED_FEE">Fixed fee</option><option value="HYBRID">Hybrid</option><option value="NON_BILLABLE">Non-billable</option></select></label>
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Currency<input value={billingForm.currencyCode} maxLength={3} onChange={(event) => setBillingForm({ ...billingForm, currencyCode: event.target.value.toUpperCase() })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal" /></label>
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Hourly rate<input type="number" min="0" step="0.01" value={billingForm.defaultHourlyRate} onChange={(event) => setBillingForm({ ...billingForm, defaultHourlyRate: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal" /></label>
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Fixed fee<input type="number" min="0" step="0.01" value={billingForm.fixedFeeAmount} onChange={(event) => setBillingForm({ ...billingForm, fixedFeeAmount: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal" /></label>
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Payment terms (days)<input type="number" min="0" max="3650" value={billingForm.paymentTermsDays} onChange={(event) => setBillingForm({ ...billingForm, paymentTermsDays: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal" /></label>
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Billing cadence<select value={billingForm.billingCadence} onChange={(event) => setBillingForm({ ...billingForm, billingCadence: event.target.value, nextBillingDate: event.target.value === "ON_DEMAND" ? "" : billingForm.nextBillingDate })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal"><option value="ON_DEMAND">On demand</option><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="ANNUAL">Annual</option></select></label>
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Next billing date<input type="date" disabled={billingForm.billingCadence === "ON_DEMAND"} value={billingForm.nextBillingDate} onChange={(event) => setBillingForm({ ...billingForm, nextBillingDate: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal disabled:bg-[#F4F2EF]" /></label>
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Revenue account<select value={billingForm.revenueAccountId} onChange={(event) => setBillingForm({ ...billingForm, revenueAccountId: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal"><option value="">Select revenue account…</option>{(data?.billing_options?.revenue_accounts || []).map((account) => <option key={account.id} value={account.id}>{account.account_code ? `${account.account_code} · ` : ""}{account.account_name || account.name || account.id}</option>)}</select></label>
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Tax rule<select disabled={!billingForm.billingEntityId} value={billingForm.taxRuleId} onChange={(event) => setBillingForm({ ...billingForm, taxRuleId: event.target.value, taxTreatmentConfirmed: false })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal disabled:bg-[#F4F2EF]"><option value="">{!billingForm.billingEntityId ? "Choose billing entity first…" : applicableTaxRules.length ? "Select Finance tax rule…" : "No active sales tax rule for this jurisdiction"}</option>{applicableTaxRules.map((rule) => <option key={rule.id} value={rule.id}>{rule.tax_code} · {rule.tax_name} · {Math.round(number(rule.tax_rate) * 10000) / 100}% · {rule.tax_regime}</option>)}</select></label>
        <label className="flex min-h-9 items-center gap-2 rounded-lg border border-black/[0.07] bg-[#FAF9F7] px-3 text-[8px] text-[#625D56]"><input type="checkbox" checked={billingForm.taxTreatmentConfirmed} onChange={(event) => setBillingForm({ ...billingForm, taxTreatmentConfirmed: event.target.checked })} /><span><b>Tax treatment confirmed</b><br /><span className="text-[#918B83]">Required before invoicing</span></span></label>
        <label className="flex min-h-9 items-center gap-2 rounded-lg border border-black/[0.07] bg-[#FAF9F7] px-3 text-[8px] text-[#625D56]"><input type="checkbox" checked={billingForm.applyRateToUnpriced} onChange={(event) => setBillingForm({ ...billingForm, applyRateToUnpriced: event.target.checked })} /><span><b>Apply rate to unpriced WIP</b><br /><span className="text-[#918B83]">Explicitly reprice only unpriced unbilled time</span></span></label>
        <div className="flex items-end"><button type="submit" disabled={saving || !billingForm.engagementId} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[#A37849]/25 bg-[#FBF7F1] px-3 text-[8px] font-semibold text-[#76583A] disabled:opacity-40"><Save size={10} />Save billing policy</button></div>
      </div>
    </form>

    <form onSubmit={recordTime} className="rounded-2xl border border-black/[0.07] bg-white p-4">
      <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]"><Clock3 size={11} />Record actual time</div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(280px,1fr)_110px_130px_minmax(220px,1fr)_100px] lg:items-end">
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Accounting work<select value={form.workItemId} onChange={(event) => setForm({ ...form, workItemId: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal"><option value="">Select client work…</option>{(data?.work_items || []).map((item) => <option key={item.id} value={item.id}>{item.client_name} — {item.title}</option>)}</select></label>
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Minutes<input type="number" min="1" max="1440" value={form.minutes} onChange={(event) => setForm({ ...form, minutes: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal" /></label>
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Treatment<select value={form.billable ? "billable" : "non_billable"} onChange={(event) => setForm({ ...form, billable: event.target.value === "billable" })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal"><option value="billable">Billable</option><option value="non_billable">Non-billable</option></select></label>
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Note<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What was done?" className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal" /></label>
        <button type="submit" disabled={saving || !form.workItemId} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#76583A] px-3 text-[8px] font-semibold text-white disabled:opacity-40"><Save size={10} />Record</button>
      </div>
      {selectedWorkItem ? <div className="mt-2 text-[8px] text-[#918B83]">Budget {number(selectedWorkItem.budget_minutes)} min · Actual {number(selectedWorkItem.actual_minutes)} min · Variance {number(selectedWorkItem.budget_variance_minutes)} min</div> : null}
      {notice ? <div className="mt-2 text-[8px] text-[#76583A]">{notice}</div> : null}
    </form>

    <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
      <section className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white"><div className="border-b border-black/[0.055] px-4 py-3"><div className="text-[9px] font-semibold text-[#45413C]">Billing readiness</div><div className="mt-0.5 text-[8px] text-[#99938A]">One row per client engagement. Avantiqo tells you exactly what is missing before invoice creation is allowed.</div></div><div className="divide-y divide-black/[0.05]">{(data?.engagement_wip || []).map((row) => <div key={row.engagement_id} className="grid gap-3 px-4 py-3 text-[8px] lg:grid-cols-[minmax(180px,1fr)_70px_110px_minmax(180px,1fr)_100px] lg:items-center"><div className="min-w-0"><div className="truncate font-semibold text-[#403C37]">{row.client_name}</div><div className="mt-0.5 truncate text-[#99938A]">{row.service_package}</div></div><div className="tabular-nums text-[#625D56]">{row.approved_hours}h</div><div className="font-semibold text-[#403C37]">{money(row.unbilled_value, row.billing_profile?.currency_code || currency)}</div><div>{row.invoice_ready ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={9} />Invoice ready</span> : <div className="flex flex-wrap gap-1">{(row.blockers || []).map((blocker) => <span key={blocker} className="rounded-full border border-amber-700/15 bg-amber-50 px-1.5 py-0.5 text-[6px] font-semibold text-amber-800">{blocker}</span>)}</div>}</div><div className="text-right"><button type="button" disabled={saving || !row.invoice_ready} onClick={() => createInvoice(row.engagement_id)} className="inline-flex h-8 items-center justify-center rounded-lg bg-[#76583A] px-3 text-[7px] font-semibold text-white disabled:bg-[#E7E3DD] disabled:text-[#A39C94]">Create invoice</button></div></div>)}{!(data?.engagement_wip || []).length ? <div className="px-4 py-8 text-center text-[9px] text-[#918B83]">No accounting engagements are available for practice billing.</div> : null}</div></section>

      <section className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white"><div className="border-b border-black/[0.055] px-4 py-3"><div className="text-[9px] font-semibold text-[#45413C]">Recent time</div><div className="mt-0.5 text-[8px] text-[#99938A]">Submitted time must be approved before it becomes billing-ready WIP.</div></div><div className="divide-y divide-black/[0.05]">{(data?.entries || []).slice(0, 30).map((entry) => <div key={entry.id} className="grid grid-cols-[82px_minmax(150px,1fr)_55px_85px_90px] items-center gap-3 px-4 py-3 text-[8px]"><div className="tabular-nums text-[#716B63]">{shortDate(entry.work_date)}</div><div className="min-w-0"><div className="truncate font-medium text-[#403C37]">{entry.description || "Accounting work"}</div><div className="mt-0.5 text-[#99938A]">{entry.billable ? "Billable" : "Non-billable"}{entry.billing_rate == null && entry.billable ? " · rate required" : ""}</div></div><div className="tabular-nums text-right">{Math.round(number(entry.minutes) / 6) / 10}h</div><div><span className={`rounded-full border px-1.5 py-0.5 text-[6px] font-semibold uppercase ${tone(entry.status)}`}>{entry.status}</span></div><div className="text-right">{entry.status === "SUBMITTED" ? <button type="button" disabled={saving} onClick={() => approve(entry.id)} className="inline-flex items-center gap-1 font-semibold text-[#76583A]"><CheckCircle2 size={9} />Approve</button> : entry.status === "APPROVED" ? <span className="font-medium text-emerald-700">In WIP</span> : entry.status === "BILLED" ? <span className="font-medium text-[#716B63]">Billed</span> : "—"}</div></div>)}</div></section>
    </div>

    <div className="rounded-xl border border-[#A37849]/15 bg-[#FBF7F1] px-3.5 py-3 text-[8px] leading-4 text-[#76583A]"><span className="font-semibold">Billing control:</span> WIP becoming “billing ready” is not invoice authority. A customer invoice can only be created after Avantiqo proves the accounting-firm customer/legal-party mapping and the normal Finance invoice workflow remains the posting authority.</div>
  </div>;
}
