import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

import {
  emitFinanceBillingEvent,
} from "@/lib/platform/contracts/finance/FinanceBillingContract";
import {
  resolveFinanceExchangeRate,
} from "@/lib/finance/currencies/FinanceExchangeRateResolver";

import {
  UsageRuntime,
} from "../../usage/UsageRuntime";

import * as BillingRepository
from "../repositories/BillingRepository";

function invoiceNumber() {
  return (
    "AVQ-SVC-" +
    Date.now() +
    "-" +
    crypto.randomUUID()
      .slice(0, 8)
      .toUpperCase()
  );
}

function dueDate(days = 7) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function requiredCurrency(usage = {}) {
  const currency = String(usage.currency || "").trim().toUpperCase();
  if (!currency) {
    throw new Error("Service usage currency required for billing");
  }
  return currency;
}

function postingDate(usage = {}) {
  const candidate = new Date(usage.created_at || "");
  if (Number.isNaN(candidate.getTime())) {
    throw new Error("Service usage created_at required for Finance posting");
  }
  return candidate.toISOString().slice(0, 10);
}

async function organizationDetails(organization_id) {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id,name")
    .eq("id", organization_id)
    .single();

  if (error) throw error;
  return data;
}

async function resolveInvoice({ usage }) {
  const currency = requiredCurrency(usage);
  const existing = await BillingRepository.findUsageInvoice({
    organization_id:
      usage.bill_to_organization_id || usage.organization_id,
    currency,
  });

  if (existing) return existing;

  const organization = await organizationDetails(
    usage.bill_to_organization_id || usage.organization_id,
  );

  return BillingRepository.createInvoice({
    organization_id: usage.organization_id,
    bill_to_organization_id:
      usage.bill_to_organization_id || usage.organization_id,
    party_id: usage.party_id || null,
    entity_id: usage.entity_id || null,
    company: organization?.name || "Organization",
    email: null,
    invoice_number: invoiceNumber(),
    invoice_type: "SERVICE_USAGE",
    source: "SERVICE_USAGE",
    currency,
    amount: 0,
    subtotal: 0,
    tax_amount: 0,
    total_amount: 0,
    status: "draft",
    due_date: dueDate(7),
    metadata: {
      billing_source: "SERVICE_RUNTIME",
    },
  });
}

async function financeEventPayload({ usage, invoice }) {
  const currency = requiredCurrency(usage);
  const date = postingDate(usage);
  const fx = await resolveFinanceExchangeRate({
    organizationId: usage.organization_id,
    entityId: usage.entity_id,
    transactionCurrency: currency,
    effectiveDate: date,
  });

  return {
    organization_id: usage.organization_id,
    entity_id: usage.entity_id,
    party_id: usage.party_id || null,
    source_module: "SERVICE",
    source_id: usage.id,
    usage_id: usage.id,
    billing_invoice_id: invoice.id,
    posting_date: date,
    document_date: date,
    amount: Number(usage.customer_price || 0),
    tax_amount: 0,
    supplier_cost: Number(usage.supplier_cost || 0),
    currency,
    currency_code: currency,
    exchange_rate: fx.exchange_rate,
    exchange_rate_source: fx.source,
    exchange_rate_id: fx.rate_id || null,
    functional_currency: fx.functional_currency,
    description: `${usage.capability} service usage`,
  };
}

async function processUsage({ usage_id }) {
  const usage = await UsageRuntime.get(usage_id);

  if (!usage) throw new Error("Usage record not found");
  if (usage.status !== "SUCCESS") {
    throw new Error("Only successful usage can be billed");
  }

  if (usage.invoice_status === "INVOICED" && usage.invoice_id) {
    return {
      invoice: await BillingRepository.getInvoice(usage.invoice_id),
      usage,
      already_invoiced: true,
    };
  }

  const existingLine = await BillingRepository.getLineByUsage(usage.id);
  if (existingLine) {
    const updatedUsage = await UsageRuntime.markInvoiced({
      usage_id: usage.id,
      invoice_id: existingLine.invoice_id,
      billing_invoice_line_id: existingLine.id,
    });

    return {
      invoice: await BillingRepository.getInvoice(existingLine.invoice_id),
      line: existingLine,
      usage: updatedUsage,
      already_invoiced: true,
    };
  }

  const currency = requiredCurrency(usage);
  const invoice = await resolveInvoice({ usage });
  const line = await BillingRepository.createLine({
    organization_id: usage.organization_id,
    bill_to_organization_id:
      usage.bill_to_organization_id || usage.organization_id,
    entity_id: usage.entity_id || null,
    party_id: usage.party_id || null,
    invoice_id: invoice.id,
    usage_id: usage.id,
    service_id: usage.capability,
    provider_id: usage.provider,
    description: `${usage.capability} via ${usage.provider}`,
    quantity: Number(usage.quantity || 1),
    unit: usage.unit || "request",
    unit_price: Number(usage.customer_price || 0),
    supplier_cost: Number(usage.supplier_cost || 0),
    platform_markup: Number(usage.platform_markup || 0),
    line_total: Number(usage.customer_price || 0),
    currency,
    metadata: usage.metadata || {},
  });

  const totals = await BillingRepository.invoiceTotals(invoice.id);
  const updatedInvoice = await BillingRepository.updateInvoice(
    invoice.id,
    {
      amount: totals.amount,
      subtotal: totals.amount,
      tax_amount: 0,
      total_amount: totals.amount,
      status: "issued",
      metadata: {
        ...(invoice.metadata || {}),
        supplier_cost: totals.supplier_cost,
      },
    },
  );

  const updatedUsage = await UsageRuntime.markInvoiced({
    usage_id: usage.id,
    invoice_id: updatedInvoice.id,
    billing_invoice_line_id: line.id,
  });

  if (usage.entity_id) {
    await emitFinanceBillingEvent({
      type: "SERVICE_USAGE_BILLED",
      payload: await financeEventPayload({
        usage,
        invoice: updatedInvoice,
      }),
    });
  }

  return {
    invoice: updatedInvoice,
    line,
    usage: updatedUsage,
    already_invoiced: false,
  };
}

async function billUsage({ usage_id }) {
  if (!usage_id) throw new Error("usage_id required");

  return {
    queued: true,
    usage_id,
    invoice: null,
    line: null,
    usage: null,
  };
}

export const BillingRuntime = {
  billUsage,
  processUsage,
};
