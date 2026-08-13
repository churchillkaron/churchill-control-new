import { OrganizationSystemHealthRuntime } from "@/lib/health/OrganizationSystemHealthRuntime";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "platform.system.health.view";

function text(value) {
  return String(value ?? "").trim();
}

export function createSystemHealthCapability({
  action,
  phase,
  description,
}) {
  const manifest = defineCapability({
    domain: "platform",
    capability: "system",
    action,
    description,
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: ["platform", "system", "health", "diagnosis", phase, "read"],
    transactional: false,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "read",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    risk: "low",
    reversible: true,
    inputSchema: {
      type: "object",
      properties: {
        previous_snapshot_id: {
          type: "string",
          description:
            "For verification, the prior system snapshot id being followed up.",
        },
        reason: {
          type: "string",
          description: "Short reason for this inspection or verification.",
        },
      },
      additionalProperties: false,
    },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_PERMISSION);
  }

  async function execute({ context, payload = {} }) {
    const snapshot = await OrganizationSystemHealthRuntime.inspect({
      organizationId: context.organizationId,
      entityId: context.entityId,
      periodId: context.periodId,
      actorId: context.actor?.id || context.actor?.user_id || null,
      permissions: context.permissions,
      phase,
    });

    return {
      ...snapshot,
      verification_of:
        phase === "verification"
          ? text(payload.previous_snapshot_id) || null
          : null,
      requested_reason: text(payload.reason) || null,
    };
  }

  return { manifest, authorize, execute };
}

export default createSystemHealthCapability;
