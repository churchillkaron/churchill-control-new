import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  decideAvantiqoProductPersistence,
} from "@/lib/intelligence/runtime/AvantiqoProductPersistenceDecisionRuntime";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "platform.code.ai.execute";
const EXECUTION_KEY_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{11,159}$";

export function createProductPersistenceDecisionCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "product_persistence_decision",
    action: "assess",
    name: "Assess Verified Engineering Persistence",
    document: "product_persistence_decision",
    description:
      "Let Avantiqo-owned Product Intelligence inspect server-owned, independently verified Code AI engineering evidence for one opaque execution key and decide whether the result should remain local, request separately governed GitHub commit confirmation, or is already verified as persisted. This is read-only: it never grants commit authorization, commits code, deploys production, applies database migrations, or publishes anything.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: [
      "platform",
      "intelligence",
      "product-owner",
      "code-ai",
      "persistence-decision",
      "governance",
      "verification",
      "read",
      "local-first",
    ],
    operatorAliases: [
      "decide whether code ai changes should be committed",
      "should we persist the verified code changes",
      "decide whether this engineering result stays local",
      "prepare commit confirmation if the verified change belongs on main",
    ],
    transactional: false,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "read",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "low",
    reversible: true,
    inputSchema: {
      type: "object",
      required: ["execution_key"],
      properties: {
        execution_key: {
          type: "string",
          minLength: 12,
          maxLength: 160,
          pattern: EXECUTION_KEY_PATTERN,
          description:
            "Exact opaque execution key used by the verified Code AI autonomous engineering run.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        execution_key: { type: "string" },
        decision: { type: "string" },
        rationale: { type: ["string", "null"] },
        persistence: { type: "object" },
        continuation: { type: "object" },
        engineering_evidence: { type: "object" },
      },
      additionalProperties: true,
    },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_PERMISSION);
  }

  async function execute({ context, payload = {} }) {
    return decideAvantiqoProductPersistence({
      context,
      executionKey: payload.execution_key,
    });
  }

  return { manifest, authorize, execute };
}

export default createProductPersistenceDecisionCapability;
