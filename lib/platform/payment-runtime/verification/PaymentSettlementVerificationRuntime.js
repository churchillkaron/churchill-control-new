import {
  getPaymentSettlementVerifier,
  registerPaymentSettlementVerifier,
} from "./PaymentSettlementVerifierRegistry";

import {
  FinanceBankReconciliationVerifier,
} from "./verifiers/FinanceBankReconciliationVerifier";

let initialized = false;

function ensureVerifiers() {
  if (initialized) return;

  registerPaymentSettlementVerifier(
    FinanceBankReconciliationVerifier,
  );

  initialized = true;
}

function cleanText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export async function verifyPaymentSettlement({
  payment,
  verificationSource,
  sourceReference,
}) {
  ensureVerifiers();

  const source = cleanText(verificationSource)?.toLowerCase();
  const reference = cleanText(sourceReference);

  if (!source) {
    throw new Error("PAYMENT_VERIFICATION_SOURCE_REQUIRED");
  }

  if (!reference) {
    throw new Error("PAYMENT_SETTLEMENT_SOURCE_REFERENCE_REQUIRED");
  }

  const verifier = getPaymentSettlementVerifier(source);
  if (!verifier) {
    throw new Error("PAYMENT_SETTLEMENT_VERIFIER_UNAVAILABLE");
  }

  const evidence = await verifier.verify({
    payment,
    sourceReference: reference,
  });

  if (!evidence || typeof evidence !== "object") {
    throw new Error("PAYMENT_SETTLEMENT_EVIDENCE_INVALID");
  }

  return evidence;
}

export const PaymentSettlementVerificationRuntime = {
  verifyPaymentSettlement,
};
