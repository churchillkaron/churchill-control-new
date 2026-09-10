import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { provePlatformRepairRegistryAuthority } from "@/lib/platform/self-healing/PlatformSelfHealingRegistryAuthorityRuntime.mjs";
import { preparePlatformSelfHealingCodeMission } from "@/lib/platform/self-healing/PlatformSelfHealingCodeResearchRuntime";
import { executePlatformSelfHealingCodeMission } from "@/lib/platform/self-healing/PlatformSelfHealingCodeExecutionRuntime";

const REQUIRED_PERMISSION = "platform.code.ai.execute";
const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

export function createBusinessPartnerSelfHealingCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "business_partner_self_healing",
    action: "execute",
    name: "Business Partner Self-Healing Escalation",
    description: "Escalate a Business Partner product-defect candidate through server-owned ERP_REGISTRY authority, fresh comparative research and canonical Code AI engineering without gaining commit, deploy or migration authority.",
    permissions: [REQUIRED_PERMISSION],
    operatorEnabled: false,
    aiEnabled: false,
    transactional: false,
    risk: "high",
    contextScope: "organization",
    inputSchema: { type: "object", additionalProperties: true },
    outputSchema: { type: "object", additionalProperties: true },
  });

  function authorize({ context }) { return requireExecutionPermission(context, REQUIRED_PERMISSION); }

  async function execute({ context, payload = {} }) {
    const failed = object(payload.failed_action);
    const capability = object(failed.capability);
    const authority = provePlatformRepairRegistryAuthority({
      route: payload.pathname,
      capability: capability.capability,
    });
    if (!authority.proven) {
      return { status: "REPAIR_AUTHORITY_REQUIRED", reason: authority.reason, engineering_started: false, authorization_effect: "NONE" };
    }
    const prepared = await preparePlatformSelfHealingCodeMission({
      context,
      payload: {
        failure_id: text(payload.failure_id, 240) || null,
        signal_key: text(payload.failure_id, 240) || null,
        problem_type: "business_partner_product_defect_candidate",
        category: "runtime_exception",
        source: "business_partner_recovery",
        title: `${capability.key || capability.capability || "Avantiqo capability"} failed during a governed Business Partner action`,
        error_class: text(payload.error_class, 300) || null,
        error_code: text(payload.error_code, 300) || null,
        capability: capability.capability || null,
        workspace: authority.evidence.workspace_id,
        route: authority.evidence.route,
        action: capability.action || null,
        classification: "AUTO_REPAIR",
        evidence: { authoritative_registry_proof: authority.evidence, diagnosis: text(payload.diagnosis, 500) || null },
        expected_contract: {
          capability: capability.capability || null,
          workspace: authority.evidence.workspace_id,
          action: capability.action || null,
          expected_outcome: text(payload.expected_outcome, 900) || "The original governed Business Partner action completes without reproducing the captured platform defect.",
          verification_requires_original_action_replay: true,
        },
      },
    });
    if (prepared.code_execution_allowed !== true || prepared.status !== "RESEARCHED_CODE_MISSION_READY") {
      return { status: prepared.status, prepared, engineering_started: false, authorization_effect: "NONE" };
    }
    const engineering = await executePlatformSelfHealingCodeMission({ context, prepared });
    return {
      status: engineering.status,
      prepared,
      engineering,
      engineering_started: engineering.code_execution_started === true,
      engineering_verified: engineering.engineering_verified === true,
      original_action: failed,
      original_goal: text(payload.original_goal, 4000) || null,
      replay_required: true,
      commit_performed: false,
      production_deploy_performed: false,
      migration_performed: false,
      authorization_effect: "SAME_ACTION_ONLY",
    };
  }
  return { manifest, authorize, execute };
}

export default createBusinessPartnerSelfHealingCapability;
