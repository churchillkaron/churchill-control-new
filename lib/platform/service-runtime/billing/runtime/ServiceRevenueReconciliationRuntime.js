import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const LOOKUP_BATCH_SIZE = 100;
const UPSERT_BATCH_SIZE = 250;

function number(value) {
  const resolved = Number(value || 0);
  return Number.isFinite(resolved) ? resolved : 0;
}

function closeEnough(left, right) {
  return Math.abs(number(left) - number(right)) <= 0.000001;
}

function batches(values, size) {
  const rows = [];
  for (let index = 0; index < values.length; index += size) {
    rows.push(values.slice(index, index + size));
  }
  return rows;
}

async function paidUsageRows(limit) {
  const { data, error } = await supabaseAdmin
    .from("platform_service_usage")
    .select("id,organization_id,entity_id,provider,capability,category,currency,customer_price,supplier_cost,platform_markup,status,invoice_status,invoice_id,billing_invoice_line_id,billing_completed,finance_posted,created_at,updated_at")
    .eq("status", "SUCCESS")
    .gt("customer_price", 0)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

async function walletCharges(usageIds) {
  const totals = new Map();

  for (const usageIdBatch of batches(usageIds, LOOKUP_BATCH_SIZE)) {
    const { data, error } = await supabaseAdmin
      .from("wallet_transactions")
      .select("usage_id,organization_id,type,amount")
      .in("usage_id", usageIdBatch)
      .eq("type", "CHARGE");

    if (error) throw error;

    for (const row of data || []) {
      const key = `${row.organization_id}:${row.usage_id}`;
      totals.set(key, number(totals.get(key)) + number(row.amount));
    }
  }

  return totals;
}

async function invoiceLines(usageIds) {
  const totals = new Map();

  for (const usageIdBatch of batches(usageIds, LOOKUP_BATCH_SIZE)) {
    const { data, error } = await supabaseAdmin
      .from("billing_invoice_lines")
      .select("usage_id,organization_id,invoice_id,id,line_total")
      .in("usage_id", usageIdBatch);

    if (error) throw error;

    for (const row of data || []) {
      const key = `${row.organization_id}:${row.usage_id}`;
      const current = totals.get(key) || {
        amount: 0,
        invoice_id: row.invoice_id || null,
        line_id: row.id || null,
      };
      current.amount += number(row.line_total);
      current.invoice_id = current.invoice_id || row.invoice_id || null;
      current.line_id = current.line_id || row.id || null;
      totals.set(key, current);
    }
  }

  return totals;
}

async function financeJournals(usageIds) {
  const journals = new Set();

  for (const usageIdBatch of batches(usageIds, LOOKUP_BATCH_SIZE)) {
    const { data, error } = await supabaseAdmin
      .from("journal_entries")
      .select("organization_id,source_document_id,source_module,source_document,status,reversed")
      .in("source_document_id", usageIdBatch)
      .eq("source_document", "SERVICE_USAGE_BILLED");

    if (error) throw error;

    for (const row of data || []) {
      if (
        String(row.source_module || "").trim().toLowerCase() === "service" &&
        String(row.status || "").trim().toUpperCase() !== "VOID" &&
        row.reversed !== true
      ) {
        journals.add(`${row.organization_id}:${row.source_document_id}`);
      }
    }
  }

  return journals;
}

function classification({ usage, walletCharged, invoicedAmount, financePosted }) {
  const expected = number(usage.customer_price);
  const supplierCost = number(usage.supplier_cost);

  if (supplierCost > expected + 0.000001) {
    return { status: "CRITICAL", issue_code: "NEGATIVE_MARGIN" };
  }
  if (walletCharged <= 0) {
    return { status: "CRITICAL", issue_code: "UNCHARGED_SUCCESS" };
  }
  if (!closeEnough(walletCharged, expected)) {
    return { status: "CRITICAL", issue_code: "WALLET_MISMATCH" };
  }
  if (invoicedAmount <= 0) {
    return { status: "CRITICAL", issue_code: "CHARGED_UNBILLED" };
  }
  if (!closeEnough(invoicedAmount, expected)) {
    return { status: "CRITICAL", issue_code: "INVOICE_MISMATCH" };
  }
  if (!financePosted) {
    return { status: "PENDING_FINANCE", issue_code: "FINANCE_PENDING" };
  }
  return { status: "BALANCED", issue_code: null };
}

async function repairEvidenceState({ usage, invoice, financePosted }) {
  const updates = {};
  const invoiceMatches =
    invoice?.invoice_id &&
    invoice?.line_id &&
    closeEnough(invoice.amount, usage.customer_price);

  if (invoiceMatches && usage.billing_completed !== true) {
    updates.billing_completed = true;
    updates.invoice_status = "INVOICED";
    updates.invoice_id = usage.invoice_id || invoice.invoice_id;
    updates.billing_invoice_line_id = usage.billing_invoice_line_id || invoice.line_id;
  }

  if (financePosted && usage.finance_posted !== true) {
    updates.finance_posted = true;
  }

  if (!Object.keys(updates).length) return usage;

  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("platform_service_usage")
    .update(updates)
    .eq("id", usage.id)
    .eq("organization_id", usage.organization_id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function upsertReconciliationRows(rows) {
  for (const rowBatch of batches(rows, UPSERT_BATCH_SIZE)) {
    const { error } = await supabaseAdmin
      .from("service_revenue_reconciliation")
      .upsert(rowBatch, { onConflict: "usage_id" });
    if (error) throw error;
  }
}

export async function reconcileServiceRevenue({ limit = 500 } = {}) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 500, 2000));
  const usages = await paidUsageRows(boundedLimit);
  const usageIds = usages.map((row) => row.id);
  const [charges, invoices, journals] = await Promise.all([
    walletCharges(usageIds),
    invoiceLines(usageIds),
    financeJournals(usageIds),
  ]);

  const now = new Date().toISOString();
  const rows = [];
  const counts = {
    checked: usages.length,
    balanced: 0,
    critical: 0,
    pending_finance: 0,
    evidence_repairs: 0,
  };

  for (const usage of usages) {
    const key = `${usage.organization_id}:${usage.id}`;
    const walletCharged = number(charges.get(key));
    const invoice = invoices.get(key) || { amount: 0, invoice_id: null, line_id: null };
    const financePosted = journals.has(key);
    const beforeBilling = usage.billing_completed === true;
    const beforeFinance = usage.finance_posted === true;
    const repaired = await repairEvidenceState({ usage, invoice, financePosted });

    if (
      beforeBilling !== (repaired.billing_completed === true) ||
      beforeFinance !== (repaired.finance_posted === true)
    ) {
      counts.evidence_repairs += 1;
    }

    const state = classification({
      usage: repaired,
      walletCharged,
      invoicedAmount: invoice.amount,
      financePosted,
    });

    if (state.status === "BALANCED") counts.balanced += 1;
    if (state.status === "CRITICAL") counts.critical += 1;
    if (state.status === "PENDING_FINANCE") counts.pending_finance += 1;

    rows.push({
      usage_id: usage.id,
      organization_id: usage.organization_id,
      entity_id: usage.entity_id || null,
      provider: usage.provider,
      currency: usage.currency,
      expected_customer_charge: number(usage.customer_price),
      wallet_charged: walletCharged,
      invoiced_amount: number(invoice.amount),
      supplier_cost: number(usage.supplier_cost),
      platform_markup: Math.max(0, number(usage.customer_price) - number(usage.supplier_cost)),
      billing_completed: repaired.billing_completed === true,
      finance_posted: financePosted,
      status: state.status,
      issue_code: state.issue_code,
      last_checked_at: now,
      resolved_at: state.status === "BALANCED" ? now : null,
      metadata: {
        capability: usage.capability || null,
        category: usage.category || null,
        invoice_id: invoice.invoice_id || repaired.invoice_id || null,
        billing_invoice_line_id: invoice.line_id || repaired.billing_invoice_line_id || null,
        historical_customer_charge_created: false,
        reconciliation_mutates_wallet: false,
      },
    });
  }

  await upsertReconciliationRows(rows);

  return {
    success: true,
    ...counts,
    no_retroactive_wallet_charges: true,
  };
}

export const ServiceRevenueReconciliationRuntime = {
  reconcile: reconcileServiceRevenue,
};
