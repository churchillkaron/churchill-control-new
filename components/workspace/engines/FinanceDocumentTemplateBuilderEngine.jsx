"use client";

import { useEffect, useMemo, useState } from "react";

const DOCUMENT_TYPES = [
  ["CUSTOMER_INVOICE", "Customer Invoice"],
  ["CUSTOMER_STATEMENT", "Customer Statement"],
  ["VENDOR_STATEMENT", "Vendor Statement"],
  ["PAYMENT_RECEIPT", "Payment Receipt"],
  ["CREDIT_NOTE", "Credit Note"],
  ["DEBIT_NOTE", "Debit Note"],
  ["PURCHASE_ORDER", "Purchase Order"],
  ["REMITTANCE_ADVICE", "Remittance Advice"],
  ["FINANCIAL_REPORT", "Financial Report"],
];

const BASE_DESIGNS = [
  ["MODERN", "Modern"],
  ["CLASSIC", "Classic"],
  ["COMPACT", "Compact"],
  ["MINIMAL", "Minimal"],
];

const DEFAULT_BLOCKS = [
  "header",
  "invoice_info",
  "customer",
  "lines",
  "totals",
  "payment",
  "footer",
];

const EMPTY_VALUES = {
  name: "",
  document_type: "CUSTOMER_INVOICE",
  locale: "en-GB",
  scope: "ORGANIZATION",
  entity_id: "",
  base_design: "MODERN",
  page_size: "A4",
  orientation: "PORTRAIT",
  show_logo: true,
  show_tax_summary: true,
  show_payment_details: true,
  footer_note: "",
  legal_note: "",
  payment_note: "",
};

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] uppercase tracking-[0.24em] text-white/40">
        {label}
      </span>
      {children}
    </label>
  );
}

const INPUT =
  "h-11 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none";

