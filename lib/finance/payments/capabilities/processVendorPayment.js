import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { prepareAccountingEventJournal } from "@/lib/finance/general-ledger/workflows/prepareAccountingEventJournal";

function uuidOrNull(value) {
  const normalized = String(value || "").trim();

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

export default async function processVendorPayment({
  organization_id,
  entity_id,
  accounts_payable_id,
  payment_method = "BANK_TRANSFER",
  paid_by = null,
  paid_at = null,
  currency_code = null,
  exchange_rate = null,
  idempotency_key,
}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!entity_id) {
    throw new Error("entity_id required");
  }

  if (!accounts_payable_id) {
    throw new Error("accounts_payable_id required");
  }

  if (!idempotency_key) {
    throw new Error("idempotency_key required");
  }

  try {
    const { data: ap, error: apError } = await supabaseAdmin
      .from("accounts_payable")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("entity_id", entity_id)
      .eq("id", accounts_payable_id)
      .single();

    if (apError) {
      throw apError;
    }

    let vendorInvoice = null;

    if (ap.vendor_invoice_id) {
      const { data, error } = await supabaseAdmin
        .from("vendor_invoices")
        .select("id, currency_code, exchange_rate")
        .eq("id", ap.vendor_invoice_id)
        .eq("organization_id", organization_id)
        .eq("entity_id", entity_id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      vendorInvoice = data;
    }

    let entity = null;

    if (!vendorInvoice?.currency_code && !currency_code) {
      const { data, error } = await supabaseAdmin
        .from("legal_entities")
        .select("id, currency")
        .eq("id", entity_id)
        .eq("organization_id", organization_id)
        .single();

      if (error) {
        throw error;
      }

      entity = data;
    }

    const resolvedCurrency = String(
      currency_code ||
      vendorInvoice?.currency_code ||
      entity?.currency ||
      ""
    )
      .trim()
      .toUpperCase();
    const resolvedExchangeRate = Number(
      exchange_rate ??
      vendorInvoice?.exchange_rate ??
      1
    );

    if (!resolvedCurrency) {
      throw new Error("currency_code required");
    }

    if (!Number.isFinite(resolvedExchangeRate) || resolvedExchangeRate <= 0) {
      throw new Error("exchange_rate must be positive");
    }

    const paymentAmount = Number(ap.amount || 0);

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      throw new Error("Accounts payable amount must be greater than zero");
    }

    const paymentId = randomUUID();
    const paidAt = paid_at || new Date().toISOString();
    const createdBy = uuidOrNull(paid_by);
    const journal = await prepareAccountingEventJournal({
      event: {
        organization_id,
        entity_id,
        event_type: "VENDOR_PAYMENT_POSTED",
        source_module: "accounts_payable",
        source_id: paymentId,
        payload: {
          organization_id,
          entity_id,
          party_id: ap.vendor_party_id,
          vendor_party_id: ap.vendor_party_id,
          source_document: "vendor_payment",
          source_document_id: paymentId,
          amount: paymentAmount,
          currency_code: resolvedCurrency,
          exchange_rate: resolvedExchangeRate,
          entryDate: paidAt.slice(0, 10),
          description: `Vendor Payment ${paymentId}`,
        },
      },
    });

    const { data, error } = await supabaseAdmin.rpc(
      "finance_post_vendor_payment_idempotent",
      {
        p_payment_id: paymentId,
        p_organization_id: organization_id,
        p_entity_id: entity_id,
        p_accounts_payable_id: accounts_payable_id,
        p_payment_method: payment_method,
        p_paid_by: createdBy,
        p_paid_at: paidAt,
        p_currency_code: resolvedCurrency,
        p_exchange_rate: resolvedExchangeRate,
        p_journal_lines: journal.lines,
        p_idempotency_key: String(idempotency_key).trim(),
      }
    );

    if (error) {
      throw new Error(`Idempotent vendor payment failed: ${error.message}`);
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
