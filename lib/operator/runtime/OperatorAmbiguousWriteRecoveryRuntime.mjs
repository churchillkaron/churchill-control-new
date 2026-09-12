export const OPERATOR_AMBIGUOUS_WRITE_RECOVERY = Object.freeze({
  PREBOUND_EXACT_ID: "PREBOUND_EXACT_ID",
  AUTHORITATIVE_RECOVERY_LOCATOR: "AUTHORITATIVE_RECOVERY_LOCATOR",
  UNCERTAIN_NO_REPLAY: "UNCERTAIN_NO_REPLAY",
});

const ALLOWED = new Set(Object.values(OPERATOR_AMBIGUOUS_WRITE_RECOVERY));

export function normalizeOperatorAmbiguousWriteRecovery(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return ALLOWED.has(normalized) ? normalized : null;
}
