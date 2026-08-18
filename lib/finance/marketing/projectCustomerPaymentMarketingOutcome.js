import { MarketingBusinessOutcomeProjectionRuntime } from "@/lib/marketing/intelligence/MarketingBusinessOutcomeProjectionRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function allocationsFromInput(input = {}) {
  if (Array.isArray(input.allocations) && input.allocations.length) {
    return input.allocations
      .map((allocation) => ({
        invoice_id: text(allocation?.customer_invoice_id || allocation?.customerInvoiceId),
        amount: number(allocation?.amount, 0),
      }))
      .filter((allocation) => allocation.invoice_id && allocation.amount > 0);
  }

  const invoiceId = text(input.customer_invoice_id || input.customerInvoiceId);
  const amount = number(input.amount, 0);
  return invoiceId && amount > 0
    ? [{ invoice_id: invoiceId, amount }]
    : [];
}

export async function projectCustomerPaymentMarketingOutcome({ input = {}, result = {} }) {
  const organizationId = text(input.organization_id || input.organizationId);
  const paymentId = text(result.payment_id || result.id || result.payment?.id);
  const currency = text(input.currency_code || input.currencyCode);
  const partyId = text(input.party_id || input.partyId);
  const allocations = allocationsFromInput(input);

  if (!organizationId || !paymentId) {
    return {
      projected: false,
      reason: "CUSTOMER_PAYMENT_ATTRIBUTION_CONTEXT_INCOMPLETE",
      outcomes: [],
    };
  }

  if (!allocations.length) {
    return {
      projected: false,
      reason: "CUSTOMER_PAYMENT_HAS_NO_INVOICE_ALLOCATION",
      outcomes: [],
    };
  }

  const outcomes = [];

  for (const allocation of allocations) {
    try {
      const outcome = await MarketingBusinessOutcomeProjectionRuntime.project({
        organizationId,
        outcomeType: "PAYMENT",
        qualified: true,
        quantity: 1,
        revenue: allocation.amount,
        profit: allocation.amount,
        currency,
        partyId: partyId || null,
        sourceDocumentType: "CUSTOMER_PAYMENT",
        sourceDocumentId: paymentId,
        invoiceId: allocation.invoice_id,
        attribution_parent: {
          invoice_id: allocation.invoice_id,
        },
        idempotencyKey: [
          "marketing-payment",
          organizationId,
          paymentId,
          allocation.invoice_id,
        ].join(":"),
        metadata: {
          finance_projection: true,
          finance_stage: "CUSTOMER_PAYMENT_ALLOCATED",
          economic_component: "REALIZED_REVENUE",
          allocated_invoice_id: allocation.invoice_id,
          allocated_amount: allocation.amount,
        },
      });

      outcomes.push({
        invoice_id: allocation.invoice_id,
        amount: allocation.amount,
        ...outcome,
      });
    } catch (error) {
      console.error("FINANCE_MARKETING_PAYMENT_PROJECTION_FAILED", {
        paymentId,
        invoiceId: allocation.invoice_id,
        message: error?.message || String(error),
      });
      outcomes.push({
        invoice_id: allocation.invoice_id,
        amount: allocation.amount,
        projected: false,
        reason: "MARKETING_OUTCOME_PROJECTION_FAILED",
        error: error?.message || String(error),
      });
    }
  }

  return {
    projected: outcomes.some((outcome) => outcome.projected === true),
    outcomes,
  };
}

export default projectCustomerPaymentMarketingOutcome;