export default function FinanceDocumentTemplateBuilderEngine({
  open = true,
  organizationId,
  entityId,
  row = null,
  onClose,
  onComplete,
}) {
  const editing = Boolean(row?.id);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState({
    ...EMPTY_VALUES,
    entity_id: entityId || "",
  });

  useEffect(() => {
    let active = true;

    async function loadTemplate() {
      if (!editing || !organizationId) return;

      try {
        setLoading(true);
        setError("");
        const response = await fetch(
          `/api/finance/document-templates/${row.id}?organizationId=${encodeURIComponent(organizationId)}`,
          { cache: "no-store" }
        );
        const json = await response.json().catch(() => ({}));
        if (!response.ok || json?.success === false) {
          throw new Error(json?.error || "Unable to load document template");
        }

        const metadata = json.metadata || {};
        const options = metadata.options || {};
        const content = metadata.content || {};

        if (active) {
          setValues({
            ...EMPTY_VALUES,
            name: json.template?.name || "",
            document_type: json.template?.document_type || "CUSTOMER_INVOICE",
            locale: json.template?.locale || "en-GB",
            scope: metadata.scope || "ORGANIZATION",
            entity_id: metadata.entity_id || entityId || "",
            base_design: metadata.base_design || metadata.layout?.base_design || "MODERN",
            page_size: metadata.page?.size || "A4",
            orientation: metadata.page?.orientation || "PORTRAIT",
            show_logo: options.show_logo !== false,
            show_tax_summary: options.show_tax_summary !== false,
            show_payment_details: options.show_payment_details !== false,
            footer_note: content.footer_note || "",
            legal_note: content.legal_note || "",
            payment_note: content.payment_note || "",
          });
        }
      } catch (loadError) {
        if (active) setError(loadError.message || "Unable to load document template");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadTemplate();
    return () => {
      active = false;
    };
  }, [editing, row?.id, organizationId, entityId]);

  const blocks = useMemo(() => {
    return DEFAULT_BLOCKS.filter((block) => {
      if (block === "payment" && !values.show_payment_details) return false;
      return true;
    });
  }, [values.show_payment_details]);

  if (open === false) return null;

  function update(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function save() {
    try {
      setSaving(true);
      setError("");

      if (!values.name.trim()) throw new Error("Template Name required");
      if (values.scope === "ENTITY" && !values.entity_id) {
        throw new Error("Legal Entity required for entity-specific templates");
      }

      const endpoint = editing
        ? `/api/finance/document-templates/${row.id}`
        : "/api/finance/document-templates";
      const response = await fetch(endpoint, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          organization_id: organizationId,
          ...values,
          entity_id: values.scope === "ENTITY" ? values.entity_id : null,
          blocks,
        }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || "Unable to save document template");
      }

      onComplete?.();
      onClose?.();
    } catch (saveError) {
      setError(saveError.message || "Unable to save document template");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
      <div className="grid max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-[30px] border border-white/10 bg-[#090909] shadow-2xl lg:grid-cols-[1fr_0.9fr]">
        <section className="overflow-auto border-b border-white/10 p-6 lg:border-b-0 lg:border-r">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.3em] text-amber-300/70">
                Finance Document Studio
              </div>
              <h2 className="mt-2 text-3xl font-light text-white">
                {editing ? "Edit Document Template" : "Create Document Template"}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-white/45">
                Build a branded, organisation-scoped design. Saving changes returns an active template to Draft for review.
              </p>
            </div>
            <button onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60">
              Close
            </button>
          </div>

          {loading ? (
            <div className="mt-8 text-sm text-white/45">Loading template design...</div>
          ) : (
            <>
              <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label="Template Name">
                  <input className={INPUT} value={values.name} onChange={(event) => update("name", event.target.value)} placeholder="Modern Customer Invoice" />
                </Field>
                <Field label="Document Type">
                  <select className={INPUT} value={values.document_type} onChange={(event) => update("document_type", event.target.value)}>
                    {DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Language / Locale">
                  <select className={INPUT} value={values.locale} onChange={(event) => update("locale", event.target.value)}>
                    <option value="en-GB">English (UK)</option>
                    <option value="en-US">English (US)</option>
                    <option value="th-TH">Thai</option>
                  </select>
                </Field>
                <Field label="Applies To">
                  <select className={INPUT} value={values.scope} onChange={(event) => update("scope", event.target.value)}>
                    <option value="ORGANIZATION">Entire Organisation</option>
                    <option value="ENTITY">Selected Legal Entity</option>
                  </select>
                </Field>
                <Field label="Starting Design">
                  <select className={INPUT} value={values.base_design} onChange={(event) => update("base_design", event.target.value)}>
                    {BASE_DESIGNS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Page Layout">
                  <div className="grid grid-cols-2 gap-3">
                    <select className={INPUT} value={values.page_size} onChange={(event) => update("page_size", event.target.value)}>
                      <option value="A4">A4</option>
                      <option value="LETTER">Letter</option>
                    </select>
                    <select className={INPUT} value={values.orientation} onChange={(event) => update("orientation", event.target.value)}>
                      <option value="PORTRAIT">Portrait</option>
                      <option value="LANDSCAPE">Landscape</option>
                    </select>
                  </div>
                </Field>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
                {[
                  ["show_logo", "Show Logo"],
                  ["show_tax_summary", "Show Tax Summary"],
                  ["show_payment_details", "Show Payment Details"],
                ].map(([name, label]) => (
                  <label key={name} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
                    <input type="checkbox" checked={Boolean(values[name])} onChange={(event) => update(name, event.target.checked)} />
                    {label}
                  </label>
                ))}
              </div>

              <div className="mt-6 grid gap-5">
                <Field label="Payment Instructions">
                  <textarea className="min-h-24 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none" value={values.payment_note} onChange={(event) => update("payment_note", event.target.value)} placeholder="Resolved from organisation payment settings when empty" />
                </Field>
                <Field label="Legal / Compliance Note">
                  <textarea className="min-h-24 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none" value={values.legal_note} onChange={(event) => update("legal_note", event.target.value)} placeholder="Jurisdiction-specific text or disclosure" />
                </Field>
                <Field label="Footer Note">
                  <textarea className="min-h-20 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none" value={values.footer_note} onChange={(event) => update("footer_note", event.target.value)} placeholder="Thank you for your business" />
                </Field>
              </div>

              {error ? <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

              <div className="mt-7 flex justify-end gap-3 border-t border-white/10 pt-5">
                <button onClick={onClose} className="rounded-xl border border-white/10 px-5 py-3 text-sm text-white/60">Cancel</button>
                <button onClick={save} disabled={saving} className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black disabled:opacity-50">
                  {saving ? "Saving..." : editing ? "Save as Draft" : "Create Draft Template"}
                </button>
              </div>
            </>
          )}
        </section>

        <section className="overflow-auto bg-[#050505] p-6">
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/35">Live Preview</div>
          <div className="mt-4 rounded-2xl bg-white p-8 text-black shadow-2xl">
            <div className="flex items-start justify-between border-b pb-6">
              <div>
                {values.show_logo ? <div className="mb-3 h-10 w-28 rounded bg-black/10" /> : null}
                <div className="text-2xl font-semibold">Organisation Name</div>
                <div className="mt-1 text-xs text-black/55">Legal entity and registration details</div>
              </div>
              <div className="text-right text-3xl font-bold">{DOCUMENT_TYPES.find(([value]) => value === values.document_type)?.[1]?.toUpperCase()}</div>
            </div>
            <div className="mt-7 grid grid-cols-2 gap-6 text-sm">
              <div><div className="text-black/45">Bill To</div><div className="mt-2 text-lg font-semibold">Customer Name</div><div className="text-black/55">Customer address and tax details</div></div>
              <div className="text-right text-black/60"><div>Document No: SAMPLE-0001</div><div>Date: 28 Jul 2026</div><div>Due: 27 Aug 2026</div></div>
            </div>
            <table className="mt-8 w-full text-sm"><thead><tr className="border-b text-left"><th className="py-3">Description</th><th>Qty</th><th>Price</th><th className="text-right">Total</th></tr></thead><tbody><tr className="border-b"><td className="py-4">Sample service</td><td>1</td><td>1,000.00</td><td className="text-right">1,000.00</td></tr></tbody></table>
            <div className="mt-6 text-right">{values.show_tax_summary ? <div className="text-sm">Tax: resolved from transaction</div> : null}<div className="mt-2 text-2xl font-bold">Total: 1,000.00</div></div>
            {values.show_payment_details ? <div className="mt-8 border-t pt-5 text-sm">{values.payment_note || "Payment instructions from organisation settings"}</div> : null}
            {values.legal_note ? <div className="mt-4 text-xs text-black/55">{values.legal_note}</div> : null}
            <div className="mt-8 border-t pt-4 text-xs text-black/45">{values.footer_note || "Organisation contact and legal footer"}</div>
          </div>
        </section>
      </div>
    </div>
  );
}
