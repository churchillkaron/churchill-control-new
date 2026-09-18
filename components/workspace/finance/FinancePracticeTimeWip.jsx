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
  const [billingForm, setBillingForm] = useState({ engagementId: "", billingMethod: "TIME_AND_MATERIALS", currencyCode: "THB", defaultHourlyRate: "", fixedFeeAmount: "" });

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

  useEffect(() => {
    const profile = selectedEngagement?.billing_profile;
    if (!selectedEngagement) return;
    setBillingForm((current) => ({
      ...current,
      billingMethod: profile?.billing_method || "TIME_AND_MATERIALS",
      currencyCode: profile?.currency_code || "THB",
      defaultHourlyRate: profile?.default_hourly_rate ?? "",
      fixedFeeAmount: profile?.fixed_fee_amount ?? "",
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
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to save billing policy");
      setNotice("Billing policy saved. Future time entries will snapshot the governed rate.");
      await load();
    } catch (error) { setNotice(error?.message || "Unable to save billing policy"); }
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
      <div className="mt-1 text-[8px] text-[#918B83]">Set the commercial terms once per client engagement. Rates are human-controlled and snapshotted onto future time entries.</div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_90px_130px_130px_100px] lg:items-end">
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Client engagement<select value={billingForm.engagementId} onChange={(event) => setBillingForm({ ...billingForm, engagementId: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal"><option value="">Select engagement…</option>{(data?.engagement_context || []).map((engagement) => <option key={engagement.id} value={engagement.id}>{engagement.client_name} — {engagement.service_package || "Accounting"}</option>)}</select></label>
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Method<select value={billingForm.billingMethod} onChange={(event) => setBillingForm({ ...billingForm, billingMethod: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal"><option value="TIME_AND_MATERIALS">Time & materials</option><option value="FIXED_FEE">Fixed fee</option><option value="HYBRID">Hybrid</option><option value="NON_BILLABLE">Non-billable</option></select></label>
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Currency<input value={billingForm.currencyCode} maxLength={3} onChange={(event) => setBillingForm({ ...billingForm, currencyCode: event.target.value.toUpperCase() })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal" /></label>
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Hourly rate<input type="number" min="0" step="0.01" value={billingForm.defaultHourlyRate} onChange={(event) => setBillingForm({ ...billingForm, defaultHourlyRate: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal" /></label>
        <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8C877F]">Fixed fee<input type="number" min="0" step="0.01" value={billingForm.fixedFeeAmount} onChange={(event) => setBillingForm({ ...billingForm, fixedFeeAmount: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 text-[9px] normal-case tracking-normal" /></label>
        <button type="submit" disabled={saving || !billingForm.engagementId} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#A37849]/25 bg-[#FBF7F1] px-3 text-[8px] font-semibold text-[#76583A] disabled:opacity-40"><Save size={10} />Save</button>
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
      <section className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white"><div className="border-b border-black/[0.055] px-4 py-3"><div className="text-[9px] font-semibold text-[#45413C]">Client WIP</div><div className="mt-0.5 text-[8px] text-[#99938A]">Billing readiness without creating an invoice prematurely.</div></div><div className="divide-y divide-black/[0.05]">{(data?.clients || []).map((client) => <div key={client.organization_id} className="grid grid-cols-[minmax(160px,1fr)_70px_100px_95px] items-center gap-3 px-4 py-3 text-[8px]"><div className="min-w-0"><div className="truncate font-semibold text-[#403C37]">{client.client_name}</div><div className="mt-0.5 text-[#99938A]">{client.approved_unbilled_hours}h approved · {client.unpriced_hours}h unpriced</div></div><div className="text-right tabular-nums text-[#625D56]">{client.billable_hours}h</div><div className="text-right font-semibold text-[#403C37]">{money(client.unbilled_value, currency)}</div><div className={`text-right text-[7px] font-semibold uppercase ${client.billing_ready ? "text-emerald-700" : "text-amber-700"}`}>{client.billing_ready ? "Billing ready" : "Review WIP"}</div></div>)}{!(data?.clients || []).length ? <div className="px-4 py-8 text-center text-[9px] text-[#918B83]">No time has been recorded yet.</div> : null}</div></section>

      <section className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white"><div className="border-b border-black/[0.055] px-4 py-3"><div className="text-[9px] font-semibold text-[#45413C]">Recent time</div><div className="mt-0.5 text-[8px] text-[#99938A]">Submitted time must be approved before it becomes billing-ready WIP.</div></div><div className="divide-y divide-black/[0.05]">{(data?.entries || []).slice(0, 30).map((entry) => <div key={entry.id} className="grid grid-cols-[82px_minmax(150px,1fr)_55px_85px_90px] items-center gap-3 px-4 py-3 text-[8px]"><div className="tabular-nums text-[#716B63]">{shortDate(entry.work_date)}</div><div className="min-w-0"><div className="truncate font-medium text-[#403C37]">{entry.description || "Accounting work"}</div><div className="mt-0.5 text-[#99938A]">{entry.billable ? "Billable" : "Non-billable"}{entry.billing_rate == null && entry.billable ? " · rate required" : ""}</div></div><div className="tabular-nums text-right">{Math.round(number(entry.minutes) / 6) / 10}h</div><div><span className={`rounded-full border px-1.5 py-0.5 text-[6px] font-semibold uppercase ${tone(entry.status)}`}>{entry.status}</span></div><div className="text-right">{entry.status === "SUBMITTED" ? <button type="button" disabled={saving} onClick={() => approve(entry.id)} className="inline-flex items-center gap-1 font-semibold text-[#76583A]"><CheckCircle2 size={9} />Approve</button> : entry.status === "APPROVED" ? <span className="font-medium text-emerald-700">In WIP</span> : entry.status === "BILLED" ? <span className="font-medium text-[#716B63]">Billed</span> : "—"}</div></div>)}</div></section>
    </div>

    <div className="rounded-xl border border-[#A37849]/15 bg-[#FBF7F1] px-3.5 py-3 text-[8px] leading-4 text-[#76583A]"><span className="font-semibold">Billing control:</span> WIP becoming “billing ready” is not invoice authority. A customer invoice can only be created after Avantiqo proves the accounting-firm customer/legal-party mapping and the normal Finance invoice workflow remains the posting authority.</div>
  </div>;
}
