const REGISTRY_KEY = "__AVANTIQO_PAYMENT_SETTLEMENT_VERIFIERS_V1__";

function state() {
  if (!globalThis[REGISTRY_KEY]) {
    globalThis[REGISTRY_KEY] = new Map();
  }
  return globalThis[REGISTRY_KEY];
}

function cleanKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function registerPaymentSettlementVerifier(verifier) {
  const key = cleanKey(verifier?.key);
  if (!key) {
    throw new Error("PAYMENT_SETTLEMENT_VERIFIER_KEY_REQUIRED");
  }

  if (typeof verifier?.verify !== "function") {
    throw new Error("PAYMENT_SETTLEMENT_VERIFIER_EXECUTOR_REQUIRED");
  }

  state().set(key, {
    ...verifier,
    key,
  });

  return key;
}

export function getPaymentSettlementVerifier(key) {
  return state().get(cleanKey(key)) || null;
}

export function listPaymentSettlementVerifiers() {
  return [...state().values()].map((verifier) => ({
    key: verifier.key,
    name: verifier.name || verifier.key,
  }));
}
