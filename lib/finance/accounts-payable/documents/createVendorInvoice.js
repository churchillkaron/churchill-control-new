import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { prepareAccountingEventJournal } from "@/lib/finance/general-ledger/workflows/prepareAccountingEventJournal";

function required(value, field) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`${field} required`);
  }

  return normalized;
}

function amount(value, field, { minimum = 0 } = {}) {
  const normalized = Number(value ?? 0);

  if (!Number.isFinite(normalized) || normalized < minimum) {
    throw new Error(`${field} must be at least ${minimum}`);
  }

  return normalized;
}

function optionalId(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("invoice lines required");
  }

  return lines.map((line, index) => {
    const description = required(
      line?.description,
      `line ${index + 1} description`
    );
    const quantity = amount(
      line?.quantity,
      `line ${index + 1} quantity`,
      { minimum: Number.EPSILON }
    );
    const unitPrice = amount(
      line?.unit_price,
      `line ${index + 1} unit_price`
    );
    const discountAmount = amount(
      line?.discount_amount,
      `line ${index + 1} discount_amount`
    );
    const taxAmount = amount(
      line?.tax_amount,
      `line ${index + 1} tax_amount`
    );
    const taxableBase = quantity * unitPrice - discountAmount;
    if (taxableBase < -0.005) {
      throw new Error(`line ${index + 1} discount exceeds gross line amount`);
    }

    const taxCodeId = optionalId(line?.tax_code_id);
    if (taxAmount > 0.005 && !taxCodeId) {
      throw new Error(`line ${index + 1} tax_code_id required when tax_amount is positive`);
    }

    const calculatedTotal = taxableBase + taxAmount;
    const suppliedTotal =
      line?.line_total === undefined || line?.line_total === null || line?.line_total === ""
        ? calculatedTotal
        : amount(line.line_total, `line ${index + 1} line_total`);

    if (Math.abs(suppliedTotal - calculatedTotal) > 0.005) {
      throw new Error(`line ${index + 1} total is inconsistent`);
    }

    return {
      item_id: optionalId(line?.item_id),
      description,
      quantity,
      unit_price: unitPrice,
      discount_amount: discountAmount,
      tax_code_id: taxCodeId,
      tax_amount: taxAmount,
      line_total: calculatedTotal,
      expense_account_id: optionalId(line?.expense_account_id),
      asset_account_id: optionalId(line?.asset_account_id),
      inventory_account_id: optionalId(line?.inventory_account_id),
      cost_center_id: optionalId(line?.cost_center_id),
      department_id: optionalId(line?.department_id),
      project_id: optionalId(line?.project_id),
      purchase_order_item_id: optionalId(line?.purchase_order_item_id),
      goods_receipt_item_id: optionalId(line?.goods_receipt_item_id),
    };
  });
}

async function validateTaxRules({ organizationId, invoiceDate, lines }) {
  const taxRuleIds = [...new Set(lines.map(line => line.tax_code_id).filter(Boolean))];
  if (!taxRuleIds.length) return lines;

  const { data, error } = await supabaseAdmin
    .from("tax_rules")
    .select("id, organization_id, tax_code, tax_name, tax_type, tax_rate, effective_from, effective_to, is_active")
    .in("id", taxRuleIds)
    .or(`organization_id.eq.${organizationId},organization_id.is.null`);

  if (error) throw error;

  const byId = new Map((data || []).map(rule => [String(rule.id), rule]));

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.tax_code_id) continue;

    const rule = byId.get(String(line.tax_code_id));
    if (!rule) throw new Error(`line ${index + 1} tax rule is outside this organisation`);
    if (rule.is_active !== true) throw new Error(`line ${index + 1} tax rule is inactive`);
    if (rule.effective_from && invoiceDate < rule.effective_from) {
      throw new Error(`line ${index + 1} tax rule is not effective on the invoice date`);
    }
    if (rule.effective_to && invoiceDate > rule.effective_to) {
      throw new Error(`line ${index + 1} tax rule expired before the invoice date`);
    }

    const rate = Number(rule.tax_rate);
    if (!Number.isFinite(rate) || rate < 0) {
      throw new Error(`line ${index + 1} tax rule rate is invalid`);
    }

    const taxableBase = line.quantity * line.unit_price - line.discount_amount;
    const expectedTax = Math.round((taxableBase * rate + Number.EPSILON) * 100) / 100;
    if (Math.abs(line.tax_amount - expectedTax) > 0.01) {
      throw new Error(
        `line ${index + 1} tax amount does not match ${rule.tax_name || rule.tax_code}`
      );
    }
  }

  return lines;
}

