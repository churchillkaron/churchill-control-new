import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { generateDocumentNumber } from "@/lib/platform/documents/DocumentNumberService";
import { prepareAccountingEventJournal } from "@/lib/finance/general-ledger/workflows/prepareAccountingEventJournal";

export default async function createCustomerInvoice({
  organization_id,
  entity_id,
  customer_id,
  invoice_date,
  due_date,
  currency_code,
  exchange_rate = 1,
  lines = [],
  notes = null,
  created_by = null,
}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!entity_id) {
    throw new Error("entity_id required");
  }

  if (!customer_id) {
    throw new Error("customer_id required");
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("invoice lines required");
  }

  const resolvedCurrency = String(currency_code || "")
    .trim()
    .toUpperCase();
  const resolvedExchangeRate = Number(exchange_rate);

  if (!resolvedCurrency) {
    throw new Error("currency_code required");
  }

  if (!Number.isFinite(resolvedExchangeRate) || resolvedExchangeRate <= 0) {
    throw new Error("exchange_rate must be positive");
  }

  const finalInvoiceDate =
    invoice_date ||
    new Date().toISOString().slice(0, 10);
  const normalizedLines = lines.map((line, index) => {
    const quantity = Number(line.quantity || 0);
    const unitPrice = Number(line.unit_price || 0);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`quantity must be positive on line ${index + 1}`);
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error(`unit_price must be valid on line ${index + 1}`);
    }

    return {
      description: String(line.description || "").trim(),
      quantity,
      unit_price: unitPrice,
      line_total: quantity * unitPrice,
    };
  });
  const subtotal = normalizedLines.reduce(
    (sum, line) => sum + line.line_total,
    0
  );
  const taxAmount = normalizedLines.reduce(
    (sum, line) => sum + Number(line.tax_amount || 0),
    0
  );
  const totalAmount = subtotal + taxAmount;
  const invoiceId = randomUUID();
  const invoiceNumber = await generateDocumentNumber({
    organization_id,
    entity_id,
    document_type: "invoice",
    prefix: "INV",
  });
  const journal = await prepareAccountingEventJournal({
    event: {
      organization_id,
      entity_id,
      event_type: "CUSTOMER_INVOICE_CREATED",
      source_module: "accounts_receivable",
      source_id: invoiceId,
      payload: {
        organization_id,
        entity_id,
        party_id: customer_id,
        customer_id,
        source_document: "customer_invoice",
        source_document_id: invoiceId,
        amount: totalAmount,
        taxAmount,
        currency_code: resolvedCurrency,
        exchange_rate: resolvedExchangeRate,
        entryDate: finalInvoiceDate,
        description: `Customer Invoice ${invoiceNumber}`,
      },
    },
  });

  const { data, error } = await supabaseAdmin.rpc(
    "finance_create_customer_invoice_atomic",
    {
      p_invoice_id: invoiceId,
      p_organization_id: organization_id,
      p_entity_id: entity_id,
      p_customer_id: customer_id,
      p_invoice_number: invoiceNumber,
      p_invoice_date: finalInvoiceDate,
      p_due_date: due_date || null,
      p_currency_code: resolvedCurrency,
      p_exchange_rate: resolvedExchangeRate,
      p_subtotal: subtotal,
      p_tax_amount: taxAmount,
      p_total_amount: totalAmount,
      p_notes: notes,
      p_lines: normalizedLines,
      p_journal_lines: journal.lines,
      p_created_by: created_by,
    }
  );

  if (error) {
    throw new Error(`Atomic customer invoice failed: ${error.message}`);
  }

  return {
    ...data,
    lines: normalizedLines,
  };
}
