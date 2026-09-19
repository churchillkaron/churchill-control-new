export const OPERATOR_EXECUTION_BOUNDARY_CONTRACT = "AVANTIQO_OPERATOR_EXECUTION_BOUNDARY_V1";

const BOUNDARY_KINDS = new Set(["ORCHESTRATION", "SERVER_GOVERNED_EXTERNAL_WRITE"]);

export function createOperatorExecutionBoundary({ kind = "ORCHESTRATION", completion = "NESTED_SERVER_VERIFICATION" } = {}) {
  if (!BOUNDARY_KINDS.has(kind)) throw new Error("OPERATOR_EXECUTION_BOUNDARY_KIND_INVALID");
  const allowedCompletion = new Set(["NESTED_SERVER_VERIFICATION", "SERVER_OWNED_INTERNAL_VERIFICATION"]);
  if (!allowedCompletion.has(completion)) throw new Error("OPERATOR_EXECUTION_BOUNDARY_COMPLETION_INVALID");
  return Object.freeze({
    contract: OPERATOR_EXECUTION_BOUNDARY_CONTRACT,
    kind,
    completion,
    business_record_verification_required: false,
    mutation_replay_authority: false,
    authorization_effect: "NONE",
  });
}

export function normalizeOperatorExecutionBoundary(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (raw.contract !== OPERATOR_EXECUTION_BOUNDARY_CONTRACT) return null;
  if (!BOUNDARY_KINDS.has(raw.kind)) return null;
  if (!["NESTED_SERVER_VERIFICATION", "SERVER_OWNED_INTERNAL_VERIFICATION"].includes(raw.completion)) return null;
  if (raw.business_record_verification_required !== false) return null;
  if (raw.mutation_replay_authority !== false) return null;
  if (raw.authorization_effect !== "NONE") return null;
  return Object.freeze({
    contract: raw.contract, kind: raw.kind, completion: raw.completion,
    business_record_verification_required: false, mutation_replay_authority: false, authorization_effect: "NONE",
  });
}

export function withOperatorExecutionBoundary(capability, boundary = createOperatorExecutionBoundary()) {
  if (!capability || typeof capability !== "object" || !capability.manifest) return capability;
  const mode = String(capability.manifest.operatorMode || capability.manifest.operator_mode || "write").toLowerCase();
  if (mode === "read" || mode === "navigate") return capability;
  return { ...capability, manifest: Object.freeze({ ...capability.manifest, operatorExecutionBoundary: boundary }) };
}

export async function loadWithOperatorExecutionBoundary(loader, boundary = createOperatorExecutionBoundary()) {
  const loaded = await loader();
  return withOperatorExecutionBoundary(loaded, boundary);
}
