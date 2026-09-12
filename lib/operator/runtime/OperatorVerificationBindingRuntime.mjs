function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
export function withOperatorVerification(capability, declaration) {
  if (!capability || typeof capability !== "object" || !capability.manifest) return capability;
  const mode = String(capability.manifest.operatorMode || capability.manifest.operator_mode || "write").toLowerCase();
  if (["read", "navigate"].includes(mode)) return capability;
  return { ...capability, manifest: Object.freeze({ ...capability.manifest, operatorVerification: object(declaration) }) };
}
export default withOperatorVerification;
