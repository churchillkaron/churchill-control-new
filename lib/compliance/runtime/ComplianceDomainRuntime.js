import { createComplianceAssetCreateCapability } from "@/lib/compliance/runtime/ComplianceAssetOperatorCapability";

export const ComplianceDomainRuntime = {
  domain: "compliance",
  name: "Compliance",
  version: "1.0.0",
  capabilities: { assets: { create: async () => createComplianceAssetCreateCapability() } },
};
export default ComplianceDomainRuntime;
