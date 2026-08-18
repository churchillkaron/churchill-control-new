import { createCustomerInvoiceCommand } from "@/lib/finance/accounts-receivable/runtime/AccountsReceivableApplicationService";
import { TaxCodeRepository } from "@/lib/finance/tax-codes/repositories/taxCodeRepository";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { updateServiceOccurrence } from "../repositories/ServicePlanRepository";
import { getCompletedServiceReport } from "./ServiceCompletionReportRuntime";

function addDays(dateValue, days) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) throw new Error("Service completion date is invalid.");
  date.setUTCDate(date.getUTCDate() + Math.max(0, Number(days) || 0));
  return date.toISOString().slice(0, 10);
}

function effectiveOn(rule, date) {
  if (!rule) return false;
  if (rule.is_active === false) return false;
  const value = String(date || "").slice(0, 10);
  if (rule.effective_from && String(rule.effective_from).slice(0, 10) > value) return false;
  if (rule.effective_to && String(rule.effective_to).slice(0, 10) < value) return false;
  return true;
}

async function resolveTax({ report }) {
  const taxCodeId = report.billing?.tax_code_id || null;
  if (!taxCodeId) {
    return {
      tax_amount: 0,
      tax_code_id: null,
      tax_code: null,
      tax_rate: 0,
    };
  }

  const rule = await TaxCodeRepository.get({
    organizationId: report.organization_id,
    taxCodeId,
  });

  const invoiceDate = String(report.service.completed_at || new Date().toISOString()).slice(0, 10);
  if (!rule || !effectiveOn(rule, invoiceDate)) {
    const error = new Error("Configured service tax rule is missing or not effective on the service completion date.");
    error.status = 409;
    throw error;
  }

  const rate = Number(rule.tax_rate);
  if (!Number.isFinite(rate) || rate < 0) {
    const error = new Error("Configured service tax rate is invalid.");
    error.status = 409;
    throw error;
  }

  return {
    tax_amount: Number((Number(report.billing.amount || 0) * rate).toFixed(4)),
    tax_code_id: rule.id,
    tax_code: rule.tax_code || null,
    tax_rate: rate,
  };
}

async function loadOccurrenceAttributes({ organizationId, occurrenceId }) {
  const result = await supabaseAdmin
    .from("service_plan_occurrences")
    .select("attributes")
    .eq("organization_id", organizationId)
    .eq("id", occurrenceId)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) {
    const error = new Error("Service occurrence not found during Finance handoff.");
    error.status = 404;
    throw error;
  }
  return result.data.attributes || {};
}

export async function createInvoiceFromCompletedService({
  organizationId,
  occurrenceId,
  actorId = null,
}) {
  const report = await getCompletedServiceReport({ organizationId, occurrenceId });
  const billing = report.billing || {};

  if (billing.invoice?.invoice_id) {
    return {
      success: true,
      idempotent_replay: true,
      report,
      invoice: billing.invoice,
    };
  }

  if (billing.mode !== "per_visit") {
    const error = new Error("Only per-visit service billing creates an invoice from service completion.");
    error.status = 409;
    throw error;
  }

  if (!billing.eligible) {
    const error = new Error(`Service is not ready for billing: ${billing.blocked_reason || "billing-not-ready"}.`);
    error.status = 409;
    throw error;
  }

  if (!report.entity_id) {
    const error = new Error("Completed service requires entity_id before Finance handoff.");
    error.status = 409;
    throw error;
  }

  const completionDate = String(report.service.completed_at || new Date().toISOString()).slice(0, 10);
  const dueDate = addDays(completionDate, billing.due_days || 0);
  const tax = await resolveTax({ report });
  const idempotencyKey = `service-occurrence:${report.occurrence_id}:customer-invoice`;

  const invoice = await createCustomerInvoiceCommand({
    organization_id: report.organization_id,
    entity_id: report.entity_id,
    party_id: report.customer.party_id,
    invoice_date: completionDate,
    due_date: dueDate,
    currency_code: billing.currency_code,
    lines: [
      {
        description: report.service.name || "Completed service",
        quantity: 1,
        unit_price: Number(billing.amount || 0),
        tax_amount: tax.tax_amount,
      },
    ],
    tax_amount: tax.tax_amount,
    notes: `Completed service ${report.occurrence_id}`,
    created_by: actorId,
    idempotency_key: idempotencyKey,
    source_document_type: "SERVICE_PLAN_OCCURRENCE",
    source_document_id: report.occurrence_id,
  });

  const invoiceProjection = {
    invoice_id: invoice.invoice_id || invoice.id || null,
    invoice_number: invoice.invoice_number || invoice.number || null,
    created_at: new Date().toISOString(),
    idempotency_key: idempotencyKey,
    tax_code_id: tax.tax_code_id,
    tax_code: tax.tax_code,
    tax_rate: tax.tax_rate,
    tax_amount: tax.tax_amount,
    currency_code: billing.currency_code,
    amount: Number(billing.amount || 0),
  };

  const attributes = await loadOccurrenceAttributes({
    organizationId: report.organization_id,
    occurrenceId: report.occurrence_id,
  });
  const completion = attributes.completion || {};

  await updateServiceOccurrence({
    organizationId: report.organization_id,
    occurrenceId: report.occurrence_id,
    values: {
      attributes: {
        ...attributes,
        completion: {
          ...completion,
          billing_invoice: invoiceProjection,
        },
      },
    },
  });

  return {
    success: true,
    idempotent_replay: false,
    invoice: invoiceProjection,
    finance_result: invoice,
  };
}

export default createInvoiceFromCompletedService;
