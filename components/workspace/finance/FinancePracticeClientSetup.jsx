"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, Plus, X } from "lucide-react";

const DEFAULT_FORM = {
  clientOrganizationId: "", entityId: "", servicePackage: "Monthly accounting",
  monthlyFee: "", billingDay: "1", startDate: "", contractStartDate: "",
  renewalDate: "", yearEndDate: "", accountingStandard: "TFRS",
  vatFrequency: "MONTHLY", payrollFrequency: "MONTHLY",
  bookkeepingEnabled: true, vatEnabled: true, payrollEnabled: false,
  taxEnabled: true, reportingEnabled: true, auditEnabled: false,
  contactName: "", contactEmail: "", contactPhone: "", taxId: "",
  vatNumber: "", position: "", whatsapp: "",
};

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#817B72]">{label}</span>
      <div className="mt-1">{children}</div>
      {hint ? <div className="mt-1 text-[8px] leading-4 text-[#9A948B]">{hint}</div> : null}
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-[#FAF9F7] px-3 py-2.5">
      <span className="text-[9px] font-medium text-[#514C45]">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-3.5 w-3.5 accent-[#8A633C]" />
    </label>
  );
}

export default function FinancePracticeClientSetup({ organizationId, existingClients = [], onCreated }) {
  const [open, setOpen] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);

  const existingIds = useMemo(() => new Set((existingClients || []).map((client) => client.organization_id).filter(Boolean)), [existingClients]);
  const candidates = useMemo(() => organizations.filter((row) => row.id !== organizationId && !existingIds.has(row.id)), [organizations, existingIds, organizationId]);

  function patch(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function loadOrganizations() {
    setLoadingOrganizations(true);
    try {
      const response = await fetch("/api/workspace/list", { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load accessible organizations");
      setOrganizations(Array.isArray(body.organizations) ? body.organizations : []);
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Unable to load accessible organizations" });
    } finally {
      setLoadingOrganizations(false);
    }
  }

  async function loadEntities(clientOrganizationId) {
    setEntities([]);
    patch("entityId", "");
    if (!clientOrganizationId) return;
    setLoadingEntities(true);
    try {
      const url = new URL("/api/finance/legal-entities/list", window.location.origin);
      url.searchParams.set("organizationId", clientOrganizationId);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load client legal entities");
      setEntities((body.entities || []).filter((entity) => entity.is_active !== false));
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Unable to load client legal entities" });
    } finally {
      setLoadingEntities(false);
    }
  }

  useEffect(() => {
    if (open && !organizations.length && !loadingOrganizations) loadOrganizations();
  }, [open]);

  async function submit(event) {
    event.preventDefault();
    if (!organizationId || !form.clientOrganizationId || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/workspace/finance/practice-engagements", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId, ...form,
          monthlyFee: form.monthlyFee === "" ? 0 : Number(form.monthlyFee),
          billingDay: Number(form.billingDay || 1),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to create accounting client");
      const alreadyExists = body?.result?.status === "ALREADY_EXISTS";
      setNotice({
        tone: "success",
        text: alreadyExists
          ? (body?.client?.name || "Client") + " already has an active engagement. Nothing was duplicated."
          : (body?.client?.name || "Client") + " was added. Continue in Onboarding to complete entity, engagement letter, signature and billing policy.",
      });
      if (!alreadyExists) {
        setForm(DEFAULT_FORM);
        setEntities([]);
      }
      await onCreated?.(body);
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Unable to create accounting client" });
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#A37849]/25 bg-[#A37849]/[0.06] px-3 text-[9px] font-semibold text-[#76583A]">
        <Plus size={11} /> Add client
      </button>
    );
  }

  const inputClass = "h-9 w-full rounded-xl border border-black/[0.08] bg-white px-3 text-[10px] text-[#403C37] outline-none focus:border-[#A37849]/35";
  const selectedOrganization = organizations.find((row) => row.id === form.clientOrganizationId);

  return (
    <div className="rounded-2xl border border-[#A37849]/20 bg-[#FFFDF9] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold text-[#3E3933]">Add accounting client</div>
          <div className="mt-1 max-w-3xl text-[9px] leading-4 text-[#8B857D]">Select only an organization you already have Platform access to. Finance re-authorizes that client server-side and atomically creates the client profile plus one active engagement.</div>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-[#928C84] hover:bg-black/[0.04]"><X size={13} /></button>
      </div>

      {notice ? (
        <div className={"mt-3 flex items-start gap-2 rounded-xl border p-3 text-[9px] " + (notice.tone === "error" ? "border-red-700/15 bg-red-50 text-red-800" : "border-emerald-700/15 bg-emerald-50 text-emerald-800")}>
          {notice.tone === "error" ? <AlertTriangle size={12} className="mt-0.5" /> : <CheckCircle2 size={12} className="mt-0.5" />}
          <span>{notice.text}</span>
        </div>
      ) : null}

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Client organization" hint="Only accessible active Platform organizations are shown.">
            <select className={inputClass} value={form.clientOrganizationId} onChange={(event) => { patch("clientOrganizationId", event.target.value); loadEntities(event.target.value); }} required>
              <option value="">{loadingOrganizations ? "Loading organizations…" : "Select organization"}</option>
              {candidates.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.organization_type || "organization"}</option>)}
            </select>
          </Field>
          <Field label="Client legal entity" hint={entities.length ? "Recommended now; can remain blank if entity setup belongs in Onboarding." : "No active legal entity found yet; Onboarding will require one before recurring work."}>
            <select className={inputClass} value={form.entityId} onChange={(event) => patch("entityId", event.target.value)} disabled={!form.clientOrganizationId || loadingEntities}>
              <option value="">{loadingEntities ? "Loading entities…" : "Set later in onboarding"}</option>
              {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.display_name || entity.legal_name || entity.code}</option>)}
            </select>
          </Field>
        </div>

        {selectedOrganization ? <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-[9px] text-[#716B63]">Selected client: <span className="font-semibold text-[#403C37]">{selectedOrganization.name}</span></div> : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Service package"><input className={inputClass} value={form.servicePackage} onChange={(e) => patch("servicePackage", e.target.value)} placeholder="Monthly accounting" /></Field>
          <Field label="Monthly fee"><input className={inputClass} type="number" min="0" step="0.01" value={form.monthlyFee} onChange={(e) => patch("monthlyFee", e.target.value)} placeholder="0.00" /></Field>
          <Field label="Billing day"><input className={inputClass} type="number" min="1" max="28" value={form.billingDay} onChange={(e) => patch("billingDay", e.target.value)} /></Field>
          <Field label="Accounting standard"><select className={inputClass} value={form.accountingStandard} onChange={(e) => patch("accountingStandard", e.target.value)}><option value="TFRS">TFRS</option><option value="TFRS_FOR_NPAES">TFRS for NPAEs</option><option value="IFRS">IFRS</option><option value="LOCAL_GAAP">Local GAAP</option></select></Field>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Start date"><input className={inputClass} type="date" value={form.startDate} onChange={(e) => patch("startDate", e.target.value)} /></Field>
          <Field label="Contract start"><input className={inputClass} type="date" value={form.contractStartDate} onChange={(e) => patch("contractStartDate", e.target.value)} /></Field>
          <Field label="Renewal date"><input className={inputClass} type="date" value={form.renewalDate} onChange={(e) => patch("renewalDate", e.target.value)} /></Field>
          <Field label="Year end"><input className={inputClass} type="date" value={form.yearEndDate} onChange={(e) => patch("yearEndDate", e.target.value)} /></Field>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <Toggle label="Bookkeeping" checked={form.bookkeepingEnabled} onChange={(value) => patch("bookkeepingEnabled", value)} />
          <Toggle label="VAT" checked={form.vatEnabled} onChange={(value) => patch("vatEnabled", value)} />
          <Toggle label="Payroll" checked={form.payrollEnabled} onChange={(value) => patch("payrollEnabled", value)} />
          <Toggle label="Tax" checked={form.taxEnabled} onChange={(value) => patch("taxEnabled", value)} />
          <Toggle label="Reporting" checked={form.reportingEnabled} onChange={(value) => patch("reportingEnabled", value)} />
          <Toggle label="Audit" checked={form.auditEnabled} onChange={(value) => patch("auditEnabled", value)} />
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Contact name"><input className={inputClass} value={form.contactName} onChange={(e) => patch("contactName", e.target.value)} /></Field>
          <Field label="Position"><input className={inputClass} value={form.position} onChange={(e) => patch("position", e.target.value)} /></Field>
          <Field label="Email"><input className={inputClass} type="email" value={form.contactEmail} onChange={(e) => patch("contactEmail", e.target.value)} /></Field>
          <Field label="Phone"><input className={inputClass} value={form.contactPhone} onChange={(e) => patch("contactPhone", e.target.value)} /></Field>
          <Field label="WhatsApp"><input className={inputClass} value={form.whatsapp} onChange={(e) => patch("whatsapp", e.target.value)} /></Field>
          <Field label="Tax ID"><input className={inputClass} value={form.taxId} onChange={(e) => patch("taxId", e.target.value)} /></Field>
          <Field label="VAT number"><input className={inputClass} value={form.vatNumber} onChange={(e) => patch("vatNumber", e.target.value)} /></Field>
          <Field label="VAT frequency"><select className={inputClass} value={form.vatFrequency} onChange={(e) => patch("vatFrequency", e.target.value)}><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="ANNUAL">Annual</option></select></Field>
          <Field label="Payroll frequency"><select className={inputClass} value={form.payrollFrequency} onChange={(e) => patch("payrollFrequency", e.target.value)}><option value="MONTHLY">Monthly</option><option value="BIWEEKLY">Biweekly</option><option value="WEEKLY">Weekly</option></select></Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] pt-3">
          <div className="text-[8px] leading-4 text-[#918B83]">Creating this record does not create a new Platform organization and does not send any client communication.</div>
          <button type="submit" disabled={saving || !form.clientOrganizationId} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#5F452D] px-3.5 text-[9px] font-semibold text-white disabled:opacity-40">
            {saving ? <LoaderCircle size={11} className="animate-spin" /> : <Plus size={11} />}
            {saving ? "Creating…" : "Create client & engagement"}
          </button>
        </div>
      </form>
    </div>
  );
}
