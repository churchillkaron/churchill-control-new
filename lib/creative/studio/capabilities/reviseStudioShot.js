import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { resolveOperatorCreativeProject } from "@/lib/creative/studio/OperatorCreativeProjectReferenceRuntime";
import {
  CreativeChatShotRevisionRuntime,
} from "@/lib/creative/revisions/runtime/CreativeChatShotRevisionRuntime";

const REQUIRED_PERMISSION = "creative.mission.create";

function text(value, limit = 2400) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value)
    ? value.map((item) => text(item, 80).toLowerCase()).filter(Boolean)
    : [];
}

export const manifest = defineCapability({
  domain: "creative",
  capability: "studio",
  action: "reviseShot",
  description:
    "Apply one confirmed surgical direction revision to one exact shot in a verified Creative Studio project from Chat. Preserves Pro Studio human-authority locks, never widens the requested craft scope, never generates media, never publishes, and does not authorize a later production run.",
  permissions: [REQUIRED_PERMISSION],
  events: ["creative.studio.shot.revised"],
  tags: [
    "creative",
    "video",
    "studio",
    "chat",
    "shot",
    "revision",
    "direction",
    "human-authority",
  ],
  transactional: true,
  aiEnabled: true,
  operatorEnabled: true,
  operatorMode: "write",
  operatorAutoExecute: false,
  operatorRequiresConfirmation: true,
  risk: "medium",
  reversible: false,
  approval: { required: false, boundary: "conversation_confirmation" },
  contextScope: "organization",
  inputSchema: {
    type: "object",
    properties: {
      request_ref: { type: "string" },
      creative_project_id: { type: "string" },
      shot_id: { type: "string" },
      instruction: { type: "string" },
      revision_scope: {
        type: "array",
        items: {
          type: "string",
          enum: ["camera", "coverage", "continuity", "performance", "edit"],
        },
        minItems: 1,
      },
    },
    required: ["shot_id", "instruction", "revision_scope"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      success: { type: "boolean" },
      contract: { type: "string" },
      request_ref: { type: ["string", "null"] },
      creative_project_id: { type: "string" },
      shot_id: { type: "string" },
      revision_scope: {
        type: "array",
        items: { type: "string" },
      },
      reason: { type: ["string", "null"] },
      adjacent_repairs: {
        type: "array",
        items: { type: "object", additionalProperties: true },
      },
      professional_locks_preserved: { const: true },
      media_generation_executed: { const: false },
      publish_authorized: { const: false },
    },
    required: [
      "success",
      "creative_project_id",
      "shot_id",
      "revision_scope",
      "professional_locks_preserved",
      "media_generation_executed",
      "publish_authorized",
    ],
  },
});

export function validate({ payload = {} }) {
  if (!text(payload.request_ref) && !text(payload.creative_project_id)) {
    const error = new Error("CREATIVE_OPERATOR_PROJECT_REFERENCE_REQUIRED");
    error.status = 400;
    throw error;
  }
  if (!text(payload.shot_id, 180)) {
    const error = new Error("CREATIVE_CHAT_REVISION_SHOT_ID_REQUIRED");
    error.status = 400;
    throw error;
  }
  if (!text(payload.instruction, 1600)) {
    const error = new Error("CREATIVE_CHAT_REVISION_INSTRUCTION_REQUIRED");
    error.status = 400;
    throw error;
  }
  if (!list(payload.revision_scope).length) {
    const error = new Error("CREATIVE_CHAT_REVISION_SCOPE_REQUIRED");
    error.status = 400;
    throw error;
  }
  return true;
}

export function authorize({ context }) {
  return requireExecutionPermission(context, REQUIRED_PERMISSION);
}

export async function execute({ context, payload = {} }) {
  const resolved = await resolveOperatorCreativeProject({
    organizationId: context.organizationId,
    creativeProjectId: payload.creative_project_id,
    requestRef: payload.request_ref,
  });

  const result = await CreativeChatShotRevisionRuntime.revise({
    organization_id: context.organizationId,
    creative_project_id: resolved.project.id,
    shot_id: text(payload.shot_id, 180),
    instruction: text(payload.instruction, 1600),
    revision_scope: list(payload.revision_scope),
  });

  return {
    ...result,
    request_ref: resolved.request_ref || null,
    creative_project_id: resolved.project.id,
    publish_authorized: false,
    media_generation_executed: false,
  };
}
