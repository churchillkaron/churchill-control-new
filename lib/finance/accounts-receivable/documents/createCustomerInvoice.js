import { randomUUID } from "node:crypto";
import { attachActionIdentityEvidence } from "@/lib/operator/runtime/ActionIdentityEvidenceRuntime.mjs";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { prepareAccountingEventJournal } from "@/lib/finance/general-ledger/workflows/prepareAccountingEventJournal";
import { resolveFinanceExchangeRate } from "@/lib/finance/currencies/FinanceExchangeRateResolver";

function optionalId(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export async function prepareCustomerInvoice({
  organization_id,
  entity_id,
  party_id,
  invoice_date,
  due_date,
  currency_code,
  exchange_rate = null,
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
  if (!resolvedCurrency) throw new Error("currency_code required");

  const finalInvoiceDate = invoice_date || new Date().toISOString().slice(0, 10);
  const finalDueDate = due_date || finalInvoiceDate;
  if (finalDueDate < finalInvoiceDate) {
    throw new Error("due_date cannot be before invoice_date");
  }

  let resolvedExchangeRate = Number(exchange_rate);
  if (!Number.isFinite(resolvedExchangeRate) || resolvedExchangeRate <= 0) {
    const rate = await resolveFinanceExchangeRate({
      organizationId: organization_id,
      entityId: entity_id,
      transactionCurrency: resolvedCurrency,
      effectiveDate: finalInvoiceDate,
    });
    resolvedExchangeRate = Number(rate.exchange_rate);
  }

  if (!Number.isFinite(resolvedExchangeRate) || resolvedExchangeRate <= 0) {
    throw new Error("exchange_rate must be positive");
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
    const discountAmount = Number(line.discount_amount || 0);
    const lineTaxAmount = Number(line.tax_amount || 0);

    if (!String(line.description || "").trim()) {
      throw new Error(`description required on line ${index + 1}`);
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`quantity must be positive on line ${index + 1}`);
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error(`unit_price must be valid on line ${index + 1}`);
    }
    if (!Number.isFinite(discountAmount) || discountAmount < 0) {
      throw new Error(`discount_amount must be valid on line ${index + 1}`);
    }
    if (!Number.isFinite(lineTaxAmount) || lineTaxAmount < 0) {
      throw new Error(`tax_amount must be valid on line ${index + 1}`);
    }

    const grossAmount = quantity * unitPrice;
    if (discountAmount > grossAmount) {
      throw new Error(`discount cannot exceed line amount on line ${index + 1}`);
    }

    return {
      item_id: optionalId(line.item_id),
      description: String(line.description || "").trim(),
      quantity,
      unit_price: unitPrice,
      discount_amount: discountAmount,
      line_total: grossAmount - discountAmount,
      tax_rule_id: optionalId(line.tax_rule_id || line.tax_code_id),
      tax_code_id: optionalId(line.tax_code_id || line.tax_rule_id),
      tax_amount: lineTaxAmount,
      revenue_account_id: optionalId(line.revenue_account_id),
      cost_center_id: optionalId(line.cost_center_id),
      department_id: optionalId(line.department_id),
      project_id: optionalId(line.project_id),
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
  if (totalAmount <= 0) {
    throw new Error("invoice total must be greater than zero");
  }

  const invoiceId = randomUUID();
  const resolvedIdempotencyKey = String(idempotency_key).trim();
  const resolvedPrefix = String(document_prefix || "INV").trim();
  const resolvedSourceDocumentType = hasSourceType
    ? String(source_document_type).trim().toUpperCase()
    : null;
  const resolvedSourceDocumentId = hasSourceId ? source_document_id : null;

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

  return {
    invoiceId,
    organizationId: organization_id,
    entityId: entity_id,
    partyId: party_id,
    invoiceDate: finalInvoiceDate,
    dueDate: finalDueDate,
    currencyCode: resolvedCurrency,
    exchangeRate: resolvedExchangeRate,
    subtotal,
    taxAmount,
    totalAmount,
    notes,
    lines: normalizedLines,
    journalLines: journal.lines,
    createdBy: created_by,
    idempotencyKey: resolvedIdempotencyKey,
    documentPrefix: resolvedPrefix,
    sourceDocumentType: resolvedSourceDocumentType,
    sourceDocumentId: resolvedSourceDocumentId,
  };
}

export default async function createCustomerInvoice(input) {
  const prepared = await prepareCustomerInvoice(input);

  let data; let error;
  try {
    ({ data, error } = await supabaseAdmin.rpc(
    "finance_create_customer_invoice_party_idempotent",
    {
      p_invoice_id: prepared.invoiceId,
      p_organization_id: prepared.organizationId,
      p_entity_id: prepared.entityId,
      p_party_id: prepared.partyId,
      p_invoice_date: prepared.invoiceDate,
      p_due_date: prepared.dueDate,
      p_currency_code: prepared.currencyCode,
      p_exchange_rate: prepared.exchangeRate,
      p_subtotal: prepared.subtotal,
      p_tax_amount: prepared.taxAmount,
      p_total_amount: prepared.totalAmount,
      p_notes: prepared.notes,
      p_lines: prepared.lines,
      p_journal_lines: prepared.journalLines,
      p_created_by: prepared.createdBy,
      p_idempotency_key: prepared.idempotencyKey,
      p_prefix: prepared.documentPrefix,
      p_source_document_type: prepared.sourceDocumentType,
      p_source_document_id: prepared.sourceDocumentId,
    }
    ));
  } catch (rpcError) {
    throw attachActionIdentityEvidence(rpcError, [`id:${prepared.invoiceId}`, `invoice_id:${prepared.invoiceId}`]);
  }

  if (error) {
    throw attachActionIdentityEvidence(new Error(`Idempotent customer invoice failed: ${error.message}`), [`id:${prepared.invoiceId}`, `invoice_id:${prepared.invoiceId}`]);
  }

  return {
    ...data,
    lines: prepared.lines,
  };
}
