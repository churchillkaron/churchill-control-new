import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PAGE_SIZE = 1000;
const MAX_EVIDENCE_ROWS = 250000;
const MONEY_FIELDS = ["output_tax", "input_tax", "tax_payable", "tax_refund"];
const COUNT_FIELDS = ["output_document_count", "customer_credit_note_count", "input_document_count"];

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundMoney(value) {
  return Math.round((numeric(value) + Number.EPSILON) * 100) / 100;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

async function fetchPaged(makeQuery, label) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await makeQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const page = data || [];
    rows.push(...page);
    if (rows.length > MAX_EVIDENCE_ROWS) {
      throw new Error(`${label} exceeds the ${MAX_EVIDENCE_ROWS.toLocaleString("en-US")} row amendment evidence limit`);
    }
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function chunks(values, size = 250) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function fetchByIds({ table, column, ids, apply, label }) {
  if (!ids.length) return [];
  const rows = [];
  for (const group of chunks(ids)) {
    const page = await fetchPaged(() => {
      let query = supabaseAdmin.from(table).select("*").in(column, group);
      if (apply) query = apply(query);
      return query;
    }, label);
    rows.push(...page);
    if (rows.length > MAX_EVIDENCE_ROWS) {
      throw new Error(`${label} exceeds the ${MAX_EVIDENCE_ROWS.toLocaleString("en-US")} row amendment evidence limit`);
    }
  }
  return rows;
}

function stableRows(rows) {
  return (rows || []).map(canonical).sort();
}

export function financeVatSnapshotFromReturn(vatReturn) {
  return {
    output_document_count: numeric(vatReturn?.calculation?.output_document_count, 0),
    customer_credit_note_count: numeric(vatReturn?.calculation?.customer_credit_note_count, 0),
    input_document_count: numeric(vatReturn?.calculation?.input_document_count, 0),
    output_tax: roundMoney(vatReturn?.output_tax),
    input_tax: roundMoney(vatReturn?.input_tax),
    tax_payable: roundMoney(vatReturn?.tax_payable),
    tax_refund: roundMoney(vatReturn?.tax_refund),
    currency_code: upper(vatReturn?.currency_code || "THB"),
  };
}

export function financeVatSnapshotFromPreflight(preflight) {
  const current = preflight?.current || {};
  return {
    output_document_count: numeric(current.output_document_count, 0),
    customer_credit_note_count: numeric(current.customer_credit_note_count, 0),
    input_document_count: numeric(current.input_document_count, 0),
    output_tax: roundMoney(current.output_tax),
    input_tax: roundMoney(current.input_tax),
    tax_payable: roundMoney(current.tax_payable),
    tax_refund: roundMoney(current.tax_refund),
    currency_code: upper(current.currency_code || "THB"),
  };
}

export function financeVatSnapshotDelta(previous, current) {
  const delta = {};
  for (const field of COUNT_FIELDS) delta[field] = numeric(current?.[field]) - numeric(previous?.[field]);
  for (const field of MONEY_FIELDS) delta[field] = roundMoney(numeric(current?.[field]) - numeric(previous?.[field]));
  delta.currency_code = upper(current?.currency_code || previous?.currency_code || "THB");
  return delta;
}

export function financeVatSnapshotsMatch(left, right) {
  if (upper(left?.currency_code) !== upper(right?.currency_code)) return false;
  for (const field of COUNT_FIELDS) {
    if (numeric(left?.[field], -1) !== numeric(right?.[field], -2)) return false;
  }
  for (const field of MONEY_FIELDS) {
    if (Math.abs(numeric(left?.[field], Number.NaN) - numeric(right?.[field], Number.NaN)) > 0.005) return false;
  }
  return true;
}

function originalFilingSnapshot(vatReturn) {
  return {
    version_label: "Original",
    filed_at: vatReturn?.submitted_at || null,
    submission_reference: vatReturn?.submission_reference || null,
    values: financeVatSnapshotFromReturn(vatReturn),
  };
}

export function normalizeFinanceVatAmendmentChain(vatReturn) {
  const raw = vatReturn?.metadata?.tax_amendments;
  const history = Array.isArray(raw?.history) ? raw.history : [];
  const abandoned = Array.isArray(raw?.abandoned) ? raw.abandoned : [];
  return {
    version: 1,
    original: raw?.original && typeof raw.original === "object" ? raw.original : originalFilingSnapshot(vatReturn),
    active: raw?.active && typeof raw.active === "object" ? raw.active : null,
    history,
    abandoned,
  };
}

export function latestFinanceVatFiledSnapshot(vatReturn, chain = normalizeFinanceVatAmendmentChain(vatReturn)) {
  const latest = chain.history[chain.history.length - 1];
  return latest?.effective_values || chain.original?.values || financeVatSnapshotFromReturn(vatReturn);
}

export function amendmentLabel(sequence) {
  return `Amendment ${String(sequence).padStart(2, "0")}`;
}

export function mergeFinanceVatAmendmentMetadata(vatReturn, chain) {
  return {
    ...(vatReturn?.metadata && typeof vatReturn.metadata === "object" ? vatReturn.metadata : {}),
    tax_amendments: chain,
  };
}

export async function buildFinanceVatAmendmentEvidenceSignature({ organizationId, entityId, vatReturn }) {
  const periodStart = vatReturn?.period_start;
  const periodEnd = vatReturn?.period_end;
  const jurisdiction = upper(vatReturn?.jurisdiction_code);
  if (!organizationId || !entityId || !periodStart || !periodEnd || !jurisdiction) {
    throw new Error("Amendment evidence scope is incomplete");
  }

  const [customerInvoices, vendorInvoices, taxRules] = await Promise.all([
    fetchPaged(
      () => supabaseAdmin.from("customer_invoices").select("*")
        .eq("organization_id", organizationId)
        .eq("entity_id", entityId)
        .gte("invoice_date", periodStart)
        .lte("invoice_date", periodEnd)
        .order("id", { ascending: true }),
      "Customer amendment evidence"
    ),
    fetchPaged(
      () => supabaseAdmin.from("vendor_invoices").select("*")
        .eq("organization_id", organizationId)
        .eq("entity_id", entityId)
        .gte("invoice_date", periodStart)
        .lte("invoice_date", periodEnd)
        .order("id", { ascending: true }),
      "Vendor amendment evidence"
    ),
    fetchPaged(
      () => supabaseAdmin.from("tax_rules").select("*")
        .or(`organization_id.eq.${organizationId},organization_id.is.null`)
        .ilike("tax_type", "VAT")
        .ilike("tax_regime", jurisdiction)
        .order("id", { ascending: true }),
      "Tax rule amendment evidence"
    ),
  ]);

  const customerIds = customerInvoices.map(row => row.id).filter(Boolean);
  const vendorIds = vendorInvoices.map(row => row.id).filter(Boolean);
  const [customerLines, journalEntries, vendorLines] = await Promise.all([
    fetchByIds({
      table: "customer_invoice_lines",
      column: "customer_invoice_id",
      ids: customerIds,
      apply: query => query.eq("organization_id", organizationId).eq("entity_id", entityId),
      label: "Customer VAT line amendment evidence",
    }),
    fetchByIds({
      table: "journal_entries",
      column: "source_document_id",
      ids: customerIds,
      apply: query => query.eq("organization_id", organizationId).eq("entity_id", entityId),
      label: "Customer posting amendment evidence",
    }),
    fetchByIds({
      table: "vendor_invoice_lines",
      column: "vendor_invoice_id",
      ids: vendorIds,
      apply: query => query.eq("organization_id", organizationId).eq("entity_id", entityId),
      label: "Vendor VAT line amendment evidence",
    }),
  ]);

  const payload = {
    scope: {
      organization_id: organizationId,
      entity_id: entityId,
      jurisdiction_code: jurisdiction,
      period_start: periodStart,
      period_end: periodEnd,
    },
    customer_invoices: stableRows(customerInvoices),
    customer_invoice_lines: stableRows(customerLines),
    journal_entries: stableRows(journalEntries),
    vendor_invoices: stableRows(vendorInvoices),
    vendor_invoice_lines: stableRows(vendorLines),
    tax_rules: stableRows(taxRules),
  };

  return {
    algorithm: "SHA256",
    digest: createHash("sha256").update(canonical(payload)).digest("hex"),
    population: {
      customer_invoices: customerInvoices.length,
      customer_invoice_lines: customerLines.length,
      journal_entries: journalEntries.length,
      vendor_invoices: vendorInvoices.length,
      vendor_invoice_lines: vendorLines.length,
      tax_rules: taxRules.length,
    },
  };
}
