import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { ProviderSupplierAccountRuntime } from "./ProviderSupplierAccountRuntime.js";

const ALLOCATION_TABLE = "provider_supplier_invoice_allocations";
const DEFAULT_TOLERANCE = 0.01;

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function money(value) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("supplier cost amount must be zero or greater");
  }
  return Number(amount.toFixed(6));
}

function tolerance(value) {
  const amount = Number(value ?? DEFAULT_TOLERANCE);
  if (!Number.isFinite(amount) || amount < 0) return DEFAULT_TOLERANCE;
  return amount;
}

async function vendorInvoice(invoiceId) {
  const { data, error } = await supabaseAdmin
    .from("vendor_invoices")
    .select("id,organization_id,entity_id,vendor_party_id,invoice_number,invoice_date,due_date,currency_code,total_amount,outstanding_amount,status,approval_status")
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function usages(usageIds = []) {
  const ids = [...new Set((usageIds || []).map(text).filter(Boolean))];
  if (!ids.length) return [];

  const { data, error } = await supabaseAdmin
    .from("platform_service_usage")
    .select("id,organization_id,entity_id,provider,capability,operation,supplier_cost,customer_price,currency,status,created_at")
    .in("id", ids);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function validateInvoiceAgainstAccount(invoice, account) {
  if (!invoice) throw new Error("VENDOR_INVOICE_NOT_FOUND");
  if (!account?.ready || !account?.account) {
    throw new Error(account?.blocker || "AVANTIQO_PROVIDER_SUPPLIER_ACCOUNT_REQUIRED");
  }

  const configured = account.account;
  if (invoice.organization_id !== configured.payer_organization_id) {
    throw new Error("PROVIDER_INVOICE_PAYER_ORGANIZATION_MISMATCH");
  }
  if (invoice.entity_id !== configured.payer_entity_id) {
    throw new Error("PROVIDER_INVOICE_PAYER_ENTITY_MISMATCH");
  }
  if (invoice.vendor_party_id !== configured.supplier_party_id) {
    throw new Error("PROVIDER_INVOICE_SUPPLIER_MISMATCH");
  }
  if (
    configured.currency &&
    upper(invoice.currency_code) &&
    upper(configured.currency) !== upper(invoice.currency_code)
  ) {
    throw new Error("PROVIDER_INVOICE_CURRENCY_MISMATCH");
  }
}

function normalizeAllocations(allocations = []) {
  if (!Array.isArray(allocations) || !allocations.length) {
    throw new Error("allocations required");
  }

  return allocations.map((allocation, index) => {
    const usageId = text(allocation?.usage_id || allocation?.usageId);
    if (!usageId) throw new Error(`allocation ${index + 1} usage_id required`);
    return {
      usage_id: usageId,
      vendor_invoice_line_id:
        text(allocation?.vendor_invoice_line_id || allocation?.vendorInvoiceLineId) || null,
      provider_charge_reference:
        text(allocation?.provider_charge_reference || allocation?.providerChargeReference) || null,
      supplier_cost_amount:
        allocation?.supplier_cost_amount ?? allocation?.supplierCostAmount ?? null,
      metadata: allocation?.metadata || {},
    };
  });
}

async function reconcile({
  provider_id,
  vendor_invoice_id,
  allocations = [],
  tolerance_amount = DEFAULT_TOLERANCE,
  payer_organization_id = null,
  metadata = {},
} = {}) {
  const providerId = text(provider_id).toLowerCase();
  const invoiceId = text(vendor_invoice_id);
  if (!providerId) throw new Error("provider_id required");
  if (!invoiceId) throw new Error("vendor_invoice_id required");

  const normalized = normalizeAllocations(allocations);
  const [account, invoice, usageRows] = await Promise.all([
    ProviderSupplierAccountRuntime.providerStatus(providerId, {
      payerOrganizationId: payer_organization_id,
    }),
    vendorInvoice(invoiceId),
    usages(normalized.map((row) => row.usage_id)),
  ]);

  validateInvoiceAgainstAccount(invoice, account);

  const usageMap = new Map(usageRows.map((usage) => [usage.id, usage]));
  const configured = account.account;
  const invoiceCurrency = upper(invoice.currency_code);
  const resolvedTolerance = tolerance(tolerance_amount);
  const prepared = normalized.map((allocation) => {
    const usage = usageMap.get(allocation.usage_id);
    if (!usage) throw new Error(`SERVICE_USAGE_NOT_FOUND:${allocation.usage_id}`);
    if (text(usage.provider).toLowerCase() !== providerId) {
      throw new Error(`SERVICE_USAGE_PROVIDER_MISMATCH:${allocation.usage_id}`);
    }
    if (upper(usage.currency) !== invoiceCurrency) {
      throw new Error(`SERVICE_USAGE_CURRENCY_MISMATCH:${allocation.usage_id}`);
    }

    const expected = money(usage.supplier_cost);
    const allocated = allocation.supplier_cost_amount === null
      ? expected
      : money(allocation.supplier_cost_amount);
    const variance = Number((allocated - expected).toFixed(6));
    const status = Math.abs(variance) <= resolvedTolerance ? "MATCHED" : "VARIANCE";

    return {
      ...allocation,
      usage,
      expected_supplier_cost: expected,
      allocated_supplier_cost: allocated,
      variance,
      status,
    };
  });

  const allocatedTotal = money(
    prepared.reduce((sum, row) => sum + row.allocated_supplier_cost, 0),
  );
  const expectedTotal = money(
    prepared.reduce((sum, row) => sum + row.expected_supplier_cost, 0),
  );
  const invoiceTotal = money(invoice.total_amount);
  const invoiceVariance = Number((invoiceTotal - allocatedTotal).toFixed(6));
  const invoiceStatus =
    Math.abs(invoiceVariance) <= resolvedTolerance &&
    prepared.every((row) => row.status === "MATCHED")
      ? "MATCHED"
      : "VARIANCE";

  const now = new Date().toISOString();
  const rows = prepared.map((row) => ({
    allocation_key: `${invoiceId}:${row.vendor_invoice_line_id || "invoice"}:${row.usage_id}`,
    provider_id: providerId,
    payer_organization_id: configured.payer_organization_id,
    payer_entity_id: configured.payer_entity_id,
    supplier_party_id: configured.supplier_party_id,
    vendor_invoice_id: invoiceId,
    vendor_invoice_line_id: row.vendor_invoice_line_id,
    usage_id: row.usage_id,
    provider_charge_reference: row.provider_charge_reference,
    supplier_cost_amount: row.allocated_supplier_cost,
    currency: invoiceCurrency,
    status: row.status,
    metadata: {
      ...(metadata || {}),
      ...(row.metadata || {}),
      expected_supplier_cost: row.expected_supplier_cost,
      variance_amount: row.variance,
      reconciliation_owner: "AVANTIQO",
      customer_wallet_is_separate: true,
    },
    updated_at: now,
  }));

  const { data, error } = await supabaseAdmin
    .from(ALLOCATION_TABLE)
    .upsert(rows, { onConflict: "allocation_key" })
    .select();

  if (error) throw error;

  return {
    success: invoiceStatus === "MATCHED",
    status: invoiceStatus,
    provider_id: providerId,
    vendor_invoice: invoice,
    supplier_account: configured,
    expected_supplier_cost: expectedTotal,
    allocated_supplier_cost: allocatedTotal,
    invoice_total: invoiceTotal,
    variance_amount: invoiceVariance,
    tolerance_amount: resolvedTolerance,
    allocations: data || [],
    payment_authorized: false,
    payment_note:
      "Reconciliation never pays the supplier. Payment remains controlled by Finance approval and payment workflows.",
  };
}

async function listForInvoice(vendorInvoiceId) {
  const invoiceId = text(vendorInvoiceId);
  if (!invoiceId) throw new Error("vendor_invoice_id required");

  const { data, error } = await supabaseAdmin
    .from(ALLOCATION_TABLE)
    .select("*")
    .eq("vendor_invoice_id", invoiceId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export const ProviderSupplierInvoiceReconciliationRuntime = {
  reconcile,
  listForInvoice,
};
