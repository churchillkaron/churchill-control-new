import {
  PaymentTransactionRepository,
} from "../repositories/PaymentTransactionRepository";

import {
  WalletRuntime,
} from "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime";

function cleanText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function cleanCurrency(value) {
  const normalized = cleanText(value);
  return normalized ? normalized.toUpperCase() : null;
}

function positiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("PAYMENT_SETTLEMENT_AMOUNT_INVALID");
  }
  return amount;
}

function sameAmount(left, right) {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
}

function settlementTime(value) {
  const input = cleanText(value);
  if (!input) throw new Error("PAYMENT_SETTLEMENT_TIME_REQUIRED");

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error("PAYMENT_SETTLEMENT_TIME_INVALID");
  }

  return date.toISOString();
}

function assertSettlementEvidence(payment, evidence = {}) {
  if (!payment?.id || !payment?.organization_id) {
    throw new Error("PAYMENT_NOT_FOUND");
  }

  const providerReference = cleanText(evidence.provider_reference);
  const provider = cleanText(evidence.provider);
  const verificationSource = cleanText(evidence.verification_source);
  const currency = cleanCurrency(evidence.currency);
  const amount = positiveAmount(evidence.amount);
  const paidAt = settlementTime(evidence.settled_at);

  if (!providerReference) {
    throw new Error("PAYMENT_PROVIDER_REFERENCE_REQUIRED");
  }

  if (!provider) {
    throw new Error("PAYMENT_PROVIDER_REQUIRED");
  }

  if (!verificationSource) {
    throw new Error("PAYMENT_VERIFICATION_SOURCE_REQUIRED");
  }

  if (cleanText(payment.provider) !== provider) {
    throw new Error("PAYMENT_PROVIDER_MISMATCH");
  }

  if (!sameAmount(payment.amount, amount)) {
    throw new Error("PAYMENT_SETTLEMENT_AMOUNT_MISMATCH");
  }

  if (cleanCurrency(payment.currency) !== currency) {
    throw new Error("PAYMENT_SETTLEMENT_CURRENCY_MISMATCH");
  }

  const existingReference = cleanText(payment.provider_reference);
  if (existingReference && existingReference !== providerReference) {
    throw new Error("PAYMENT_PROVIDER_REFERENCE_MISMATCH");
  }

  const status = cleanText(payment.status)?.toLowerCase();
  if (["failed", "cancelled", "canceled", "refunded", "void", "voided"].includes(status)) {
    throw new Error("PAYMENT_STATUS_NOT_SETTLEABLE");
  }

  return {
    provider_reference: providerReference,
    provider,
    verification_source: verificationSource,
    amount,
    currency,
    settled_at: paidAt,
    metadata:
      evidence.metadata && typeof evidence.metadata === "object" && !Array.isArray(evidence.metadata)
        ? evidence.metadata
        : {},
  };
}

export async function confirmPayment({
  paymentId,
  evidence = {},
}) {
  const payment = await PaymentTransactionRepository.get(paymentId);
  const settlement = assertSettlementEvidence(payment, evidence);

  // Credit first. Wallet settlement is idempotent on payment id, so a retry after
  // a later payment-row update failure cannot double-credit the organization.
  await WalletRuntime.topup({
    organization_id: payment.organization_id,
    amount: payment.amount,
    currency: payment.currency,
    reference: payment.id,
    provider: payment.provider || null,
    idempotency_key: payment.id,
    metadata: {
      payment_id: payment.id,
      payment_method: payment.payment_method,
      provider: payment.provider,
      provider_reference: settlement.provider_reference,
      verification_source: settlement.verification_source,
      settlement_evidence: settlement.metadata,
    },
  });

  const alreadyCompleted = cleanText(payment.status)?.toLowerCase() === "completed";
  if (
    alreadyCompleted &&
    cleanText(payment.provider_reference) === settlement.provider_reference &&
    cleanText(payment.paid_at)
  ) {
    return payment;
  }

  return PaymentTransactionRepository.update(
    paymentId,
    {
      status: "completed",
      provider_reference: settlement.provider_reference,
      paid_at: settlement.settled_at,
      metadata: {
        ...(payment.metadata && typeof payment.metadata === "object" ? payment.metadata : {}),
        settlement: {
          provider: settlement.provider,
          provider_reference: settlement.provider_reference,
          verification_source: settlement.verification_source,
          amount: settlement.amount,
          currency: settlement.currency,
          settled_at: settlement.settled_at,
          evidence: settlement.metadata,
        },
      },
    },
  );
}

export const PaymentConfirmationRuntime = {
  confirmPayment,
};
