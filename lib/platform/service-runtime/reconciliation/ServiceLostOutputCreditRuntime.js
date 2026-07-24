import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

import {
  WalletRuntime,
} from "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const CREDIT_CODE = "PROVIDER_OUTPUT_LOST_CREDITED";
const CREDIT_VERSION = "SERVICE_LOST_OUTPUT_CREDIT_V1";

function object(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value || "").trim();
}

function number(value) {
  const resolved = Number(value || 0);
  return Number.isFinite(resolved) ? resolved : 0;
}

function currency(value) {
  const resolved = text(value).toUpperCase();

  if (!/^[A-Z]{3}$/.test(resolved)) {
    const error = new Error("VALID_CURRENCY_REQUIRED");
    error.code = error.message;
    throw error;
  }

  return resolved;
}

async function one(table, filters = {}) {
  let query = supabaseAdmin
    .from(table)
    .select("*");

  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }

  const {
    data,
    error,
  } = await query.maybeSingle();

  if (error) throw error;
  return data || null;
}

async function rows(table, filters = {}) {
  let query = supabaseAdmin
    .from(table)
    .select("*");

  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }

  const {
    data,
    error,
  } = await query;

  if (error) throw error;
  return data || [];
}

function providerImageEvidence(usage = {}) {
  const metadata = object(usage.metadata);
  const result = object(metadata.result);
  const output = object(result.output);
  const image = output.image_url;

  return {
    image,
    binary_omitted:
      object(image).omitted_binary === true,
    encoded_length:
      number(object(image).encoded_length),
    content_type:
      object(image).content_type || null,
    transport:
      object(image).transport || null,
  };
}

function taskHasOutput(task = {}) {
  const output = object(task.output);

  return Boolean(
    output.image_url ||
    output.url ||
    object(output.asset).url ||
    object(output.asset).image_url,
  );
}

