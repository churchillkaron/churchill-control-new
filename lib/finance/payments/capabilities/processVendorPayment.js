import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { prepareAccountingEventJournal } from "@/lib/finance/general-ledger/workflows/prepareAccountingEventJournal";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function positiveAmount(value, field) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new Error(`${field} must be greater than zero`);
  }
  return resolved;
}

export default async function processVendorPayment({
  organization_id,
  entity_id,
  accounts_payable_id,
  amount,
  bank_account_id,
  payment_method = "BANK_TRANSFER",
  reference_number = null,
  paid_by,
  paid_at = null,
  currency_code = null,
  exchange_rate = null,
  idempotency_key,
}) {
  const organizationId = required(organization_id, "organization_id");
  const entityId = required(entity_id, "entity_id");
  const accountsPayableId = required(
    accounts_payable_id,
    "accounts_payable_id"
  );
  const bankAccountId = required(bank_account_id, "bank_account_id");
  const paidBy = required(paid_by, "authenticated paid_by");
  const idempotencyKey = required(idempotency_key, "idempotency_key");
  const paymentAmount = positiveAmount(amount, "amount");

  try {
    const { data: ap, error: apError } = await supabaseAdmin
      .from("accounts_payable")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("id", accountsPayableId)
      .single();

    if (apError) throw apError;

    if (ap.payment_hold) {
      throw new Error(
        `Accounts payable entry is on payment hold: ${ap.hold_reason || "approval required"}`
      );
    }

    let vendorInvoice = null;
    if (ap.vendor_invoice_id) {
      const { data, error } = await supabaseAdmin
        .from("vendor_invoices")
        .select("id, currency_code, exchange_rate")
        .eq("id", ap.vendor_invoice_id)
        .eq("organization_id", organizationId)
        .eq("entity_id", entityId)
        .maybeSingle();

      if (error) throw error;
      vendorInvoice = data;
    }

    let entity = null;
    if (!vendorInvoice?.currency_code && !currency_code) {
      const { data, error } = await supabaseAdmin
        .from("legal_entities")
        .select("id, currency")
        .eq("id", entityId)
        .eq("organization_id", organizationId)
        .single();

      if (error) throw error;
      entity = data;
    }

    const resolvedCurrency = required(
      currency_code ||
      vendorInvoice?.currency_code ||
      ap.currency_code ||
      entity?.currency,
      "currency_code"
    ).toUpperCase();
    const resolvedExchangeRate = positiveAmount(
      exchange_rate ?? vendorInvoice?.exchange_rate ?? ap.exchange_rate ?? 1,
      "exchange_rate"
    );
    const paymentId = randomUUID();
    const paidAt = paid_at || new Date().toISOString();

    const journal = await prepareAccountingEventJournal({
      event: {
        organization_id: organizationId,
        entity_id: entityId,
        event_type: "VENDOR_PAYMENT_POSTED",
        source_module: "accounts_payable",
        source_id: paymentId,
        payload: {
          organization_id: organizationId,
          entity_id: entityId,
          party_id: ap.vendor_party_id,
          vendor_party_id: ap.vendor_party_id,
          source_document: "vendor_payment",
          source_document_id: paymentId,
          amount: paymentAmount,
          currency_code: resolvedCurrency,
          exchange_rate: resolvedExchangeRate,
          entryDate: paidAt.slice(0, 10),
          description: `Vendor Payment ${reference_number || paymentId}`,
        },
      },
    });

    const { data, error } = await supabaseAdmin.rpc(
      "finance_post_vendor_payment_allocation_idempotent",
      {
        p_payment_id: paymentId,
        p_organization_id: organizationId,
        p_entity_id: entityId,
        p_accounts_payable_id: accountsPayableId,
        p_payment_amount: paymentAmount,
        p_bank_account_id: bankAccountId,
        p_payment_method: payment_method,
        p_reference_number: reference_number,
        p_paid_by: paidBy,
        p_paid_at: paidAt,
        p_currency_code: resolvedCurrency,
        p_exchange_rate: resolvedExchangeRate,
        p_journal_lines: journal.lines,
        p_idempotency_key: idempotencyKey,
      }
    );

    if (error) {
      throw new Error(`Vendor payment allocation failed: ${error.message}`);
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
