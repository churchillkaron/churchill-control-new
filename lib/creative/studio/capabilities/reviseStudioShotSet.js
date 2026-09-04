import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { resolveOperatorCreativeProject } from "@/lib/creative/studio/OperatorCreativeProjectReferenceRuntime";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import {
  CreativeChatShotSetRuntime,
} from "@/lib/creative/studio/runtime/CreativeChatShotSetRuntime";
import {
  CreativeDirectorPlanRuntime,
} from "@/lib/creative/studio/runtime/CreativeDirectorPlanRuntime";
import {
  CreativeDirectorPlanProductionBindingRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorPlanProductionBindingRuntime";
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

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
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
  action: "reviseShotSet",
  description:
    "Execute one previously planned and explicitly confirmed multi-shot directing change as one all-or-nothing database transaction. The submitted plan_fingerprint must match the current canonical project, editable shot set, preserved shot set, revision numbers, instruction and scope. Preserved shots are immutable context and are never included in the atomic change set. Avantiqo reasons over the complete directing context before any write, validates every proposed patch against Pro Studio locks, then atomically commits only editable shots, records a reversible checkpoint, and binds the confirmed Director Plan to the exact committed shot state for downstream production-quality review. If any plan state is stale or invalid, nothing is changed. Never generates media, publishes, or authorizes production.",
  permissions: [REQUIRED_PERMISSION],
  events: ["creative.studio.shot_set.revised"],
  tags: [
    "creative",
    "video",
    "chat",
    "multi-shot",
    "revision",
    "confirmation",
    "stale-plan-guard",
    "atomic",
    "checkpoint",
    "reversible",
    "preserved-shots",
    "director-plan-binding",
  ],
  transactional: true,
  aiEnabled: true,
  operatorEnabled: true,
  operatorMode: "write",
  operatorAutoExecute: false,
  operatorRequiresConfirmation: true,
  risk: "medium",
  reversible: true,
  approval: { required: false, boundary: "conversation_confirmation" },
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
        items: {
          type: "string",
          enum: ["camera", "coverage", "continuity", "performance", "edit"],
        },
        minItems: 1,
      },
      plan_fingerprint: { type: "string" },
    },
    required: ["instruction", "revision_scope", "plan_fingerprint"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      success: { type: "boolean" },
      creative_project_id: { type: "string" },
      request_ref: { type: ["string", "null"] },
      plan_fingerprint: { type: "string" },
      checkpoint_id: { type: ["string", "null"] },
      atomic_commit: { const: true },
      all_or_nothing: { const: true },
      revised_shot_count: { type: "number" },
      revised_shots: {
        type: "array",
        items: { type: "object", additionalProperties: true },
      },
      preserved_shot_count: { type: "number" },
      preserved_shots: {
        type: "array",
        items: { type: "object", additionalProperties: true },
      },
      director_plan_binding: { type: "object", additionalProperties: true },
      verification: { type: "object", additionalProperties: true },
      professional_locks_preserved: { const: true },
      media_generation_executed: { const: false },
      publish_authorized: { const: false },
    },
    required: [
      "success",
      "creative_project_id",
      "plan_fingerprint",
      "atomic_commit",
      "all_or_nothing",
      "revised_shot_count",
      "revised_shots",
      "preserved_shot_count",
      "preserved_shots",
      "director_plan_binding",
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
  if (!text(payload.plan_fingerprint, 128)) {
    const error = new Error("CREATIVE_CHAT_MULTI_REVISION_PLAN_FINGERPRINT_REQUIRED");
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

  const submittedFingerprint = text(payload.plan_fingerprint, 128);
  if (submittedFingerprint !== plan.plan_fingerprint) {
    const error = new Error("CREATIVE_CHAT_MULTI_REVISION_PLAN_STALE");
    error.status = 409;
    error.details = {
      submitted_plan_fingerprint: submittedFingerprint,
      current_plan_fingerprint: plan.plan_fingerprint,
      resolution:
        "Re-run the read-only multi-shot planning step and confirm the current canonical plan before revision.",
    };
    throw error;
  }

  if (plan.professional_lock_conflicts.length) {
    const error = new Error("CREATIVE_CHAT_MULTI_REVISION_PROFESSIONAL_LOCKED");
    error.status = 409;
    error.details = {
      conflicts: plan.professional_lock_conflicts,
      resolution:
        "Release the relevant Pro Studio field locks or narrow the requested revision scope before execution.",
    };
    throw error;
  }

  const directorPlan = CreativeDirectorPlanRuntime.build({
    experience_mode: payload.experience_mode || "AI_CREATIVE",
    creative_project_id: resolved.project.id,
    request_ref: resolved.request_ref || null,
    shot_set_plan: plan,
  });

  const atomic = await CreativeAtomicShotSetRevisionRuntime.revise({
    organization_id: context.organizationId,
    creative_project_id: resolved.project.id,
    plan_fingerprint: plan.plan_fingerprint,
    instruction: plan.instruction,
    revision_scope: plan.revision_scope,
    shots: plan.shots,
    preserved_shots: plan.preserved_shots,
  });

  const canonicalProjectShots = await ShotRuntime.list({
    organization_id: context.organizationId,
    creative_project_id: resolved.project.id,
  });
  const canonicalById = new Map(
    canonicalProjectShots.map((shot) => [text(shot.id, 180), shot]),
  );
  const canonical = plan.shots.map((planned) => {
    const shot = canonicalById.get(text(planned.id, 180));
    if (!shot) {
      const error = new Error("CREATIVE_CHAT_MULTI_REVISION_VERIFY_SHOT_NOT_FOUND");
      error.status = 500;
      throw error;
    }
    return verifiedShot(shot);
  });
  const canonicalPreserved = plan.preserved_shots.map((planned) => {
    const shot = canonicalById.get(text(planned.id, 180));
    if (!shot) {
      const error = new Error("CREATIVE_CHAT_MULTI_REVISION_VERIFY_PRESERVED_SHOT_NOT_FOUND");
      error.status = 500;
      throw error;
    }
    const beforeRevision = Number(planned.metadata?.revision_number || 0);
    const afterRevision = Number(shot.metadata?.revision_number || 0);
    if (beforeRevision !== afterRevision || planned.updated_at !== shot.updated_at) {
      const error = new Error("CREATIVE_CHAT_MULTI_REVISION_PRESERVED_SHOT_CHANGED");
      error.status = 409;
      throw error;
    }
    return verifiedShot(shot);
  });

  const directorPlanBinding = await CreativeDirectorPlanProductionBindingRuntime.bindCommitted({
    organization_id: context.organizationId,
    creative_project_id: resolved.project.id,
    director_plan: directorPlan,
    checkpoint_id: atomic.checkpoint_id || null,
  });

  const last = canonical[canonical.length - 1] || null;
  return {
    success: true,
    contract: "AVANTIQO_CHAT_MULTI_SHOT_REVISION_V3",
    request_ref: resolved.request_ref || null,
    creative_project_id: resolved.project.id,
    plan_fingerprint: plan.plan_fingerprint,
    checkpoint_id: atomic.checkpoint_id || null,
    atomic_commit: true,
    all_or_nothing: true,
    reversible: Boolean(atomic.checkpoint_id),
    revision_scope: plan.revision_scope,
    instruction: plan.instruction,
    revised_shot_count: canonical.length,
    revised_shots: canonical,
    preserved_shot_count: canonicalPreserved.length,
    preserved_shots: canonicalPreserved,
    director_plan_binding: directorPlanBinding,
    selected_shot_id: last?.shot_id || null,
    selected_scene_id: last?.scene_id || null,
    selected_shot_number: last?.shot_number || null,
    selected_shot_title: last?.title || null,
    selected_revision_number: last?.revision_number ?? null,
    verification: {
      source: "CANONICAL_ATOMIC_MULTI_SHOT_REREAD",
      verified_at: new Date().toISOString(),
      exact_shot_count: canonical.length,
      exact_preserved_shot_count: canonicalPreserved.length,
      checkpoint_id: atomic.checkpoint_id || null,
      atomic_commit: true,
      all_or_nothing: true,
      preserved_shots_unchanged: true,
      director_plan_bound_for_final_qc: true,
      director_plan_fingerprint:
        directorPlanBinding.director_plan_fingerprint || null,
      media_generation_executed: false,
      publish_authorized: false,
    },
    professional_locks_preserved: true,
    media_generation_executed: false,
    publish_authorized: false,
  };
}
