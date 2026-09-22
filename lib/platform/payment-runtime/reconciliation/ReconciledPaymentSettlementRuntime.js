import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { PaymentConfirmationRuntime } from "../confirmation/PaymentConfirmationRuntime";

function clean(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

async function reconciledLedgerMatches(payment) {
  const reference = clean(payment.payment_reference) || clean(payment.id);
  if (!reference) return [];

  let query = supabaseAdmin
    .from("bank_ledger")
    .select(
      "id,organization_id,entity_id,bank_account_id,amount,direction,currency_code,reference_number,reconciled_statement_id,reconciled_at",
    )
    .eq("organization_id", payment.organization_id)
    .eq("reference_number", reference)
    .not("reconciled_statement_id", "is", null)
    .not("reconciled_at", "is", null)
    .order("reconciled_at", { ascending: true })
    .limit(2);

  if (payment.entity_id) {
    query = query.eq("entity_id", payment.entity_id);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function reconcileSettledBankPayments({ limit = 200 } = {}) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 200, 1000));

  const { data: payments, error } = await supabaseAdmin
    .from("payments")
    .select(
      "id,organization_id,entity_id,party_id,payment_method,provider,amount,currency,status,payment_reference,provider_reference,paid_at,metadata,created_at",
    )
    .in("provider", ["bank_transfer", "promptpay"])
    .in("payment_method", ["bank_transfer", "qr_payment"])
    .in("status", ["pending", "PENDING"])
    .order("created_at", { ascending: true })
    .limit(boundedLimit);

  if (error) throw error;

  const result = {
    success: true,
    inspected: 0,
    settled: 0,
    unmatched: 0,
    ambiguous: 0,
    failed: 0,
    failures: [],
  };

  for (const payment of payments || []) {
    result.inspected += 1;

    try {
      if (
        !payment?.id ||
        !payment?.organization_id ||
        !["bank_transfer", "promptpay"].includes(lower(payment.provider))
      ) {
        result.failed += 1;
        result.failures.push({
          payment_id: payment?.id || null,
          error: "PAYMENT_SETTLEMENT_SCOPE_INVALID",
        });
        continue;
      }

      const matches = await reconciledLedgerMatches(payment);

      if (!matches.length) {
        result.unmatched += 1;
        continue;
      }

      if (matches.length !== 1) {
        result.ambiguous += 1;
        continue;
      }

      await PaymentConfirmationRuntime.confirmPayment({
        paymentId: payment.id,
        verificationSource: "finance.bank_reconciliation",
        sourceReference: matches[0].id,
      });

      result.settled += 1;
    } catch (settlementError) {
      result.failed += 1;
      result.failures.push({
        payment_id: payment.id,
        error:
          settlementError?.message ||
          "PAYMENT_BANK_RECONCILIATION_SETTLEMENT_FAILED",
      });
    }
  }

  return result;
}

export const ReconciledPaymentSettlementRuntime = {
  reconcile: reconcileSettledBankPayments,
};
