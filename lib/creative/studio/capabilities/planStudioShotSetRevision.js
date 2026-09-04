import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { resolveOperatorCreativeProject } from "@/lib/creative/studio/OperatorCreativeProjectReferenceRuntime";
import {
  CreativeChatShotSetRuntime,
} from "@/lib/creative/studio/runtime/CreativeChatShotSetRuntime";
import {
  CreativeDirectorPlanRuntime,
} from "@/lib/creative/studio/runtime/CreativeDirectorPlanRuntime";

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
    "Create a read-only, server-verified multi-shot directing plan before any mutation. Resolves exact shot sets, natural preservation clauses such as 'shots 4-7 except shot 5', explicit excluded shot IDs/references, snapshots revision numbers and timestamps for editable and preserved shots, surfaces Pro Studio lock conflicts, and returns both the deterministic shot-set fingerprint and Avantiqo's canonical Director Plan / Visual Change Set for either full AI Creative or Specialist/Pro Studio. Never revises shots, generates media, spends wallet balance, or publishes.",
  permissions: [REQUIRED_PERMISSION],
  events: [],
  tags: ["creative", "video", "chat", "multi-shot", "plan", "direction", "governance", "preserved-shots", "director-plan"],
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
      experience_mode: {
        type: "string",
        enum: ["AI_CREATIVE", "SPECIALIST_PRO"],
      },
      shot_ids: { type: "array", items: { type: "string" } },
      shot_references: { type: "array", items: { type: "string" } },
      shot_set_reference: { type: "string" },
      exclude_shot_ids: { type: "array", items: { type: "string" } },
      exclude_shot_references: { type: "array", items: { type: "string" } },
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
      preserved_shot_count: { type: "number" },
      preserved_shots: { type: "array", items: { type: "object", additionalProperties: true } },
      professional_lock_conflicts: { type: "array", items: { type: "object", additionalProperties: true } },
      director_plan: { type: "object", additionalProperties: true },
      media_generation_executed: { const: false },
      publish_authorized: { const: false },
    },
    required: ["status", "creative_project_id", "plan_fingerprint", "shot_count", "shots", "preserved_shot_count", "preserved_shots", "professional_lock_conflicts", "director_plan"],
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
    exclude_shot_ids: payload.exclude_shot_ids,
    exclude_shot_references: payload.exclude_shot_references,
    anchor_shot_id: payload.anchor_shot_id,
    instruction: payload.instruction,
    revision_scope: payload.revision_scope,
  });

  const directorPlan = CreativeDirectorPlanRuntime.build({
    experience_mode: payload.experience_mode || "AI_CREATIVE",
    creative_project_id: resolved.project.id,
    request_ref: resolved.request_ref || null,
    shot_set_plan: plan,
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
    preserved_shot_count: plan.preserved_shot_count,
    preserved_shots: plan.preserved_summaries,
    professional_lock_conflicts: plan.professional_lock_conflicts,
    director_plan: directorPlan,
    executable: plan.professional_lock_conflicts.length === 0,
    confirmation_required: true,
    media_generation_executed: false,
    publish_authorized: false,
  };
}
