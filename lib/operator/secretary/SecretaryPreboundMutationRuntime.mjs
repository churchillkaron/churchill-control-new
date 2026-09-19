import { attachActionIdentityEvidence } from "@/lib/operator/runtime/ActionIdentityEvidenceRuntime.mjs";

function text(value, limit = 500) {
  return String(value ?? "").trim().slice(0, limit);
}

export async function secretaryRecoveryMutationResult(resultPromise, evidenceEntries = []) {
  const entries = Array.isArray(evidenceEntries) ? evidenceEntries : [];
  const evidence = entries.map(([rawKey, rawValue]) => {
    const key = text(rawKey, 80).toLowerCase();
    const value = text(rawValue, 500);
    if (!key || !value) throw new Error("SECRETARY_RECOVERY_MUTATION_IDENTITY_REQUIRED");
    return `${key}:${value}`;
  });
  if (!evidence.length) throw new Error("SECRETARY_RECOVERY_MUTATION_IDENTITY_REQUIRED");
  const result = await resultPromise;
  if (result?.error) throw attachActionIdentityEvidence(result.error, evidence);
  return result;
}

export async function secretaryPreboundMutationResult(resultPromise, evidenceKey, evidenceValue) {
  return secretaryRecoveryMutationResult(resultPromise, [[evidenceKey, evidenceValue]]);
}

export default secretaryPreboundMutationResult;
