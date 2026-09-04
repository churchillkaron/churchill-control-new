import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { resolveOperatorCreativeProject } from "@/lib/creative/studio/OperatorCreativeProjectReferenceRuntime";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import {
  CreativeAtomicShotSetRevisionRuntime,
} from "@/lib/creative/revisions/runtime/CreativeAtomicShotSetRevisionRuntime";
import {
  CreativeProfessionalDirectionAuthorityRuntime,
} from "@/lib/creative/continuity/runtime/CreativeProfessionalDirectionAuthorityRuntime";

const REQUIRED_PERMISSION = "creative.mission.create";

function text(value, limit = 2400) {
  return String(value ?? "").trim().slice(0, limit);
}

function verifiedShot(shot = {}) {
  return {
    shot_id: text(shot.id, 180),
    scene_id: text(shot.scene_id, 180) || null,
    scene_number: Number(shot.scene_number || 0) || null,
    shot_number: Number(shot.shot_number || 0) || null,
    title: text(shot.title, 500) || null,
    revision_number: Number(shot.metadata?.revision_number || 0),
    professional_locked_fields:
      CreativeProfessionalDirectionAuthorityRuntime.lockedFields(shot),
  };
}

export const manifest = defineCapability({
  domain: "creative",
  capability: "studio",
  action: "restoreShotSetRevision",
  description:
    "Restore one exact server-verified multi-shot directing checkpoint after explicit conversational confirmation. Designed for natural commands such as undo that or restore the last directing change. The checkpoint restore is atomic and fails closed when any affected shot has changed since the checkpoint, preventing an undo from overwriting newer work. Never reasons with AI, generates media, publishes, or authorizes production.",
  permissions: [REQUIRED_PERMISSION],
  events: ["creative.studio.shot_set.restored"],
  tags: [
    "creative",
    "video",
    "chat",
    "multi-shot",
    "undo",
    "restore",
    "checkpoint",
    "atomic",
    "human-confirmation",
  ],
  transactional: true,
  aiEnabled: false,
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
      checkpoint_id: {
        type: "string",
        description:
          "Server-verified checkpoint from the previous atomic multi-shot directing execution. Chat must never invent this value.",
      },
      anchor_shot_id: {
        type: "string",
        description:
          "Optional server-verified active shot. Used only to return a precise post-restore conversational anchor.",
      },
    },
    required: ["checkpoint_id"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      success: { type: "boolean" },
      creative_project_id: { type: "string" },
      request_ref: { type: ["string", "null"] },
      checkpoint_id: { type: "string" },
      restored_shot_count: { type: "number" },
      selected_shot_id: { type: ["string", "null"] },
      selected_scene_id: { type: ["string", "null"] },
      selected_shot_number: { type: ["number", "null"] },
      selected_shot_title: { type: ["string", "null"] },
      selected_revision_number: { type: ["number", "null"] },
      verification: { type: "object", additionalProperties: true },
      atomic_restore: { const: true },
      media_generation_executed: { const: false },
      publish_authorized: { const: false },
    },
    required: [
      "success",
      "creative_project_id",
      "checkpoint_id",
      "restored_shot_count",
      "atomic_restore",
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
  if (!text(payload.checkpoint_id, 180)) {
    const error = new Error("CREATIVE_DIRECTION_CHECKPOINT_REQUIRED");
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

  const checkpointId = text(payload.checkpoint_id, 180);
  const restored = await CreativeAtomicShotSetRevisionRuntime.restore({
    organization_id: context.organizationId,
    creative_project_id: resolved.project.id,
    checkpoint_id: checkpointId,
  });

  const projectShots = await ShotRuntime.list({
    organization_id: context.organizationId,
    creative_project_id: resolved.project.id,
  });
  const anchorId = text(payload.anchor_shot_id, 180);
  const anchor = anchorId
    ? projectShots.find((shot) => text(shot.id, 180) === anchorId) || null
    : null;
  const verifiedAnchor = anchor ? verifiedShot(anchor) : null;

  return {
    success: true,
    contract: "AVANTIQO_CHAT_MULTI_SHOT_RESTORE_V1",
    request_ref: resolved.request_ref || null,
    creative_project_id: resolved.project.id,
    checkpoint_id: checkpointId,
    restored_shot_count: Number(restored.restored_shot_count || 0),
    selected_shot_id: verifiedAnchor?.shot_id || null,
    selected_scene_id: verifiedAnchor?.scene_id || null,
    selected_shot_number: verifiedAnchor?.shot_number || null,
    selected_shot_title: verifiedAnchor?.title || null,
    selected_revision_number: verifiedAnchor?.revision_number ?? null,
    verification: {
      source: "CANONICAL_POST_CHECKPOINT_RESTORE",
      verified_at: new Date().toISOString(),
      active_shot: verifiedAnchor,
      checkpoint_id: checkpointId,
      atomic_restore: true,
      media_generation_executed: false,
      publish_authorized: false,
    },
    atomic_restore: true,
    media_generation_executed: false,
    publish_authorized: false,
  };
}
