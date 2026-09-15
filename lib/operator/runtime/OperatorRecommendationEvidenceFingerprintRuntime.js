import { createHash } from "node:crypto";

export const OPERATOR_RECOMMENDATION_EVIDENCE_FINGERPRINT_CONTRACT =
  "AVANTIQO_OPERATOR_RECOMMENDATION_EVIDENCE_FINGERPRINT_V1";

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined && typeof value[key] !== "function")
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value ?? null;
}

export function operatorRecommendationEvidenceFingerprint(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue(value ?? null)))
    .digest("hex");
}

export const OperatorRecommendationEvidenceFingerprintRuntime = Object.freeze({
  contract: OPERATOR_RECOMMENDATION_EVIDENCE_FINGERPRINT_CONTRACT,
  fingerprint: operatorRecommendationEvidenceFingerprint,
  raw_evidence_persisted: false,
  authorization_effect: "NONE",
});
