import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { resolveOperatorCreativeProject } from "@/lib/creative/studio/OperatorCreativeProjectReferenceRuntime";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import {
  CreativeChatShotReferenceRuntime,
} from "@/lib/creative/studio/runtime/CreativeChatShotReferenceRuntime";
import {
  CreativeChatShotRevisionRuntime,
} from "@/lib/creative/revisions/runtime/CreativeChatShotRevisionRuntime";
import {
  CreativeProfessionalDirectionAuthorityRuntime,
} from "@/lib/creative/continuity/runtime/CreativeProfessionalDirectionAuthorityRuntime";

const REQUIRED_PERMISSION = "creative.mission.create";

function text(value, limit = 2400) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value)
    ? value.map((item) => text(item, 80).toLowerCase()).filter(Boolean)
    : [];
}

function verifiedDirection(shot = {}) {
  const authority = CreativeProfessionalDirectionAuthorityRuntime.authority(shot);
  return {
    shot_id: text(shot.id, 180),
    scene_id: text(shot.scene_id, 180) || null,
    scene_number: Number(shot.scene_number || 0) || null,
    shot_number: Number(shot.shot_number || 0) || null,
    title: text(shot.title, 500) || null,
    purpose: text(shot.purpose, 900) || null,
    revision_number: Number(shot.metadata?.revision_number || 0),
    direction_authority: text(shot.metadata?.direction_authority, 160) || null,
    professional_direction: {
      contract: text(authority.contract, 160) || null,
      human_authoritative:
        authority.human_authoritative === true ||
        CreativeProfessionalDirectionAuthorityRuntime.lockedFields(shot).length > 0,
      locked_fields: CreativeProfessionalDirectionAuthorityRuntime.lockedFields(shot),
      latest_changed_fields: Array.isArray(authority.latest_changed_fields)
        ? authority.latest_changed_fields.slice(0, 40)
        : [],
    },
  };
}

export const manifest = defineCapability({
  domain: "creative",
  capability: "studio",
  action: "reviseShot",
  description:
    "Apply one confirmed surgical direction revision to one exact server-resolved shot in a verified Creative Studio project from Chat. Accepts exact shot_id or natural shot_reference such as this shot, previous shot, next shot, shot 7, a title, or a visual/camera description. Relative references use only the server-verified anchor_shot_id. After revision the capability re-reads the canonical shot and returns its verified revision/lock state. Preserves Pro Studio human-authority locks, never widens craft scope, never generates media, never publishes, and does not authorize a later production run.",
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
    "reference-resolution",
    "verification",
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
      shot_reference: {
        type: "string",
        description:
          "Natural reference to one shot inside the verified project, for example this shot, previous shot, next shot, shot 7, a title, or a visual/camera description.",
      },
      anchor_shot_id: {
        type: "string",
        description:
          "Server-verified active shot from Creative context. Used only for relative references such as this/previous/next.",
      },
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
    required: ["instruction", "revision_scope"],
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
      shot_reference_resolution: { type: "string" },
      revision_scope: {
        type: "array",
        items: { type: "string" },
      },
      reason: { type: ["string", "null"] },
      adjacent_repairs: {
        type: "array",
        items: { type: "object", additionalProperties: true },
      },
      verified_direction: { type: "object", additionalProperties: true },
      professional_locks_preserved: { const: true },
      media_generation_executed: { const: false },
      publish_authorized: { const: false },
    },
    required: [
      "success",
      "creative_project_id",
      "shot_id",
      "shot_reference_resolution",
      "revision_scope",
      "verified_direction",
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
  if (!text(payload.shot_id, 180) && !text(payload.shot_reference, 1200)) {
    const error = new Error("CREATIVE_CHAT_REVISION_SHOT_REFERENCE_REQUIRED");
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

  const reference = await CreativeChatShotReferenceRuntime.resolve({
    organization_id: context.organizationId,
    creative_project_id: resolved.project.id,
    shot_id: text(payload.shot_id, 180) || null,
    shot_reference: text(payload.shot_reference, 1200) || null,
    anchor_shot_id: text(payload.anchor_shot_id, 180) || null,
  });

  const result = await CreativeChatShotRevisionRuntime.revise({
    organization_id: context.organizationId,
    creative_project_id: resolved.project.id,
    shot_id: reference.shot.id,
    instruction: text(payload.instruction, 1600),
    revision_scope: list(payload.revision_scope),
  });

  const canonicalShot = await ShotRuntime.get(reference.shot.id);
  if (!canonicalShot) {
    const error = new Error("CREATIVE_CHAT_REVISION_VERIFY_SHOT_NOT_FOUND");
    error.status = 500;
    throw error;
  }

  return {
    ...result,
    request_ref: resolved.request_ref || null,
    creative_project_id: resolved.project.id,
    shot_id: reference.shot.id,
    shot_reference: reference.reference,
    shot_reference_resolution: reference.resolution,
    selected_scene_id: text(canonicalShot.scene_id, 180) || null,
    selected_shot_number: Number(canonicalShot.shot_number || 0) || null,
    selected_shot_title: text(canonicalShot.title, 500) || null,
    selected_revision_number: Number(canonicalShot.metadata?.revision_number || 0),
    verified_direction: verifiedDirection(canonicalShot),
    verification: {
      source: "CANONICAL_SHOT_REREAD",
      verified_at: new Date().toISOString(),
      media_generation_executed: false,
      publish_authorized: false,
    },
    publish_authorized: false,
    media_generation_executed: false,
  };
}
