import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { prepareAccountingEventJournal } from "@/lib/finance/general-ledger/workflows/prepareAccountingEventJournal";

export default async function createCustomerInvoice({
  organization_id,
  entity_id,
  party_id,
  invoice_date,
  due_date,
  currency_code,
  exchange_rate = 1,
  lines = [],
  tax_amount = null,
  notes = null,
  created_by = null,
  idempotency_key,
  document_prefix = "INV",
  source_document_type = null,
  source_document_id = null,
}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!entity_id) throw new Error("entity_id required");
  if (!party_id) throw new Error("party_id required");
  if (!idempotency_key) throw new Error("idempotency_key required");
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("invoice lines required");
  }

  const resolvedCurrency = String(currency_code || "").trim().toUpperCase();
  const resolvedExchangeRate = Number(exchange_rate);
  if (!resolvedCurrency) throw new Error("currency_code required");
  if (!Number.isFinite(resolvedExchangeRate) || resolvedExchangeRate <= 0) {
    throw new Error("exchange_rate must be positive");
  }

  const finalInvoiceDate = invoice_date || new Date().toISOString().slice(0, 10);
  const finalDueDate = due_date || finalInvoiceDate;
  if (finalDueDate < finalInvoiceDate) {
    throw new Error("due_date cannot be before invoice_date");
  }

  const hasSourceType = Boolean(String(source_document_type || "").trim());
  const hasSourceId = Boolean(source_document_id);
  if (hasSourceType !== hasSourceId) {
    throw new Error(
      "source_document_type and source_document_id must be provided together"
    );
  }

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
      tax_amount: Number(line.tax_amount || 0),
    };
  });

  const subtotal = normalizedLines.reduce((sum, line) => sum + line.line_total, 0);
  const lineTaxAmount = normalizedLines.reduce(
    (sum, line) => sum + line.tax_amount,
    0
  );
  const taxAmount =
    tax_amount === null || tax_amount === undefined
      ? lineTaxAmount
      : Number(tax_amount);
  if (!Number.isFinite(taxAmount) || taxAmount < 0) {
    throw new Error("tax_amount must be valid");
  }

  const totalAmount = subtotal + taxAmount;
  const invoiceId = randomUUID();
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
        party_id,
        source_document: "customer_invoice",
        source_document_id: invoiceId,
        amount: totalAmount,
        taxAmount,
        currency_code: resolvedCurrency,
        exchange_rate: resolvedExchangeRate,
        entryDate: finalInvoiceDate,
        description: "Customer Invoice",
      },
    },
  });

  const { data, error } = await supabaseAdmin.rpc(
    "finance_create_customer_invoice_party_idempotent",
    {
      p_invoice_id: invoiceId,
      p_organization_id: organization_id,
      p_entity_id: entity_id,
      p_party_id: party_id,
      p_invoice_date: finalInvoiceDate,
      p_due_date: finalDueDate,
      p_currency_code: resolvedCurrency,
      p_exchange_rate: resolvedExchangeRate,
      p_subtotal: subtotal,
      p_tax_amount: taxAmount,
      p_total_amount: totalAmount,
      p_notes: notes,
      p_lines: normalizedLines,
      p_journal_lines: journal.lines,
      p_created_by: created_by,
      p_idempotency_key: String(idempotency_key).trim(),
      p_prefix: String(document_prefix || "INV").trim(),
      p_source_document_type: hasSourceType
        ? String(source_document_type).trim().toUpperCase()
        : null,
      p_source_document_id: hasSourceId ? source_document_id : null,
    }
  );

  if (error) {
    throw new Error(`Idempotent customer invoice failed: ${error.message}`);
  }

  return {
    ...data,
    lines: normalizedLines,
  };
}
