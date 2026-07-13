import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

import {
  financeGateway,
} from "@/lib/finance/runtime/financeGateway";

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
  const date =
    new Date();

  date.setDate(
    date.getDate() + days
  );

  return date
    .toISOString()
    .slice(0, 10);
}

async function organizationDetails(
  organization_id
) {
  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from("organizations")
      .select("id,name")
      .eq(
        "id",
        organization_id
      )
      .single();

  if (error) {
    throw error;
  }

  return data;
}

async function resolveInvoice({
  usage,
}) {
  const existing =
    await BillingRepository
      .findUsageInvoice({
        organization_id:
          usage.bill_to_organization_id ||
          usage.organization_id,
        currency:
          usage.currency || "USD",
      });

  if (existing) {
    return existing;
  }

  const organization =
    await organizationDetails(
      usage.bill_to_organization_id ||
      usage.organization_id
    );

  return BillingRepository
    .createInvoice({
      organization_id:
        usage.organization_id,

      bill_to_organization_id:
        usage.bill_to_organization_id ||
        usage.organization_id,

      party_id:
        usage.party_id || null,

      entity_id:
        usage.entity_id || null,

      company:
        organization?.name ||
        "Organization",

      email:
        null,

      invoice_number:
        invoiceNumber(),

      invoice_type:
        "SERVICE_USAGE",

      source:
        "SERVICE_USAGE",

      currency:
        usage.currency ||
        "USD",

      amount:
        0,

      subtotal:
        0,

      tax_amount:
        0,

      total_amount:
        0,

      status:
        "draft",

      due_date:
        dueDate(7),

      metadata: {
        billing_source:
          "SERVICE_RUNTIME",
      },
    });
}

async function billUsage({
  usage_id,
}) {
  const usage =
    await UsageRuntime.get(
      usage_id
    );

  if (!usage) {
    throw new Error(
      "Usage record not found"
    );
  }

  if (
    usage.status !== "SUCCESS"
  ) {
    throw new Error(
      "Only successful usage can be billed"
    );
  }

  if (
    usage.invoice_status ===
      "INVOICED" &&
    usage.invoice_id
  ) {
    return {
      invoice:
        await BillingRepository
          .getInvoice(
            usage.invoice_id
          ),
      usage,
      already_invoiced:
        true,
    };
  }

  const existingLine =
    await BillingRepository
      .getLineByUsage(
        usage.id
      );

  if (existingLine) {
    const updatedUsage =
      await UsageRuntime.markInvoiced({
        usage_id:
          usage.id,
        invoice_id:
          existingLine.invoice_id,
        billing_invoice_line_id:
          existingLine.id,
      });

    return {
      invoice:
        await BillingRepository
          .getInvoice(
            existingLine.invoice_id
          ),
      line:
        existingLine,
      usage:
        updatedUsage,
      already_invoiced:
        true,
    };
  }

  const invoice =
    await resolveInvoice({
      usage,
    });

  const line =
    await BillingRepository
      .createLine({
        organization_id:
          usage.organization_id,

        bill_to_organization_id:
          usage.bill_to_organization_id ||
          usage.organization_id,

        entity_id:
          usage.entity_id || null,

        party_id:
          usage.party_id || null,

        invoice_id:
          invoice.id,

        usage_id:
          usage.id,

        service_id:
          usage.capability,

        provider_id:
          usage.provider,

        description:
          `${usage.capability} via ${usage.provider}`,

        quantity:
          Number(
            usage.quantity || 1
          ),

        unit:
          usage.unit ||
          "request",

        unit_price:
          Number(
            usage.customer_price || 0
          ),

        supplier_cost:
          Number(
            usage.supplier_cost || 0
          ),

        platform_markup:
          Number(
            usage.platform_markup || 0
          ),

        line_total:
          Number(
            usage.customer_price || 0
          ),

        currency:
          usage.currency ||
          "USD",

        metadata:
          usage.metadata || {},
      });

  const totals =
    await BillingRepository
      .invoiceTotals(
        invoice.id
      );

  const updatedInvoice =
    await BillingRepository
      .updateInvoice(
        invoice.id,
        {
          amount:
            totals.amount,
          subtotal:
            totals.amount,
          tax_amount:
            0,
          total_amount:
            totals.amount,
          status:
            "issued",
          metadata: {
            ...(invoice.metadata || {}),
            supplier_cost:
              totals.supplier_cost,
          },
        }
      );

  const updatedUsage =
    await UsageRuntime
      .markInvoiced({
        usage_id:
          usage.id,
        invoice_id:
          updatedInvoice.id,
        billing_invoice_line_id:
          line.id,
      });

  if (usage.entity_id) {
    await financeGateway({
      type:
        "SERVICE_USAGE_BILLED",

      payload: {
        organization_id:
          usage.organization_id,

        entity_id:
          usage.entity_id,

        party_id:
          usage.party_id || null,

        source_module:
          "service",

        source_id:
          usage.id,

        usage_id:
          usage.id,

        billing_invoice_id:
          updatedInvoice.id,

        amount:
          Number(
            usage.customer_price || 0
          ),

        supplier_cost:
          Number(
            usage.supplier_cost || 0
          ),

        currency:
          usage.currency ||
          "USD",

        description:
          `${usage.capability} service usage`,
      },
    });
  }

  return {
    invoice:
      updatedInvoice,
    line,
    usage:
      updatedUsage,
    already_invoiced:
      false,
  };
}

export const BillingRuntime = {
  billUsage,
};
