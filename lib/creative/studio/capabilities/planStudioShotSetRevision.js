import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { resolveOperatorCreativeProject } from "@/lib/creative/studio/OperatorCreativeProjectReferenceRuntime";
import {
  CreativeChatShotSetRuntime,
} from "@/lib/creative/studio/runtime/CreativeChatShotSetRuntime";

const REQUIRED_PERMISSION = "creative.mission.create";

function text(value, limit = 2400) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export const manifest = defineCapability({
  domain: "creative",
  capability: "studio",
  action: "planShotSetRevision",
  description:
    "Create a read-only, server-verified multi-shot directing plan before any mutation. Resolves exact shot sets such as shots 4-6, this scene, scene 3, explicit shot IDs, or natural shot references; snapshots revision numbers; surfaces Pro Studio lock conflicts; and returns a deterministic plan fingerprint required by the confirmed execution step. Never revises shots, generates media, spends wallet balance, or publishes.",
  permissions: [REQUIRED_PERMISSION],
  events: [],
  tags: ["creative", "video", "chat", "multi-shot", "plan", "direction", "governance"],
  transactional: false,
  aiEnabled: true,
  operatorEnabled: true,
  operatorMode: "read",
  operatorAutoExecute: true,
  operatorRequiresConfirmation: false,
  risk: "low",
  reversible: true,
  approval: "none",
  contextScope: "organization",
  inputSchema: {
    type: "object",
    properties: {
      request_ref: { type: "string" },
      creative_project_id: { type: "string" },
      shot_ids: { type: "array", items: { type: "string" } },
      shot_references: { type: "array", items: { type: "string" } },
      shot_set_reference: { type: "string" },
      anchor_shot_id: { type: "string" },
      instruction: { type: "string" },
      revision_scope: {
        type: "array",
        items: { type: "string", enum: ["camera", "coverage", "continuity", "performance", "edit"] },
        minItems: 1,
      },
    },
    required: ["instruction", "revision_scope"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      status: { const: "SHOT_SET_REVISION_PLANNED" },
      creative_project_id: { type: "string" },
      request_ref: { type: ["string", "null"] },
      plan_fingerprint: { type: "string" },
      resolution: { type: "string" },
      shot_count: { type: "number" },
      shots: { type: "array", items: { type: "object", additionalProperties: true } },
      professional_lock_conflicts: { type: "array", items: { type: "object", additionalProperties: true } },
      media_generation_executed: { const: false },
      publish_authorized: { const: false },
    },
    required: ["status", "creative_project_id", "plan_fingerprint", "shot_count", "shots", "professional_lock_conflicts"],
  },
});

export function validate({ payload = {} }) {
  if (!text(payload.request_ref) && !text(payload.creative_project_id)) {
    const error = new Error("CREATIVE_OPERATOR_PROJECT_REFERENCE_REQUIRED");
    error.status = 400;
    throw error;
  }
  if (!text(payload.instruction, 1600)) {
    const error = new Error("CREATIVE_CHAT_MULTI_REVISION_INSTRUCTION_REQUIRED");
    error.status = 400;
    throw error;
  }
  if (!list(payload.revision_scope).length) {
    const error = new Error("CREATIVE_CHAT_MULTI_REVISION_SCOPE_REQUIRED");
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

  const plan = await CreativeChatShotSetRuntime.resolve({
    organization_id: context.organizationId,
    creative_project_id: resolved.project.id,
    shot_ids: payload.shot_ids,
    shot_references: payload.shot_references,
    shot_set_reference: payload.shot_set_reference,
    anchor_shot_id: payload.anchor_shot_id,
    instruction: payload.instruction,
    revision_scope: payload.revision_scope,
  });

  return {
    status: "SHOT_SET_REVISION_PLANNED",
    contract: plan.contract,
    request_ref: resolved.request_ref || null,
    creative_project_id: resolved.project.id,
    plan_fingerprint: plan.plan_fingerprint,
    resolution: plan.resolution,
    instruction: plan.instruction,
    revision_scope: plan.revision_scope,
    shot_count: plan.shot_count,
    shots: plan.summaries,
    professional_lock_conflicts: plan.professional_lock_conflicts,
    executable: plan.professional_lock_conflicts.length === 0,
    confirmation_required: true,
    media_generation_executed: false,
    publish_authorized: false,
  };
}
