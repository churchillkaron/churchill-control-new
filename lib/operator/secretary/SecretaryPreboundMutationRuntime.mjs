import { attachActionIdentityEvidence } from "@/lib/operator/runtime/ActionIdentityEvidenceRuntime.mjs";

function text(value, limit = 500) {
  return String(value ?? "").trim().slice(0, limit);
}

export async function secretaryPreboundMutationResult(resultPromise, evidenceKey, evidenceValue) {
  const key = text(evidenceKey, 80).toLowerCase();
  const value = text(evidenceValue, 500);
  if (!key || !value) throw new Error("SECRETARY_PREBOUND_MUTATION_IDENTITY_REQUIRED");
  const result = await resultPromise;
  if (result?.error) throw attachActionIdentityEvidence(result.error, [`${key}:${value}`]);
  return result;
}

export default secretaryPreboundMutationResult;