export async function createVendorInvoice({
  organizationId,
  entityId,
  vendorPartyId,
  purchaseOrderId = null,
  goodsReceiptId = null,
  documentId = null,
  invoiceNumber,
  invoiceDate,
  dueDate = null,
  currencyCode,
  exchangeRate = 1,
  lines = [],
  source = "manual",
  aiExtracted = false,
  ocrConfidence = 0,
  createdBy = null,
  idempotencyKey,
}) {
  const resolvedOrganizationId = required(
    organizationId,
    "organizationId"
  );
  const resolvedEntityId = required(
    entityId,
    "entityId"
  );
  const resolvedVendorPartyId = required(
    vendorPartyId,
    "vendorPartyId"
  );
  const resolvedCurrencyCode = required(
    currencyCode,
    "currencyCode"
  ).toUpperCase();
  const resolvedInvoiceNumber = required(
    invoiceNumber,
    "invoiceNumber"
  );
  const resolvedInvoiceDate = required(
    invoiceDate,
    "invoiceDate"
  );
  const resolvedIdempotencyKey = required(
    idempotencyKey,
    "idempotencyKey"
  );
  const resolvedExchangeRate = Number(exchangeRate);
  const normalizedLines = await validateTaxRules({
    organizationId: resolvedOrganizationId,
    invoiceDate: resolvedInvoiceDate,
    lines: normalizeLines(lines),
  });

  if (!Number.isFinite(resolvedExchangeRate) || resolvedExchangeRate <= 0) {
    throw new Error("exchangeRate must be positive");
  }

  const subtotal = normalizedLines.reduce(
    (sum, line) => sum + line.quantity * line.unit_price,
    0
  );
  const discountAmount = normalizedLines.reduce(
    (sum, line) => sum + line.discount_amount,
    0
  );
  const taxAmount = normalizedLines.reduce(
    (sum, line) => sum + line.tax_amount,
    0
  );
  const totalAmount = normalizedLines.reduce(
    (sum, line) => sum + line.line_total,
    0
  );

  if (totalAmount <= 0) {
    throw new Error("totalAmount must be greater than zero");
  }

  const invoiceId = randomUUID();
  const journal = await prepareAccountingEventJournal({
    event: {
      organization_id: resolvedOrganizationId,
      entity_id: resolvedEntityId,
      event_type: "VENDOR_INVOICE_CREATED",
      source_module: "accounts_payable",
      source_id: invoiceId,
      payload: {
        organization_id: resolvedOrganizationId,
        entity_id: resolvedEntityId,
        party_id: resolvedVendorPartyId,
        vendor_party_id: resolvedVendorPartyId,
        source_document: "vendor_invoice",
        source_document_id: invoiceId,
        amount: totalAmount,
        tax_amount: taxAmount,
        currency_code: resolvedCurrencyCode,
        exchange_rate: resolvedExchangeRate,
        entry_date: resolvedInvoiceDate,
        description: `Vendor Invoice ${resolvedInvoiceNumber}`,
      },
    },
  });

  const { data, error } = await supabaseAdmin.rpc(
    "finance_create_vendor_invoice_idempotent",
    {
      p_invoice_id: invoiceId,
      p_organization_id: resolvedOrganizationId,
      p_entity_id: resolvedEntityId,
      p_vendor_party_id: resolvedVendorPartyId,
      p_purchase_order_id: optionalId(purchaseOrderId),
      p_goods_receipt_id: optionalId(goodsReceiptId),
      p_document_id: optionalId(documentId),
      p_invoice_number: resolvedInvoiceNumber,
      p_invoice_date: resolvedInvoiceDate,
      p_due_date: dueDate || null,
      p_currency_code: resolvedCurrencyCode,
      p_exchange_rate: resolvedExchangeRate,
      p_subtotal: subtotal,
      p_tax_amount: taxAmount,
      p_discount_amount: discountAmount,
      p_total_amount: totalAmount,
      p_source: source,
      p_ai_extracted: Boolean(aiExtracted),
      p_ocr_confidence: Number(ocrConfidence || 0),
      p_created_by: createdBy,
      p_lines: normalizedLines,
      p_journal_lines: journal.lines,
      p_idempotency_key: resolvedIdempotencyKey,
    }
  );

  if (error) {
    throw new Error(`Idempotent vendor invoice failed: ${error.message}`);
  }

  return {
    ...data,
    lines: normalizedLines,
  };
}
