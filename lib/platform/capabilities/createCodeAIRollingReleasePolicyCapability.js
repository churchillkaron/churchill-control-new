import {
  getVercelRollingReleasePolicy,
  verifyVercelRollingReleasePolicy,
  configureVercelRollingReleasePolicy,
} from "@/lib/platform/runtime/AvantiqoProductionReleaseRuntime";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "platform.deploy.production";
export function createCodeAIRollingReleasePolicyCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "code_ai_rolling_release_policy",
    action: "execute",
    description: "Read or explicitly configure the Vercel production rolling-release safety policy used by Avantiqo Code: 5/25/100 staged traffic, manual approvals, and an active automatic 5xx health gate that rolls back on failure.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: ["platform", "code-ai", "vercel", "rolling-release", "automatic-rollback", "owner-confirmation"],
    transactional: false,
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: "write",
    operatorAutoExecute: false,
    operatorRequiresConfirmation: true,
    contextScope: "organization",
    risk: "high",
    reversible: true,
    inputSchema: {
      type: "object",
      required: ["operation"],
      properties: { operation: { type: "string", enum: ["status", "configure"] } },
      additionalProperties: false,
    },
  });
  function authorize({ context }) { return requireExecutionPermission(context, REQUIRED_PERMISSION); }
  async function execute({ payload = {} }) {
    if (payload.operation === "status") {
      const current = await getVercelRollingReleasePolicy();
      let verification = null;
      let compliant = false;
      let error = null;
      try { verification = await verifyVercelRollingReleasePolicy(); compliant = true; }
      catch (policyError) { error = String(policyError?.message || policyError); }
      return { success: true, operation: "status", current, compliant, verification, error, production_mutation_performed: false };
    }
    if (payload.operation !== "configure") throw new Error("CODE_AI_ROLLING_RELEASE_POLICY_OPERATION_INVALID");
    const configured = await configureVercelRollingReleasePolicy();
    return { success: true, operation: "configure", configured, production_mutation_performed: true };
  }
  return { manifest, authorize, execute };
}
export default createCodeAIRollingReleasePolicyCapability;
