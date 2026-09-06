"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  MapPin,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

const STEPS = [
  ["customer", "Customer & site"],
  ["service", "Service & protocol"],
  ["schedule", "Schedule"],
  ["technician", "Technician"],
  ["billing", "Billing"],
  ["review", "Review"],
];

const EMPTY_FORM = Object.freeze({
  customer_party_id: "",
  customer_location_name: "",
  service_name: "Routine pest control service",
  service_category: "preventive_pest_control",
  execution_template_id: "",
  first_service_at: "",
  contract_end: "",
  duration_minutes: "60",
  recurrence_preset: "monthly",
  recurrence_interval: "1",
  recurrence_unit: "month",
  preferred_staff_id: "",
  billing_mode: "per_visit",
  billing_amount: "",
  billing_currency_code: "THB",
  billing_due_days: "0",
  billing_tax_code_id: "",
  notes: "",
});

function text(value) { return String(value ?? "").trim(); }
function localInputToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function displayDate(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
function frequencyLabel(form) {
  if (form.recurrence_preset === "weekly") return "Every week";
  if (form.recurrence_preset === "biweekly") return "Every 2 weeks";
  if (form.recurrence_preset === "monthly") return "Every month";
  if (form.recurrence_preset === "quarterly") return "Every 3 months";
  if (form.recurrence_preset === "yearly") return "Every year";
  return `Every ${form.recurrence_interval || 1} ${form.recurrence_unit || "month"}${Number(form.recurrence_interval || 1) === 1 ? "" : "s"}`;
}
function statusTone(status) {
  if (status === "active") return "border-[#748267]/20 bg-[#748267]/[0.06] text-[#607057]";
  if (status === "paused") return "border-[#C08A4A]/20 bg-[#C08A4A]/[0.06] text-[#76583A]";
  return "border-black/[0.08] bg-black/[0.025] text-[#777169]";
}

function Input({ label, hint, children }) {
  return <label className="block"><span className="text-[9px] font-medium text-[#4E4943]">{label}</span>{hint ? <span className="ml-2 text-[8px] text-[#99928A]">{hint}</span> : null}{children}</label>;
}

export default function ServicePlansPage() {
  const params = useParams();
  const { organization, loading: organizationLoading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";
  const [customers, setCustomers] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [taxCodes, setTaxCodes] = useState([]);
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const inputClass = "mt-2 w-full rounded-xl border border-black/[0.09] bg-white px-3.5 py-3 text-[11px] text-[#2B2926] outline-none transition focus:border-[#D6A66A]/60";

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const [customerResponse, planResponse, peopleResponse, templateResponse, taxResponse] = await Promise.all([
        fetch(`/api/commercial/customers?organizationId=${encodeURIComponent(organizationId)}&limit=500`, { cache: "no-store" }),
        fetch(`/api/service-management/plans?organizationId=${encodeURIComponent(organizationId)}&limit=500`, { cache: "no-store" }),
        fetch("/api/people/directory", { cache: "no-store" }).catch(() => null),
        fetch(`/api/service-management/execution-templates?organizationId=${encodeURIComponent(organizationId)}&industry_key=pest_control&status=active&limit=500`, { cache: "no-store" }),
        fetch(`/api/finance/tax-codes?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" }).catch(() => null),
      ]);
      const [customerJson, planJson, peopleJson, templateJson, taxJson] = await Promise.all([
        customerResponse.json().catch(() => ({})),
        planResponse.json().catch(() => ({})),
        peopleResponse?.json().catch(() => ({})) || {},
        templateResponse.json().catch(() => ({})),
        taxResponse?.json().catch(() => ({})) || {},
      ]);
      if (!customerResponse.ok || !customerJson.success) throw new Error(customerJson.error || "Customers could not be loaded.");
      if (!planResponse.ok || !planJson.success) throw new Error(planJson.error || "Service plans could not be loaded.");
      if (!templateResponse.ok || !templateJson.success) throw new Error(templateJson.error || "Treatment protocols could not be loaded.");
      setCustomers(customerJson.rows || []);
      setPlans(planJson.rows || []);
      setTemplates(templateJson.rows || []);
      setTechnicians(peopleResponse?.ok && peopleJson?.success && peopleJson.organizationId === organizationId
        ? (peopleJson.employees || []).filter((employee) => employee.active !== false && employee.employment)
        : []);
      setTaxCodes(taxResponse?.ok && taxJson?.success ? (taxJson.taxCodes || taxJson.rows || []) : []);
    } catch (loadError) {
      setError(loadError.message || "Pest Control service setup could not be loaded.");
    } finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const selectedCustomer = useMemo(() => customers.find((row) => (row.party_id || row.id) === form.customer_party_id) || null, [customers, form.customer_party_id]);
  const selectedTemplate = useMemo(() => templates.find((row) => row.id === form.execution_template_id) || null, [templates, form.execution_template_id]);
  const selectedTechnician = useMemo(() => technicians.find((row) => row.id === form.preferred_staff_id) || null, [technicians, form.preferred_staff_id]);
  const activePlans = plans.filter((plan) => plan.status === "active");
  const overduePlans = activePlans.filter((plan) => plan.next_service_at && new Date(plan.next_service_at).getTime() < Date.now());

  function update(name, value) { setForm((current) => ({ ...current, [name]: value })); setError(""); }
  function selectCustomer(value) {
    const customer = customers.find((row) => (row.party_id || row.id) === value) || null;
    const site = customer?.shipping_address || customer?.address || customer?.billing_address || "";
    setForm((current) => ({ ...current, customer_party_id: value, customer_location_name: current.customer_party_id === value ? current.customer_location_name : site }));
    setError("");
  }

  function validateStep(index) {
    if (index === 0 && (!form.customer_party_id || !text(form.customer_location_name))) return "Choose the customer and confirm the service site.";
    if (index === 1 && (!text(form.service_name) || !form.execution_template_id)) return "Name the service and choose the treatment protocol technicians will follow.";
    if (index === 2 && !localInputToIso(form.first_service_at)) return "Choose when the first service should happen.";
    if (index === 4 && ["per_visit", "recurring"].includes(form.billing_mode) && (form.billing_amount === "" || !text(form.billing_currency_code))) return "Enter the price and currency for this billing arrangement.";
    return "";
  }

  function next() {
    const validation = validateStep(step);
    if (validation) { setError(validation); return; }
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  }

  async function createPlan() {
    for (let index = 0; index < STEPS.length - 1; index += 1) {
      const validation = validateStep(index);
      if (validation) { setStep(index); setError(validation); return; }
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const firstServiceAt = localInputToIso(form.first_service_at);
      const response = await fetch("/api/service-management/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          customer_party_id: form.customer_party_id,
          customer_location_name: text(form.customer_location_name),
          service_name: text(form.service_name),
          service_category: form.service_category || "preventive_pest_control",
          industry_key: "pest_control",
          execution_template_id: form.execution_template_id,
          preferred_staff_id: selectedTechnician?.id || null,
          preferred_staff_name: selectedTechnician?.name || null,
          first_service_at: firstServiceAt,
          contract_start: firstServiceAt,
          contract_end: localInputToIso(form.contract_end),
          duration_minutes: Number(form.duration_minutes) || 60,
          recurrence: { preset: form.recurrence_preset, interval: Number(form.recurrence_interval) || 1, unit: form.recurrence_unit },
          billing: {
            mode: form.billing_mode,
            amount: form.billing_amount === "" ? null : Number(form.billing_amount),
            currency_code: text(form.billing_currency_code).toUpperCase() || null,
            due_days: Number(form.billing_due_days) || 0,
            tax_code_id: form.billing_tax_code_id || null,
          },
          notes: text(form.notes) || null,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Service plan could not be created.");
      setForm({ ...EMPTY_FORM }); setStep(0);
      setNotice("Service plan created. It is ready to generate its first governed visit into Dispatch.");
      await load();
    } catch (createError) { setError(createError.message || "Service plan could not be created."); }
    finally { setSaving(false); }
  }

  async function generateVisit(plan) {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/service-management/plans/${plan.id}/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Next visit could not be generated.");
      setNotice(json.generated ? "Next visit created in Operations and is ready for dispatch." : "No duplicate visit was created; the current occurrence already exists or the contract is complete.");
      await load();
    } catch (actionError) { setError(actionError.message || "Next visit could not be generated."); }
    finally { setSaving(false); }
  }

  async function setStatus(plan, status) {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/service-management/plans/${plan.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, status }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Plan status could not be changed.");
      setNotice(status === "paused" ? "Recurring visits paused. Existing generated work is unchanged." : "Recurring service plan reactivated.");
      await load();
    } catch (actionError) { setError(actionError.message || "Plan status could not be changed."); }
    finally { setSaving(false); }
  }

  if (organizationLoading) return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing Pest Control service plans…</div>;

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#201E1B] md:px-7 lg:px-9 lg:py-7">
      <div className="mx-auto max-w-[1580px]">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.07] pb-5">
          <div><Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/field-service`} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E]"><ArrowLeft size={10} /> Pest Control</Link><div className="mt-3 text-[9px] font-medium uppercase tracking-[0.16em] text-[#9A744B]">Recurring service</div><h1 className="mt-1 text-[28px] font-medium tracking-[-0.04em]">Service plans</h1><p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#777169]">Set up the customer commitment once. Avantiqo turns it into governed visits for Dispatch and the technician.</p></div>
          <div className="flex gap-2"><Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/dispatch`} className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[9px]">Dispatch</Link><button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[9px]"><RefreshCw size={10} className={loading ? "animate-spin" : ""} />Refresh</button></div>
        </header>

        {error ? <div className="mt-4 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[10px] text-[#8B4937]">{error}</div> : null}
        {notice ? <div className="mt-4 rounded-xl border border-[#748267]/18 bg-[#748267]/[0.05] px-4 py-3 text-[10px] text-[#607057]">{notice}</div> : null}

        <section className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[8px] uppercase tracking-[0.1em] text-[#948D84]">Active plans</div><div className="mt-2 text-[24px] font-medium">{activePlans.length}</div></div><div className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[8px] uppercase tracking-[0.1em] text-[#948D84]">Need scheduling attention</div><div className="mt-2 text-[24px] font-medium">{overduePlans.length}</div></div><div className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[8px] uppercase tracking-[0.1em] text-[#948D84]">Available protocols</div><div className="mt-2 text-[24px] font-medium">{templates.length}</div></div></section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[520px_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-2xl border border-black/[0.075] bg-white">
            <div className="border-b border-black/[0.06] px-5 py-4"><div className="text-[9px] uppercase tracking-[0.13em] text-[#9A744B]">Create service plan</div><h2 className="mt-1 text-[18px] font-medium">Set up recurring work</h2><p className="mt-1 text-[9px] leading-4 text-[#817A72]">Only answer what the business knows. Technical lineage is created automatically.</p></div>
            <div className="grid grid-cols-6 border-b border-black/[0.06] bg-[#FBFAF8]">{STEPS.map(([id, label], index) => <button key={id} type="button" onClick={() => index <= step && setStep(index)} className={`px-2 py-3 text-center ${index === step ? "bg-white" : ""}`}><span className={`mx-auto flex h-5 w-5 items-center justify-center rounded-full text-[8px] ${index < step ? "bg-[#748267] text-white" : index === step ? "bg-[#D6A66A] text-[#2C2925]" : "bg-[#ECE9E4] text-[#958F87]"}`}>{index < step ? <Check size={9} /> : index + 1}</span><span className="mt-1 block truncate text-[7px] text-[#817A72]">{label}</span></button>)}</div>

            <div className="min-h-[390px] p-5">
              {step === 0 ? <div className="space-y-4"><div className="flex items-center gap-2 text-[12px] font-medium"><MapPin size={13} />Where are we servicing?</div><Input label="Customer"><select value={form.customer_party_id} onChange={(event) => selectCustomer(event.target.value)} className={inputClass}><option value="">Choose customer…</option>{customers.map((customer) => <option key={customer.party_id || customer.id} value={customer.party_id || customer.id}>{customer.customer_name || customer.display_name || customer.name}</option>)}</select></Input><Input label="Service site" hint="Prefilled from customer record when available"><textarea value={form.customer_location_name} onChange={(event) => update("customer_location_name", event.target.value)} className={`${inputClass} min-h-24 resize-y`} placeholder="Hotel, villa, branch, building or full service address" /></Input>{selectedCustomer ? <div className="rounded-xl bg-[#FBFAF8] p-3 text-[9px] leading-4 text-[#756F68]">Customer: <strong>{selectedCustomer.customer_name || selectedCustomer.name}</strong>{selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ""}{selectedCustomer.email ? ` · ${selectedCustomer.email}` : ""}</div> : null}</div> : null}

              {step === 1 ? <div className="space-y-4"><div className="flex items-center gap-2 text-[12px] font-medium"><ShieldCheck size={13} />What service should the technician perform?</div><Input label="Service name"><input value={form.service_name} onChange={(event) => update("service_name", event.target.value)} className={inputClass} placeholder="Routine pest control service" /></Input><Input label="Treatment protocol" hint="This becomes the technician's governed checklist"><select value={form.execution_template_id} onChange={(event) => update("execution_template_id", event.target.value)} className={inputClass}><option value="">Choose protocol…</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name} · v{template.version || 1}</option>)}</select></Input>{selectedTemplate ? <div className="rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.04] p-3"><div className="text-[9px] font-medium text-[#725434]">{selectedTemplate.name}</div><div className="mt-1 text-[8px] leading-4 text-[#817A72]">{selectedTemplate.description || selectedTemplate.instructions || "Technician protocol is controlled by this template."}</div></div> : templates.length === 0 ? <div className="rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] p-3 text-[9px] text-[#8B4937]">No active Pest Control protocol exists. Create a treatment protocol before creating customer service plans.</div> : null}</div> : null}

              {step === 2 ? <div className="space-y-4"><div className="flex items-center gap-2 text-[12px] font-medium"><CalendarDays size={13} />When should we service them?</div><div className="grid gap-3 sm:grid-cols-2"><Input label="First visit"><input type="datetime-local" value={form.first_service_at} onChange={(event) => update("first_service_at", event.target.value)} className={inputClass} /></Input><Input label="Typical visit duration"><select value={form.duration_minutes} onChange={(event) => update("duration_minutes", event.target.value)} className={inputClass}><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select></Input></div><Input label="Repeat"><select value={form.recurrence_preset} onChange={(event) => update("recurrence_preset", event.target.value)} className={inputClass}><option value="weekly">Every week</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Every month</option><option value="quarterly">Every 3 months</option><option value="yearly">Every year</option><option value="custom">Custom frequency</option></select></Input>{form.recurrence_preset === "custom" ? <div className="grid gap-3 sm:grid-cols-2"><Input label="Every"><input type="number" min="1" value={form.recurrence_interval} onChange={(event) => update("recurrence_interval", event.target.value)} className={inputClass} /></Input><Input label="Unit"><select value={form.recurrence_unit} onChange={(event) => update("recurrence_unit", event.target.value)} className={inputClass}><option value="day">Days</option><option value="week">Weeks</option><option value="month">Months</option><option value="year">Years</option></select></Input></div> : null}<Input label="Contract end" hint="Optional"><input type="datetime-local" value={form.contract_end} onChange={(event) => update("contract_end", event.target.value)} className={inputClass} /></Input></div> : null}

              {step === 3 ? <div className="space-y-4"><div className="flex items-center gap-2 text-[12px] font-medium"><UserRound size={13} />Who normally handles this customer?</div><Input label="Preferred technician" hint="Optional — Dispatch remains authoritative"><select value={form.preferred_staff_id} onChange={(event) => update("preferred_staff_id", event.target.value)} className={inputClass}><option value="">Let Dispatch decide each visit</option>{technicians.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.position ? ` · ${employee.position}` : ""}</option>)}</select></Input><div className="rounded-xl bg-[#FBFAF8] p-4 text-[9px] leading-4 text-[#756F68]">A preference is not a permanent assignment. Avantiqo re-checks active employment for every generated visit; if that person is unavailable, Dispatch receives the visit unassigned instead of silently assigning the wrong person.</div><Input label="Standing customer / site instructions" hint="Optional"><textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} className={`${inputClass} min-h-28 resize-y`} placeholder="Gate code, contact person, sensitive areas, pets, access hours, customer preferences…" /></Input></div> : null}

              {step === 4 ? <div className="space-y-4"><div className="flex items-center gap-2 text-[12px] font-medium"><CreditCard size={13} />How is this customer billed?</div><Input label="Billing arrangement"><select value={form.billing_mode} onChange={(event) => update("billing_mode", event.target.value)} className={inputClass}><option value="per_visit">Invoice each completed visit</option><option value="recurring">Recurring billing arrangement</option><option value="prepaid">Prepaid / already paid</option><option value="none">Do not bill from this plan</option></select></Input>{["per_visit", "recurring"].includes(form.billing_mode) ? <><div className="grid gap-3 sm:grid-cols-2"><Input label="Price"><input type="number" min="0" step="0.01" value={form.billing_amount} onChange={(event) => update("billing_amount", event.target.value)} className={inputClass} placeholder="2500" /></Input><Input label="Currency"><input value={form.billing_currency_code} onChange={(event) => update("billing_currency_code", event.target.value.toUpperCase())} className={inputClass} maxLength={3} /></Input></div><div className="grid gap-3 sm:grid-cols-2"><Input label="Payment due"><select value={form.billing_due_days} onChange={(event) => update("billing_due_days", event.target.value)} className={inputClass}><option value="0">Due immediately</option><option value="7">7 days</option><option value="15">15 days</option><option value="30">30 days</option></select></Input><Input label="Tax rule"><select value={form.billing_tax_code_id} onChange={(event) => update("billing_tax_code_id", event.target.value)} className={inputClass}><option value="">No tax rule</option>{taxCodes.map((tax) => <option key={tax.id} value={tax.id}>{tax.name || tax.code || "Tax rule"}{Number.isFinite(Number(tax.rate)) ? ` · ${tax.rate}%` : ""}</option>)}</select></Input></div></> : <div className="rounded-xl bg-[#FBFAF8] p-4 text-[9px] leading-4 text-[#756F68]">No invoice will be created from completed visits under this plan.</div>}</div> : null}

              {step === 5 ? <div className="space-y-3"><div className="text-[12px] font-medium">Check before creating</div>{[["Customer", selectedCustomer?.customer_name || selectedCustomer?.name || "—"],["Site", form.customer_location_name || "—"],["Service", form.service_name],["Protocol", selectedTemplate?.name || "—"],["First visit", displayDate(localInputToIso(form.first_service_at))],["Frequency", frequencyLabel(form)],["Technician", selectedTechnician?.name || "Dispatch decides"],["Billing", form.billing_mode === "per_visit" ? `${form.billing_amount || "—"} ${form.billing_currency_code} per completed visit` : form.billing_mode.replaceAll("_", " ")]].map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 rounded-xl bg-[#FBFAF8] px-3.5 py-3"><span className="text-[8px] uppercase tracking-[0.08em] text-[#99928A]">{label}</span><span className="max-w-[65%] text-right text-[10px] font-medium text-[#4E4943]">{value}</span></div>)}<div className="rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.04] p-3 text-[9px] leading-4 text-[#725434]">Creating this plan does not silently create or start field work. Use “Generate next visit” when the first occurrence should enter Dispatch.</div></div> : null}
            </div>

            <div className="flex items-center justify-between border-t border-black/[0.06] bg-[#FBFAF8] p-4"><button type="button" disabled={step === 0 || saving} onClick={() => setStep((current) => Math.max(0, current - 1))} className="rounded-xl border border-black/[0.08] bg-white px-4 py-2.5 text-[9px] disabled:opacity-30">Back</button>{step < STEPS.length - 1 ? <button type="button" onClick={next} className="inline-flex items-center gap-1.5 rounded-xl bg-[#2C2925] px-4 py-2.5 text-[9px] font-medium text-white">Continue <ChevronRight size={10} /></button> : <button type="button" disabled={saving} onClick={createPlan} className="rounded-xl bg-[#2C2925] px-4 py-2.5 text-[9px] font-medium text-white disabled:opacity-40">{saving ? "Creating…" : "Create service plan"}</button>}</div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-black/[0.075] bg-white"><div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4"><div><div className="text-[9px] uppercase tracking-[0.13em] text-[#9A744B]">Current commitments</div><h2 className="mt-1 text-[16px] font-medium">Customer service plans</h2></div><span className="text-[10px] text-[#817A72]">{plans.length} plans</span></div><div className="divide-y divide-black/[0.05]">{plans.map((plan) => { const delivery = plan.attributes?.service_delivery || {}; return <div key={plan.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[7px] uppercase tracking-[0.08em] ${statusTone(plan.status)}`}>{plan.status}</span><span className="text-[8px] text-[#99928A]">{frequencyLabel({ recurrence_preset: plan.recurrence?.preset, recurrence_interval: plan.recurrence?.interval, recurrence_unit: plan.recurrence?.unit })}</span></div><div className="mt-2 text-[13px] font-medium">{plan.service_name}</div><div className="mt-1 text-[9px] text-[#756F68]">{delivery.customer_name || "Customer"} · {plan.customer_location_name || "Site not named"}</div></div><div className="text-right"><div className="flex items-center justify-end gap-1 text-[8px] text-[#99928A]"><Clock3 size={9} />Next visit</div><div className="mt-1 text-[10px] font-medium">{displayDate(plan.next_service_at)}</div></div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.05] pt-3"><div className="text-[8px] text-[#8F877F]">Protocol · {delivery.execution_template_id ? "governed" : "missing"}{delivery.preferred_staff_name ? ` · Preferred: ${delivery.preferred_staff_name}` : ""}</div><div className="flex gap-2">{plan.status === "active" ? <><button disabled={saving} onClick={() => generateVisit(plan)} className="rounded-lg border border-[#D6A66A]/30 bg-[#D6A66A]/[0.07] px-3 py-2 text-[8px] font-medium text-[#725434]">Generate next visit</button><button disabled={saving} onClick={() => setStatus(plan, "paused")} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[8px] text-[#6B645C]">Pause recurring</button></> : plan.status === "paused" ? <button disabled={saving} onClick={() => setStatus(plan, "active")} className="rounded-lg border border-[#D6A66A]/30 bg-[#D6A66A]/[0.07] px-3 py-2 text-[8px] font-medium text-[#725434]">Resume recurring</button> : null}</div></div></div>; })}{!loading && plans.length === 0 ? <div className="p-10 text-center text-[10px] text-[#8C857D]">No service plans yet. Create the first customer commitment on the left.</div> : null}</div></section>
        </div>
      </div>
    </main>
  );
}