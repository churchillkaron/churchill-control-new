const PRIVILEGED_CLASSIFICATIONS = new Set([
  "AUTO_REPAIR",
  "AUTO_COMPLETE",
]);

function normalizedClassification(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function resolvePrivilegedSelfHealingClassification(
  payload = {},
  authoritativeClassification = null,
) {
  const requestedClassification = normalizedClassification(payload?.classification);
  if (!PRIVILEGED_CLASSIFICATIONS.has(requestedClassification)) return null;

  const authoritative = authoritativeClassification && typeof authoritativeClassification === "object"
    ? authoritativeClassification
    : null;
  if (
    authoritative &&
    normalizedClassification(authoritative.classification) === requestedClassification &&
    authoritative.code_execution_allowed === true
  ) {
    return authoritative;
  }

  const blockingStatus = requestedClassification === "AUTO_COMPLETE"
    ? "REGISTRY_PROOF_REQUIRED"
    : "REPAIR_AUTHORITY_REQUIRED";

  return {
    classification: requestedClassification,
    reason: requestedClassification === "AUTO_COMPLETE"
      ? "Explicit AUTO_COMPLETE is blocked because canonical ERP_REGISTRY incompleteness was not independently proven by the server-owned self-healing boundary."
      : "Explicit AUTO_REPAIR is blocked because canonical ERP_REGISTRY repair authority was not independently proven by the server-owned self-healing boundary.",
    research_required: false,
    code_execution_allowed: false,
    authority_source: null,
    authority_required: "ERP_REGISTRY",
    blocking_status: blockingStatus,
  };
}

export const PlatformSelfHealingClassificationAuthorityRuntime = Object.freeze({
  privileged_classifications: Object.freeze([...PRIVILEGED_CLASSIFICATIONS]),
  resolve: resolvePrivilegedSelfHealingClassification,
});

export default resolvePrivilegedSelfHealingClassification;
