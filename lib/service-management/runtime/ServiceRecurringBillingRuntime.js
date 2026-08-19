import { createCustomerInvoiceCommand } from "@/lib/finance/accounts-receivable/runtime/AccountsReceivableApplicationService";
import {
  getOrCreateServiceBillingCycle,
  updateServiceBillingCycle,
  updateServicePlanState,
} from "../repositories/ServicePlanRepository";
import {
  getNextServiceOccurrence,
  serviceOccurrenceWithinContract,
} from "../scheduling/ServiceRecurrence";
import { resolveServiceBillingTax } from "./ServiceBillingTaxRuntime";

function addDays(dateValue, days) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    const error = new Error("Recurring service billing date is invalid.");
    error.status = 409;
    throw error;
  }
  date.setUTCDate(date.getUTCDate() + Math.max(0, Number(days) || 0));
  return date.toISOString().slice(0, 10);
}

function billingTerms(plan = {}) {
  const delivery = plan.attributes?.service_delivery || {};
  const billing = delivery.billing || {};
  const runtime = delivery.billing_runtime || null;
  const recurrence = billing.recurrence || plan.recurrence || {};
  const nextBillingAt = runtime
    ? runtime.next_billing_at || null
    : billing.first_billing_at || plan.contract_start || plan.first_service_at || null;

  return {
    delivery,
    billing,
    runtime,
    recurrence,
    nextBillingAt,
  };
}

function validateRecurringPlan(plan, terms) {
  if (!plan?.id || !plan.organization_id) {
    const error = new Error("Recurring service billing requires a persisted service plan.");
    error.status = 400;
    throw error;
  }
  if (String(terms.billing.mode || "").toLowerCase() !== "recurring") {
    const error = new Error("Service plan is not configured for recurring billing.");
    error.status = 409;
    throw error;
  }
  if (!plan.entity_id) {
    const error = new Error("Recurring service billing requires entity_id before Finance handoff.");
    error.status = 409;
    throw error;
  }
  if (!plan.customer_party_id) {
    const error = new Error("Recurring service billing requires customer_party_id.");
    error.status = 409;
    throw error;
  }
  const amount = Number(terms.billing.amount);
  const currencyCode = String(terms.billing.currency_code || "").trim().toUpperCase();
  if (!Number.isFinite(amount) || amount < 0 || !currencyCode) {
    const error = new Error("Recurring service billing terms are incomplete.");
    error.status = 409;
    throw error;
  }
  if (!terms.nextBillingAt) {
    const error = new Error("Recurring service billing has no next billing date.");
    error.status = 409;
    throw error;
  }

  return { amount, currencyCode };
}

async function persistBillingRuntime({
  plan,
  delivery,
  runtime,
  cycleAt,
  invoice = null,
  errorMessage = null,
  actorId = null,
}) {
  const nextBillingAt = getNextServiceOccurrence(
    cycleAt,
    delivery.billing?.recurrence || plan.recurrence || {},
  );
  const withinContract = serviceOccurrenceWithinContract(nextBillingAt, plan.contract_end);
  const now = new Date().toISOString();
  const nextRuntime = {
    schema_version: 1,
    status: withinContract ? "active" : "completed",
    next_billing_at: withinContract ? nextBillingAt : null,
    last_billing_at: invoice ? cycleAt : runtime?.last_billing_at || null,
    last_attempt_at: now,
    last_error: errorMessage,
    last_invoice: invoice || runtime?.last_invoice || null,
  };

  const updated = await updateServicePlanState({
    organizationId: plan.organization_id,
    planId: plan.id,
    actorId,
    values: {
      attributes: {
        ...(plan.attributes || {}),
        service_delivery: {
          ...delivery,
          billing_runtime: nextRuntime,
        },
      },
    },
  });

  return {
    plan: updated,
    billing_runtime: nextRuntime,
  };
}

async function persistBillingError({
  plan,
  delivery,
  runtime,
  errorMessage,
  actorId = null,
}) {
  const nextRuntime = {
    schema_version: 1,
    status: runtime?.status || "active",
    next_billing_at: runtime?.next_billing_at
      || delivery.billing?.first_billing_at
      || plan.contract_start
      || plan.first_service_at
      || null,
    last_billing_at: runtime?.last_billing_at || null,
    last_attempt_at: new Date().toISOString(),
    last_error: errorMessage,
    last_invoice: runtime?.last_invoice || null,
  };

  await updateServicePlanState({
    organizationId: plan.organization_id,
    planId: plan.id,
    actorId,
    values: {
      attributes: {
        ...(plan.attributes || {}),
        service_delivery: {
          ...delivery,
          billing_runtime: nextRuntime,
        },
      },
    },
  });

  return nextRuntime;
}

