import { OPERATOR_AMBIGUOUS_WRITE_RECOVERY, normalizeOperatorAmbiguousWriteRecovery } from "./OperatorAmbiguousWriteRecoveryRuntime.mjs";
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
export function withOperatorVerification(capability, declaration, { ambiguousWriteRecovery = OPERATOR_AMBIGUOUS_WRITE_RECOVERY.UNCERTAIN_NO_REPLAY } = {}) {
  if (!capability || typeof capability !== "object" || !capability.manifest) return capability;
  const mode = String(capability.manifest.operatorMode || capability.manifest.operator_mode || "write").toLowerCase();
  if (["read", "navigate"].includes(mode)) return capability;
  const recovery = normalizeOperatorAmbiguousWriteRecovery(ambiguousWriteRecovery);
  if (!recovery) throw new Error("OPERATOR_AMBIGUOUS_WRITE_RECOVERY_INVALID");
  return { ...capability, manifest: Object.freeze({ ...capability.manifest, operatorVerification: object(declaration), operatorAmbiguousWriteRecovery: recovery }) };
}
export default withOperatorVerification;
