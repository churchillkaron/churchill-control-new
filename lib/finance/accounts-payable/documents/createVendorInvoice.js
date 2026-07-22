import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

import {
  financeGateway,
} from "@/lib/finance/runtime/financeGateway";

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

  const resolvedTotalAmount = Number(totalAmount);

  if (!Number.isFinite(resolvedTotalAmount) || resolvedTotalAmount <= 0) {
    throw new Error("totalAmount must be greater than zero");
  }

  const { data, error } = await supabaseAdmin
    .from("vendor_invoices")
    .insert({
      organization_id: resolvedOrganizationId,
      entity_id: resolvedEntityId,
      vendor_party_id: resolvedVendorPartyId,
      purchase_order_id: purchaseOrderId,
      goods_receipt_id: goodsReceiptId,
      document_id: documentId,
      invoice_number: resolvedInvoiceNumber,
      invoice_date: resolvedInvoiceDate,
      due_date: dueDate,
      currency_code: resolvedCurrencyCode,
      exchange_rate: Number(exchangeRate),
      subtotal: Number(subtotal),
      tax_amount: Number(taxAmount),
      discount_amount: Number(discountAmount),
      total_amount: resolvedTotalAmount,
      outstanding_amount: resolvedTotalAmount,
      source,
      ai_extracted: Boolean(aiExtracted),
      ocr_confidence: Number(ocrConfidence),
      status: "RECEIVED",
      received_at: new Date().toISOString(),
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  await financeGateway({
    type: "VENDOR_INVOICE_CREATED",
    payload: {
      organization_id: resolvedOrganizationId,
      entity_id: resolvedEntityId,
      party_id: resolvedVendorPartyId,
      vendor_party_id: resolvedVendorPartyId,
      source_module: "accounts_payable",
      source_id: data.id,
      source_document: "vendor_invoice",
      source_document_id: data.id,
      amount: resolvedTotalAmount,
      taxAmount: Number(taxAmount),
      currency_code: resolvedCurrencyCode,
      exchange_rate: Number(exchangeRate),
      entryDate: resolvedInvoiceDate,
      description:
        `Vendor Invoice ${resolvedInvoiceNumber}`,
    },
  });

  return data;
}
