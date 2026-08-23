import { executeCodeAIMission } from "@/lib/code/runtime/CodeAIMissionRuntime";
import {
  attestCodeMissionState,
  verifyCodeMissionStateAttestation,
} from "@/lib/code/runtime/CodeMissionAttestationRuntime";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "platform.code.ai.execute";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function actorId(context = {}) {
  return text(context?.actor?.id || context?.actor?.user_id) || null;
}

function assertResumeScope(resumeState, context) {
  const resume = object(resumeState);
  if (!Object.keys(resume).length) return;
  verifyCodeMissionStateAttestation(resume);
  const organizationId = text(context?.organizationId);
  const expectedOrganizationId = text(resume.organization_id);
  const expectedActorId = text(resume.actor_id);
  const currentActorId = actorId(context);

  if (!expectedOrganizationId || expectedOrganizationId !== organizationId) {
    throw new Error("CODE_AI_MISSION_RESUME_ORGANIZATION_MISMATCH");
  }
  if (expectedActorId !== currentActorId) {
    throw new Error("CODE_AI_MISSION_RESUME_ACTOR_MISMATCH");
  }
}

export function createCodeAIMissionCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "code_ai_mission",
    action: "execute",
    description:
      "Run a bounded, isolated Avantiqo Code AI repository mission. It can inspect, search, read, edit an ephemeral workspace, run development commands, test, preserve attested repair state, and return a verified patch. It cannot push, deploy, publish, or execute database tooling.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: ["platform", "code-ai", "repository", "mission", "sandbox", "development", "attested"],
    transactional: false,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "write",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    risk: "low",
    reversible: true,
    inputSchema: {
      type: "object",
      required: ["objective", "repository_url", "operations"],
      properties: {
        objective: { type: "string", minLength: 1, maxLength: 4000 },
        repository_url: { type: "string", minLength: 1, maxLength: 500 },
        ref: { type: "string", maxLength: 160, default: "main" },
        operations: {
          type: "array",
          minItems: 1,
          maxItems: 24,
          items: {
            type: "object",
            required: ["action"],
            properties: {
              id: { type: "string", maxLength: 160 },
              action: {
                type: "string",
                enum: ["inspect", "search", "read", "apply_files", "run", "verify", "diff"],
              },
              description: { type: "string", maxLength: 1000 },
              input: { type: "object" },
            },
            additionalProperties: false,
          },
        },
        resume_state: { type: "object" },
        timeout_ms: { type: "integer", minimum: 30000, maximum: 1200000 },
      },
      additionalProperties: false,
    },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_PERMISSION);
  }

  async function execute({ context, payload = {} }) {
    assertResumeScope(payload.resume_state, context);
    const result = await executeCodeAIMission({
      objective: payload.objective,
      repository_url: payload.repository_url,
      ref: payload.ref || "main",
      operations: payload.operations,
      resume_state: payload.resume_state || null,
      timeout_ms: payload.timeout_ms || null,
    });

    if (result?.state) {
      result.state = attestCodeMissionState({
        ...result.state,
        organization_id: context.organizationId,
        actor_id: actorId(context),
      });
    }

    return result;
  }

  return { manifest, authorize, execute };
}

export default createCodeAIMissionCapability;