export async function processRecurringServiceBillingPlan({
  plan,
  actorId = null,
  dueBefore = new Date().toISOString(),
}) {
  const terms = billingTerms(plan);
  const { amount, currencyCode } = validateRecurringPlan(plan, terms);
  const cycleAt = new Date(terms.nextBillingAt).toISOString();

  if (new Date(cycleAt).getTime() > new Date(dueBefore).getTime()) {
    return {
      success: true,
      processed: false,
      reason: "not-due",
      service_plan_id: plan.id,
      next_billing_at: cycleAt,
    };
  }

  if (!serviceOccurrenceWithinContract(cycleAt, plan.contract_end)) {
    const runtimeResult = await updateServicePlanState({
      organizationId: plan.organization_id,
      planId: plan.id,
      actorId,
      values: {
        attributes: {
          ...(plan.attributes || {}),
          service_delivery: {
            ...terms.delivery,
            billing_runtime: {
              schema_version: 1,
              status: "completed",
              next_billing_at: null,
              last_billing_at: terms.runtime?.last_billing_at || null,
              last_attempt_at: new Date().toISOString(),
              last_error: null,
              last_invoice: terms.runtime?.last_invoice || null,
            },
          },
        },
      },
    });

    return {
      success: true,
      processed: false,
      reason: "contract-complete",
      service_plan_id: plan.id,
      plan: runtimeResult,
    };
  }

  const generationKey = `service-plan:${plan.id}:billing-cycle:${cycleAt}`;
  let cycle = await getOrCreateServiceBillingCycle({
    organizationId: plan.organization_id,
    entityId: plan.entity_id,
    servicePlanId: plan.id,
    cycleAt,
    generationKey,
    attributes: {
      billing_terms: {
        amount,
        currency_code: currencyCode,
        due_days: Number(terms.billing.due_days || 0),
        tax_code_id: terms.billing.tax_code_id || null,
      },
    },
  });

  const existingInvoice = cycle.status === "invoiced" && cycle.invoice_id
    ? {
        invoice_id: cycle.invoice_id,
        invoice_number: cycle.invoice_number || null,
        created_at: cycle.invoiced_at || cycle.updated_at || null,
        idempotency_key: generationKey,
        currency_code: currencyCode,
        amount,
      }
    : null;

  if (existingInvoice) {
    const runtimeResult = await persistBillingRuntime({
      plan,
      delivery: terms.delivery,
      runtime: terms.runtime,
      cycleAt,
      invoice: existingInvoice,
      actorId,
    });
    return {
      success: true,
      processed: true,
      idempotent_replay: true,
      service_plan_id: plan.id,
      billing_cycle: cycle,
      invoice: existingInvoice,
      ...runtimeResult,
    };
  }

  try {
    const invoiceDate = cycleAt.slice(0, 10);
    const dueDate = addDays(invoiceDate, terms.billing.due_days || 0);
    const tax = await resolveServiceBillingTax({
      organizationId: plan.organization_id,
      taxCodeId: terms.billing.tax_code_id || null,
      amount,
      effectiveAt: invoiceDate,
    });

    const financeResult = await createCustomerInvoiceCommand({
      organization_id: plan.organization_id,
      entity_id: plan.entity_id,
      party_id: plan.customer_party_id,
      invoice_date: invoiceDate,
      due_date: dueDate,
      currency_code: currencyCode,
      lines: [
        {
          description: `Recurring service — ${plan.service_name || "Service plan"}`,
          quantity: 1,
          unit_price: amount,
          tax_amount: tax.tax_amount,
        },
      ],
      tax_amount: tax.tax_amount,
      notes: `Recurring service billing cycle ${cycle.id}`,
      created_by: actorId,
      idempotency_key: generationKey,
      source_document_type: "SERVICE_PLAN_BILLING_CYCLE",
      source_document_id: cycle.id,
    });

    const invoice = {
      invoice_id: financeResult.invoice_id || financeResult.id || null,
      invoice_number: financeResult.invoice_number || financeResult.number || null,
      created_at: new Date().toISOString(),
      idempotency_key: generationKey,
      tax_code_id: tax.tax_code_id,
      tax_code: tax.tax_code,
      tax_rate: tax.tax_rate,
      tax_amount: tax.tax_amount,
      currency_code: currencyCode,
      amount,
    };

    if (!invoice.invoice_id) {
      const error = new Error("Finance recurring invoice handoff returned no invoice_id.");
      error.status = 500;
      throw error;
    }

    cycle = await updateServiceBillingCycle({
      organizationId: plan.organization_id,
      cycleId: cycle.id,
      values: {
        status: "invoiced",
        invoice_id: invoice.invoice_id,
        invoice_number: invoice.invoice_number,
        invoiced_at: invoice.created_at,
        attributes: {
          ...(cycle.attributes || {}),
          finance_invoice: invoice,
        },
      },
    });

    const runtimeResult = await persistBillingRuntime({
      plan,
      delivery: terms.delivery,
      runtime: terms.runtime,
      cycleAt,
      invoice,
      actorId,
    });

    return {
      success: true,
      processed: true,
      idempotent_replay: Boolean(financeResult.idempotent_replay),
      service_plan_id: plan.id,
      billing_cycle: cycle,
      invoice,
      finance_result: financeResult,
      ...runtimeResult,
    };
  } catch (error) {
    const message = error?.message || "Recurring service billing failed.";
    await updateServiceBillingCycle({
      organizationId: plan.organization_id,
      cycleId: cycle.id,
      values: {
        status: "failed",
        attributes: {
          ...(cycle.attributes || {}),
          last_error: message,
          last_attempt_at: new Date().toISOString(),
        },
      },
    }).catch(() => null);
    await persistBillingError({
      plan,
      delivery: terms.delivery,
      runtime: terms.runtime,
      errorMessage: message,
      actorId,
    }).catch(() => null);
    throw error;
  }
}

export default processRecurringServiceBillingPlan;
