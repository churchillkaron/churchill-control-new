"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

const EMPTY_FORM = Object.freeze({
  customer_party_id: "",
  service_name: "",
  service_category: "",
  industry_key: "generic-service",
  customer_location_name: "",
  first_service_at: "",
  contract_end: "",
  duration_minutes: "60",
  recurrence_preset: "monthly",
  recurrence_interval: "1",
  recurrence_unit: "month",
  execution_template_id: "",
  preferred_staff_id: "",
  billing_mode: "none",
  billing_amount: "",
  billing_currency_code: "",
  billing_due_days: "0",
  billing_tax_code_id: "",
  notes: "",
});

function localInputToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatMoney(amount, currencyCode) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode || "USD",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currencyCode || ""}`.trim();
  }
}

function statusClass(status) {
  if (status === "active") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (status === "paused") return "border-amber-400/25 bg-amber-400/10 text-amber-200";
  if (status === "completed") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  return "border-white/10 bg-white/[0.04] text-white/55";
}

function Metric({ label, value }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-black/20 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

export default function ServicePlansPage() {
  const params = useParams();
  const { organization, loading: organizationLoading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";

  const [customers, setCustomers] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");

    try {
      const [customerResponse, planResponse, peopleResponse] = await Promise.all([
        fetch(`/api/commercial/customers?organizationId=${encodeURIComponent(organizationId)}&limit=500`, { cache: "no-store" }),
        fetch(`/api/service-management/plans?organizationId=${encodeURIComponent(organizationId)}&limit=500`, { cache: "no-store" }),
        fetch("/api/people/directory", { cache: "no-store" }).catch(() => null),
      ]);
      const [customerJson, planJson, peopleJson] = await Promise.all([
        customerResponse.json().catch(() => ({})),
        planResponse.json().catch(() => ({})),
        peopleResponse?.json().catch(() => ({})) || {},
      ]);

      if (!customerResponse.ok || !customerJson.success) {
        throw new Error(customerJson.error || "Customers could not be loaded.");
      }
      if (!planResponse.ok || !planJson.success) {
        throw new Error(planJson.error || "Service plans could not be loaded.");
      }

      setCustomers(customerJson.rows || customerJson.customers || []);
      setPlans(planJson.rows || []);

      const peopleOrganizationId = peopleJson?.organizationId || null;
      const activeEntityId = peopleJson?.activeEntityId || null;
      const availableTechnicians = peopleResponse?.ok
        && peopleJson?.success
        && peopleOrganizationId === organizationId
        ? (peopleJson.employees || []).filter((employee) => (
            employee.active !== false
            && employee.employment
            && (!activeEntityId || employee.employment.entity_id === activeEntityId)
          ))
        : [];
      setTechnicians(availableTechnicians);
    } catch (loadError) {
      setError(loadError.message || "Service Delivery data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const metrics = useMemo(() => {
    const active = plans.filter((plan) => plan.status === "active");
    const paused = plans.filter((plan) => plan.status === "paused");
    const now = Date.now();
    const overdue = active.filter((plan) => new Date(plan.next_service_at).getTime() < now);
    return {
      total: plans.length,
      active: active.length,
      paused: paused.length,
      overdue: overdue.length,
    };
  }, [plans]);

  function updateForm(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function createPlan(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const firstServiceAt = localInputToIso(form.first_service_at);
      if (!form.customer_party_id || !form.service_name || !firstServiceAt) {
        throw new Error("Customer, service name and first service date are required.");
      }

      if (["per_visit", "recurring"].includes(form.billing_mode)) {
        if (form.billing_amount === "" || !form.billing_currency_code.trim()) {
          throw new Error("Billable service plans require amount and currency.");
        }
      }

      const preferredTechnician = technicians.find((employee) => employee.id === form.preferred_staff_id) || null;
      const response = await fetch("/api/service-management/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          customer_party_id: form.customer_party_id,
          customer_location_name: form.customer_location_name || null,
          service_name: form.service_name,
          service_category: form.service_category || null,
          industry_key: form.industry_key || "generic-service",
          execution_template_id: form.execution_template_id || null,
          preferred_staff_id: preferredTechnician?.id || null,
          preferred_staff_name: preferredTechnician?.name || null,
          first_service_at: firstServiceAt,
          contract_start: firstServiceAt,
          contract_end: localInputToIso(form.contract_end),
          duration_minutes: Number(form.duration_minutes) || 60,
          recurrence: {
            preset: form.recurrence_preset,
            interval: Number(form.recurrence_interval) || 1,
            unit: form.recurrence_unit,
          },
          billing: {
            mode: form.billing_mode,
            amount: form.billing_amount === "" ? null : Number(form.billing_amount),
            currency_code: form.billing_currency_code.trim().toUpperCase() || null,
            due_days: Number(form.billing_due_days) || 0,
            tax_code_id: form.billing_tax_code_id.trim() || null,
          },
          notes: form.notes || null,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Service plan could not be created.");
      }

      setForm({ ...EMPTY_FORM });
      setNotice("Service plan created. Generate its first visit when ready for Operations.");
      await load();
    } catch (createError) {
      setError(createError.message || "Service plan could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function generateVisit(plan) {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/service-management/plans/${plan.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Next service visit could not be generated.");
      }

      if (json.generated && json.assignment?.assigned) {
        setNotice(`Next service visit generated and assigned to ${json.assignment.employee?.name || "the preferred technician"}.`);
      } else if (json.generated && plan.attributes?.service_delivery?.preferred_staff_id) {
        setNotice(`Next service visit generated. Preferred technician was not eligible (${json.assignment?.reason || "assignment unavailable"}), so the visit remains available to Dispatch.`);
      } else {
        setNotice(
          json.generated
            ? "Next service visit generated as a canonical Operations work order."
            : json.reason === "contract-complete"
              ? "Contract is complete; no additional visit was generated."
              : "This occurrence was already generated; no duplicate was created.",
        );
      }
      await load();
    } catch (generateError) {
      setError(generateError.message || "Next service visit could not be generated.");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(plan, status) {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/service-management/plans/${plan.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, status }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Service plan status could not be updated.");
      }
      setNotice(`Service plan is now ${status}.`);
      await load();
    } catch (statusError) {
      setError(statusError.message || "Service plan status could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  if (organizationLoading) {
    return <section className="mx-auto max-w-[1480px] px-5 py-10 text-white/45">Loading Service Delivery...</section>;
  }

  return (
    <section className="mx-auto max-w-[1480px] px-5 py-6 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9BCF53]">Service Management</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Service Plans & Recurring Delivery</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
            Define customer service commitments once, including how the service is billed, then generate controlled field visits into Operations.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/field-service`} className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-white/60">Field Service</Link>
          <Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/field-service/completed-services`} className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100">Completed Services</Link>
          <Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/work-orders`} className="rounded-xl border border-[#9BCF53]/30 bg-[#9BCF53]/10 px-4 py-2 text-sm text-[#D9F4B7]">Operations Work Orders</Link>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Service Plans" value={metrics.total} />
        <Metric label="Active" value={metrics.active} />
        <Metric label="Paused" value={metrics.paused} />
        <Metric label="Overdue Next Visit" value={metrics.overdue} />
      </div>

      {error ? <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}
      {notice ? <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08] p-4 text-sm text-emerald-100">{notice}</div> : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-[440px_minmax(0,1fr)]">
        <form onSubmit={createPlan} className="rounded-[26px] border border-white/10 bg-white/[0.025] p-5">
          <div className="text-lg font-semibold">Create Service Plan</div>
          <div className="mt-1 text-xs leading-5 text-white/35">Generic for pest control, cleaning, HVAC, pool service, maintenance and other recurring service businesses.</div>

          <div className="mt-5 space-y-4">
            <label className="block text-xs text-white/45">Customer
              <select value={form.customer_party_id} onChange={(event) => updateForm("customer_party_id", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white" required>
                <option value="">Select customer</option>
                {customers.map((customer) => <option key={customer.party_id || customer.id} value={customer.party_id || customer.id}>{customer.customer_name || customer.display_name || customer.name}</option>)}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-white/45">Service Name<input value={form.service_name} onChange={(event) => updateForm("service_name", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white" placeholder="Monthly treatment" required /></label>
              <label className="block text-xs text-white/45">Category<input value={form.service_category} onChange={(event) => updateForm("service_category", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white" placeholder="Preventive service" /></label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-white/45">Industry Key<input value={form.industry_key} onChange={(event) => updateForm("industry_key", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white" placeholder="pest-control" /></label>
              <label className="block text-xs text-white/45">Execution Template<input value={form.execution_template_id} onChange={(event) => updateForm("execution_template_id", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white" placeholder="Optional protocol" /></label>
            </div>

            <label className="block text-xs text-white/45">Customer Site / Location<input value={form.customer_location_name} onChange={(event) => updateForm("customer_location_name", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white" placeholder="Karon branch, Villa 3, Building A..." /></label>

            <label className="block text-xs text-white/45">Preferred Technician (optional)
              <select value={form.preferred_staff_id} onChange={(event) => updateForm("preferred_staff_id", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white">
                <option value="">No preference — Dispatch decides</option>
                {technicians.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.position ? ` · ${employee.position}` : ""}</option>)}
              </select>
              <span className="mt-2 block text-[11px] leading-5 text-white/30">Operations revalidates active employment for every visit. If the preference is no longer eligible, the visit remains unassigned for Dispatch.</span>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-white/45">First Service<input type="datetime-local" value={form.first_service_at} onChange={(event) => updateForm("first_service_at", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white" required /></label>
              <label className="block text-xs text-white/45">Contract End<input type="datetime-local" value={form.contract_end} onChange={(event) => updateForm("contract_end", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white" /></label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-white/45">Frequency
                <select value={form.recurrence_preset} onChange={(event) => updateForm("recurrence_preset", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white">
                  <option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option><option value="custom">Custom</option>
                </select>
              </label>
              <label className="block text-xs text-white/45">Duration Minutes<input type="number" min="1" value={form.duration_minutes} onChange={(event) => updateForm("duration_minutes", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white" /></label>
            </div>

            {form.recurrence_preset === "custom" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-white/45">Every<input type="number" min="1" value={form.recurrence_interval} onChange={(event) => updateForm("recurrence_interval", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white" /></label>
                <label className="block text-xs text-white/45">Unit<select value={form.recurrence_unit} onChange={(event) => updateForm("recurrence_unit", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white"><option value="day">Days</option><option value="week">Weeks</option><option value="month">Months</option><option value="year">Years</option></select></label>
              </div>
            ) : null}

            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
              <div className="text-xs font-semibold text-emerald-100">Billing</div>
              <div className="mt-1 text-[11px] leading-5 text-white/35">Choose how this service commitment should become revenue. Per-visit billing can create a Finance invoice only after the service is completed.</div>
              <label className="mt-3 block text-xs text-white/45">Billing Mode
                <select value={form.billing_mode} onChange={(event) => updateForm("billing_mode", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white">
                  <option value="none">No billing</option>
                  <option value="prepaid">Prepaid / already paid</option>
                  <option value="per_visit">Invoice each completed visit</option>
                  <option value="recurring">Recurring billing arrangement</option>
                </select>
              </label>
              {["per_visit", "recurring"].includes(form.billing_mode) ? (
                <div className="mt-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs text-white/45">Amount<input type="number" min="0" step="0.01" value={form.billing_amount} onChange={(event) => updateForm("billing_amount", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white" placeholder="1500" required /></label>
                    <label className="block text-xs text-white/45">Currency<input value={form.billing_currency_code} onChange={(event) => updateForm("billing_currency_code", event.target.value.toUpperCase())} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm uppercase text-white" placeholder="THB" maxLength={3} required /></label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs text-white/45">Payment Due Days<input type="number" min="0" value={form.billing_due_days} onChange={(event) => updateForm("billing_due_days", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white" /></label>
                    <label className="block text-xs text-white/45">Tax Rule ID<input value={form.billing_tax_code_id} onChange={(event) => updateForm("billing_tax_code_id", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white" placeholder="Optional configured tax rule" /></label>
                  </div>
                  <div className="text-[10px] leading-4 text-white/25">Tax is never hardcoded here. If a tax rule is selected, Finance resolves the organization-specific effective tax rule at completion.</div>
                </div>
              ) : null}
            </div>

            <label className="block text-xs text-white/45">Notes<textarea value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white" placeholder="Customer preferences, access instructions, service context..." /></label>

            <button type="submit" disabled={saving} className="w-full rounded-xl border border-[#9BCF53]/35 bg-[#9BCF53]/12 px-4 py-3 text-sm font-semibold text-[#D9F4B7] disabled:opacity-40">{saving ? "Saving..." : "Create Service Plan"}</button>
          </div>
        </form>

        <div className="rounded-[26px] border border-white/10 bg-white/[0.025] p-5">
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-lg font-semibold">Service Delivery Control</div><div className="mt-1 text-xs text-white/35">Plans create demand. Operations owns the actual visit execution and technician assignment.</div></div>
            <button type="button" onClick={load} disabled={loading || saving} className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-white/55">Refresh</button>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[1160px] text-left text-sm">
              <thead><tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.15em] text-white/30"><th className="px-3 py-3">Customer / Service</th><th className="px-3 py-3">Industry</th><th className="px-3 py-3">Frequency</th><th className="px-3 py-3">Billing</th><th className="px-3 py-3">Preferred Technician</th><th className="px-3 py-3">Next Visit</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Control</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan="8" className="px-3 py-8 text-center text-white/35">Loading service plans...</td></tr> : null}
                {!loading && plans.length === 0 ? <tr><td colSpan="8" className="px-3 py-8 text-center text-white/35">No service plans yet. Create the first recurring customer service plan.</td></tr> : null}
                {!loading && plans.map((plan) => {
                  const delivery = plan.attributes?.service_delivery || {};
                  const billing = delivery.billing || {};
                  const customerName = delivery.customer_name || "Customer";
                  const recurrence = plan.recurrence || {};
                  const recurrenceLabel = recurrence.preset === "custom" ? `Every ${recurrence.interval || 1} ${recurrence.unit || "month"}(s)` : recurrence.preset || "monthly";
                  return (
                    <tr key={plan.id} className="border-b border-white/[0.06] align-top">
                      <td className="px-3 py-4"><div className="font-medium text-white">{customerName}</div><div className="mt-1 text-xs text-white/50">{plan.service_name}{plan.customer_location_name ? ` · ${plan.customer_location_name}` : ""}</div></td>
                      <td className="px-3 py-4 text-white/55">{plan.industry_key}</td>
                      <td className="px-3 py-4 capitalize text-white/55">{recurrenceLabel}</td>
                      <td className="px-3 py-4"><div className="capitalize text-white/65">{String(billing.mode || "none").replaceAll("_", " ")}</div>{billing.amount !== null && billing.amount !== undefined ? <div className="mt-1 text-[11px] text-white/35">{formatMoney(billing.amount, billing.currency_code)}</div> : null}</td>
                      <td className="px-3 py-4"><div className="text-white/65">{delivery.preferred_staff_name || "Dispatch queue"}</div>{delivery.preferred_staff_id ? <div className="mt-1 text-[11px] text-white/30">Eligibility checked per visit</div> : null}</td>
                      <td className="px-3 py-4"><div className="text-white/70">{formatDate(plan.next_service_at)}</div>{plan.last_work_order_id ? <div className="mt-1 text-[11px] text-white/30">Last work order: {plan.last_work_order_id.slice(0, 8)}</div> : null}</td>
                      <td className="px-3 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${statusClass(plan.status)}`}>{plan.status}</span></td>
                      <td className="px-3 py-4"><div className="flex justify-end gap-2">
                        {plan.status === "active" ? <button type="button" disabled={saving} onClick={() => generateVisit(plan)} className="rounded-lg border border-[#9BCF53]/30 bg-[#9BCF53]/10 px-3 py-2 text-xs text-[#D9F4B7]">Generate Next Visit</button> : null}
                        {plan.status === "active" ? <button type="button" disabled={saving} onClick={() => setStatus(plan, "paused")} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/50">Pause</button> : null}
                        {plan.status === "paused" ? <button type="button" disabled={saving} onClick={() => setStatus(plan, "active")} className="rounded-lg border border-emerald-400/20 px-3 py-2 text-xs text-emerald-200">Resume</button> : null}
                        {["active", "paused"].includes(plan.status) ? <button type="button" disabled={saving} onClick={() => setStatus(plan, "cancelled")} className="rounded-lg border border-red-400/15 px-3 py-2 text-xs text-red-200/70">Cancel</button> : null}
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