async function updateInvoiceLine({
  line,
  creditAt,
  refundTransaction,
  charge,
}) {
  const metadata = object(line.metadata);

  if (
    metadata.lost_output_credit?.version ===
      CREDIT_VERSION &&
    number(line.line_total) === 0
  ) {
    return line;
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("billing_invoice_lines")
    .update({
      unit_price: 0,
      line_total: 0,
      metadata: {
        ...metadata,
        lost_output_credit: {
          version: CREDIT_VERSION,
          code: CREDIT_CODE,
          credited_at: creditAt,
          original_unit_price:
            number(line.unit_price),
          original_line_total:
            number(line.line_total),
          original_currency:
            line.currency || null,
          wallet_refund_transaction_id:
            refundTransaction.id,
          wallet_charge_transaction_id:
            charge.id,
          wallet_refund_amount:
            number(refundTransaction.amount),
          wallet_refund_currency:
            refundTransaction.currency,
        },
      },
      updated_at: creditAt,
    })
    .eq("id", line.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function refreshInvoice(invoiceId, creditAt) {
  const invoice = await one(
    "billing_invoices",
    { id: invoiceId },
  );

  if (!invoice) {
    throw new Error("BILLING_INVOICE_REQUIRED");
  }

  const lines = await rows(
    "billing_invoice_lines",
    { invoice_id: invoiceId },
  );

  const totals = lines.reduce(
    (result, line) => {
      result.amount += number(line.line_total);
      result.supplier_cost +=
        number(line.supplier_cost);
      return result;
    },
    {
      amount: 0,
      supplier_cost: 0,
    },
  );

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("billing_invoices")
    .update({
      amount: totals.amount,
      subtotal: totals.amount,
      total_amount: totals.amount,
      metadata: {
        ...object(invoice.metadata),
        supplier_cost: totals.supplier_cost,
        lost_output_credit_recalculated_at:
          creditAt,
      },
      updated_at: creditAt,
    })
    .eq("id", invoice.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function creditUsage({
  usage,
  creditAt,
  refundTransaction,
  charge,
}) {
  const metadata = object(usage.metadata);
  const existing = object(
    metadata.lost_output_credit,
  );

  if (
    existing.version === CREDIT_VERSION &&
    number(usage.customer_price) === 0
  ) {
    return usage;
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("platform_service_usage")
    .update({
      customer_price: 0,
      metadata: {
        ...metadata,
        lost_output_credit: {
          version: CREDIT_VERSION,
          code: CREDIT_CODE,
          credited_at: creditAt,
          original_customer_price:
            number(usage.customer_price),
          original_usage_currency:
            usage.currency || null,
          supplier_cost_preserved:
            number(usage.supplier_cost),
          supplier_cost_currency:
            usage.currency || null,
          supplier_cost_currency_verification:
            "REQUIRED",
          wallet_charge_transaction_id:
            charge.id,
          wallet_refund_transaction_id:
            refundTransaction.id,
          wallet_refund_amount:
            number(refundTransaction.amount),
          wallet_refund_currency:
            refundTransaction.currency,
          provider_output_delivered:
            false,
        },
        execution_stage:
          "LOST_OUTPUT_CREDITED",
      },
      updated_at: creditAt,
    })
    .eq("id", usage.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function creditTask({
  task,
  usage,
  creditAt,
  refundTransaction,
}) {
  if (
    task.metadata?.lost_output_credit?.version ===
      CREDIT_VERSION &&
    task.status === "FAILED"
  ) {
    return task;
  }

  return ProductionTaskRuntime.update(
    task.id,
    {
      status: "FAILED",
      error: CREDIT_CODE,
      timing: {
        ...object(task.timing),
        completed_at: creditAt,
      },
      metadata: {
        ...object(task.metadata),
        provider_status:
          "LOST_OUTPUT_CREDITED",
        generation_status:
          "FAILED_CREDITED",
        provider_dispatched: true,
        usage_created: true,
        wallet_reserved: false,
        wallet_charged: false,
        automatic_retry_forbidden: true,
        lost_output_credit: {
          version: CREDIT_VERSION,
          code: CREDIT_CODE,
          credited_at: creditAt,
          usage_id: usage.id,
          wallet_refund_transaction_id:
            refundTransaction.id,
          retry_requires_explicit_authorization:
            true,
          media_retry_authorized: false,
          video_execution_authorized: false,
        },
      },
      worker_id: null,
      lease_expires_at: null,
    },
    {
      organization_id: task.organization_id,
      creative_project_id:
        task.creative_project_id,
    },
  );
}

export const ServiceLostOutputCreditRuntime = {
  async credit({
    organization_id,
    creative_project_id,
    production_task_id,
    usage_id,
  } = {}) {
    if (!organization_id) {
      throw new Error("organization_id required");
    }

    if (!creative_project_id) {
      throw new Error(
        "creative_project_id required",
      );
    }

    if (!production_task_id) {
      throw new Error(
        "production_task_id required",
      );
    }

    if (!usage_id) {
      throw new Error("usage_id required");
    }

    const [
      task,
      usage,
      transactions,
      line,
    ] = await Promise.all([
      one(
        "creative_production_tasks",
        {
          id: production_task_id,
          organization_id,
          creative_project_id,
        },
      ),
      one(
        "platform_service_usage",
        {
          id: usage_id,
          organization_id,
        },
      ),
      rows(
        "wallet_transactions",
        {
          organization_id,
          reference: usage_id,
        },
      ),
      one(
        "billing_invoice_lines",
        {
          usage_id,
          organization_id,
        },
      ),
    ]);

    if (!task) {
      throw new Error(
        "PRODUCTION_TASK_REQUIRED",
      );
    }

    if (!usage) {
      throw new Error("SERVICE_USAGE_REQUIRED");
    }

    if (!line) {
      throw new Error(
        "BILLING_INVOICE_LINE_REQUIRED",
      );
    }

    if (usage.status !== "SUCCESS") {
      throw new Error(
        "LOST_OUTPUT_CREDIT_REQUIRES_SUCCESS_USAGE",
      );
    }

    if (taskHasOutput(task)) {
      throw new Error(
        "LOST_OUTPUT_CREDIT_FORBIDDEN_WITH_TASK_OUTPUT",
      );
    }

    const evidence = providerImageEvidence(usage);

    if (!evidence.binary_omitted) {
      throw new Error(
        "LOST_OUTPUT_BINARY_OMISSION_EVIDENCE_REQUIRED",
      );
    }

    const charge = transactions.find(
      (row) => row.type === "CHARGE",
    );

    if (!charge) {
      throw new Error(
        "LOST_OUTPUT_CREDIT_REQUIRES_WALLET_CHARGE",
      );
    }

    const chargeCurrency = currency(
      charge.currency,
    );

    const creditAt = new Date().toISOString();

    const refundTransaction =
      await WalletRuntime.refund({
        organization_id,
        amount: number(charge.amount),
        currency: chargeCurrency,
        provider:
          usage.provider ||
          charge.provider ||
          null,
        usage_id,
        reference: usage_id,
        metadata: {
          version: CREDIT_VERSION,
          code: CREDIT_CODE,
          creative_project_id,
          production_task_id,
          reason:
            "Provider succeeded but generated binary was omitted before canonical storage.",
        },
      });

    const creditedLine =
      await updateInvoiceLine({
        line,
        creditAt,
        refundTransaction,
        charge,
      });

    const invoice =
      await refreshInvoice(
        line.invoice_id,
        creditAt,
      );

    const creditedUsage =
      await creditUsage({
        usage,
        creditAt,
        refundTransaction,
        charge,
      });

    const creditedTask =
      await creditTask({
        task,
        usage: creditedUsage,
        creditAt,
        refundTransaction,
      });

    return {
      success: true,
      idempotent: true,
      code: CREDIT_CODE,
      organization_id,
      creative_project_id,
      production_task_id,
      usage_id,
      provider_output: {
        delivered: false,
        binary_omitted:
          evidence.binary_omitted,
        encoded_length:
          evidence.encoded_length,
        content_type:
          evidence.content_type,
        transport:
          evidence.transport,
      },
      wallet_refund: {
        transaction_id:
          refundTransaction.id,
        amount:
          number(refundTransaction.amount),
        currency:
          refundTransaction.currency,
      },
      billing: {
        invoice_id: invoice.id,
        invoice_currency:
          invoice.currency,
        invoice_total:
          number(invoice.total_amount),
        line_id: creditedLine.id,
        credited_line_total:
          number(creditedLine.line_total),
      },
      usage: {
        status: creditedUsage.status,
        customer_price:
          number(
            creditedUsage.customer_price,
          ),
        currency:
          creditedUsage.currency,
      },
      task: {
        status: creditedTask.status,
        error: creditedTask.error,
        automatic_retry_forbidden:
          creditedTask.metadata
            ?.automatic_retry_forbidden === true,
      },
      media_retry_authorized: false,
      video_execution_authorized: false,
    };
  },
};
