import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CLOSED = new Set(["PAID", "VOID", "CANCELLED", "CANCELED", "CLOSED", "REVERSED"]);

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function amountFrom(row = {}) {
  return Math.max(
    0,
    number(row.outstanding_amount ?? row.outstanding_balance ?? row.amount_due ?? row.total_amount),
  );
}

function dateValue(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function moneyKey(value) {
  return number(value).toFixed(2);
}
function findingBase({ organizationId, entityId, type, source, sourceIds, title, explanation, impact, currencyCode, confidence, evidence, proposedAction }) {
  return {
    contract: "AVANTIQO_OUTCOME_FINDING_V1",
    organization_id: organizationId,
    entity_id: entityId || null,
    finding_type: type,
    source,
    source_ids: sourceIds,
    title,
    explanation,
    impact: {
      kind: "recoverable_or_avoidable_value",
      amount: Number(impact.toFixed(2)),
      currency_code: currencyCode || null,
    },
    confidence,
    evidence,
    proposed_intervention: {
      ...proposedAction,
      execution_allowed: false,
      authority_effect: "NONE",
      reason: "First Outcome Engine slice is evidence and proposal only. Execution must resolve through an existing governed capability.",
    },
  };
}

async function overdueReceivables({ organizationId, entityId }) {
  let query = supabaseAdmin.from("customer_invoices").select("*").eq("organization_id", organizationId);
  if (entityId) query = query.eq("entity_id", entityId);
  const { data, error } = await query;
  if (error) throw error;
  const now = Date.now();
  return (data || []).flatMap((invoice) => {
    const due = dateValue(invoice.due_date);
    const status = text(invoice.status).toUpperCase();
    const outstanding = amountFrom(invoice);
    if (!due || due.getTime() >= now || CLOSED.has(status) || outstanding <= 0) return [];

    const overdueDays = Math.max(1, Math.floor((now - due.getTime()) / 86400000));
    return [findingBase({
      organizationId,
      entityId: invoice.entity_id || entityId,
      type: "OVERDUE_RECEIVABLE",
      source: "customer_invoices",
      sourceIds: [invoice.id],
      title: `Overdue customer invoice ${invoice.invoice_number || invoice.id}`,
      explanation: `${outstanding.toFixed(2)} remains outstanding ${overdueDays} day${overdueDays === 1 ? "" : "s"} after the recorded due date.`,
      impact: outstanding,
      currencyCode: invoice.currency_code,
      confidence: { level: "high", score: 0.98, basis: "Recorded invoice due date, status and outstanding amount." },
      evidence: { invoice_id: invoice.id, invoice_number: invoice.invoice_number || null, due_date: invoice.due_date, status: invoice.status, outstanding_amount: outstanding, overdue_days: overdueDays },
      proposedAction: { kind: "COLLECTION_REVIEW", target_route: "/finance/customer-invoices", capability_hint: "finance.customer_invoices.read" },
    })];
  });
}

async function duplicateVendorInvoiceCandidates({ organizationId, entityId }) {
  let query = supabaseAdmin.from("vendor_invoices").select("*").eq("organization_id", organizationId);
  if (entityId) query = query.eq("entity_id", entityId);
  const { data, error } = await query;
  if (error) throw error;
  const groups = new Map();
  for (const invoice of data || []) {
    const status = text(invoice.status).toUpperCase();
    if (CLOSED.has(status) && status !== "PAID") continue;
    const supplierId = text(invoice.vendor_party_id || invoice.supplier_party_id);
    const invoiceNumber = text(invoice.invoice_number).toUpperCase();
    const total = number(invoice.total_amount);
    if (!supplierId || !invoiceNumber || total <= 0) continue;
    const key = [supplierId, invoiceNumber, moneyKey(total), text(invoice.currency_code).toUpperCase()].join("|");
    groups.set(key, [...(groups.get(key) || []), invoice]);
  }

  return [...groups.values()].filter((rows) => rows.length > 1).map((rows) => {
    const first = rows[0];
    const avoidable = number(first.total_amount) * (rows.length - 1);
    return findingBase({
      organizationId,
      entityId: first.entity_id || entityId,
      type: "POSSIBLE_DUPLICATE_VENDOR_INVOICE",
      source: "vendor_invoices",
      sourceIds: rows.map((row) => row.id),
      title: `Possible duplicate supplier invoice ${first.invoice_number}`,
      explanation: `${rows.length} supplier invoices share the same supplier, invoice number, amount and currency. This is a review candidate, not a duplicate conclusion.`,
      impact: avoidable,
      currencyCode: first.currency_code,
      confidence: { level: "medium", score: 0.82, basis: "Exact deterministic identity/amount match; human or governed matching review is still required." },
      evidence: { invoice_number: first.invoice_number, supplier_party_id: first.vendor_party_id || first.supplier_party_id, total_amount: number(first.total_amount), currency_code: first.currency_code || null, candidate_count: rows.length },
      proposedAction: { kind: "DUPLICATE_PAYMENT_REVIEW", target_route: "/finance/invoice-matching", capability_hint: "finance.vendor_bills.read" },
    });
  });
}

export const AvantiqoOutcomeEngineRuntime = {
  async inspectOrganization({ organizationId, entityId = null, allowReceivables = false, allowPayables = false }) {
    if (!text(organizationId)) throw new Error("organizationId required");
    const jobs = [];
    if (allowReceivables) jobs.push(overdueReceivables({ organizationId, entityId }));
    if (allowPayables) jobs.push(duplicateVendorInvoiceCandidates({ organizationId, entityId }));
    const settled = await Promise.allSettled(jobs);
    const findings = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    findings.sort((a, b) => number(b?.impact?.amount) - number(a?.impact?.amount));
    const valueByCurrency = findings.reduce((totals, finding) => {
      const currency = text(finding?.impact?.currency_code).toUpperCase() || "UNSPECIFIED";
      totals[currency] = Number((number(totals[currency]) + number(finding?.impact?.amount)).toFixed(2));
      return totals;
    }, {});
    const currencies = Object.keys(valueByCurrency);
    return {
      contract: "AVANTIQO_OUTCOME_ENGINE_V1",
      organization_id: organizationId,
      entity_id: entityId,
      generated_at: new Date().toISOString(),
      execution_mode: "PROPOSAL_ONLY",
      summary: {
        finding_count: findings.length,
        measurable_value: currencies.length === 1 ? valueByCurrency[currencies[0]] : null,
        measurable_value_currency: currencies.length === 1 ? currencies[0] : null,
        value_by_currency: valueByCurrency,
        detector_count: jobs.length,
        detector_failures: settled.filter((result) => result.status === "rejected").length,
      },
      findings,
    };
  },
};

export default AvantiqoOutcomeEngineRuntime;
