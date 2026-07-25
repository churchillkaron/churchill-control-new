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
  subtotal = 0,
  taxAmount = 0,
  discountAmount = 0,
  totalAmount = 0,
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
  const resolvedTotalAmount = Number(totalAmount);

  if (!Number.isFinite(resolvedExchangeRate) || resolvedExchangeRate <= 0) {
    throw new Error("exchangeRate must be positive");
  }

  if (!Number.isFinite(resolvedTotalAmount) || resolvedTotalAmount <= 0) {
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
        amount: resolvedTotalAmount,
        taxAmount: Number(taxAmount),
        currency_code: resolvedCurrencyCode,
        exchange_rate: resolvedExchangeRate,
        entryDate: resolvedInvoiceDate,
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
      p_purchase_order_id: purchaseOrderId,
      p_goods_receipt_id: goodsReceiptId,
      p_document_id: documentId,
      p_invoice_number: resolvedInvoiceNumber,
      p_invoice_date: resolvedInvoiceDate,
      p_due_date: dueDate,
      p_currency_code: resolvedCurrencyCode,
      p_exchange_rate: resolvedExchangeRate,
      p_subtotal: Number(subtotal),
      p_tax_amount: Number(taxAmount),
      p_discount_amount: Number(discountAmount),
      p_total_amount: resolvedTotalAmount,
      p_source: source,
      p_ai_extracted: Boolean(aiExtracted),
      p_ocr_confidence: Number(ocrConfidence),
      p_created_by: createdBy,
      p_journal_lines: journal.lines,
      p_idempotency_key: resolvedIdempotencyKey,
    }
  );

  if (error) {
    throw new Error(`Idempotent vendor invoice failed: ${error.message}`);
  }

  return data;
}
