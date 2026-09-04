import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { resolveOperatorCreativeProject } from "@/lib/creative/studio/OperatorCreativeProjectReferenceRuntime";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import {
  CreativeChatShotSetRuntime,
} from "@/lib/creative/studio/runtime/CreativeChatShotSetRuntime";
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
    "Execute one previously planned and explicitly confirmed multi-shot directing change as one all-or-nothing database transaction. The submitted plan_fingerprint must match the current canonical project, exact shot set, revision numbers, instruction and scope. Avantiqo reasons over the complete set before any write, validates every proposed patch against Pro Studio locks, then atomically commits all selected shots and records a reversible checkpoint. If any shot is stale or invalid, none are changed. Never generates media, publishes, or authorizes production.",
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
      shot_ids: { type: "array", items: { type: "string" } },
      shot_references: { type: "array", items: { type: "string" } },
      shot_set_reference: { type: "string" },
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

  const atomic = await CreativeAtomicShotSetRevisionRuntime.revise({
    organization_id: context.organizationId,
    creative_project_id: resolved.project.id,
    plan_fingerprint: plan.plan_fingerprint,
    instruction: plan.instruction,
    revision_scope: plan.revision_scope,
    shots: plan.shots,
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

  const last = canonical[canonical.length - 1] || null;
  return {
    success: true,
    contract: "AVANTIQO_CHAT_MULTI_SHOT_REVISION_V2",
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
    selected_shot_id: last?.shot_id || null,
    selected_scene_id: last?.scene_id || null,
    selected_shot_number: last?.shot_number || null,
    selected_shot_title: last?.title || null,
    selected_revision_number: last?.revision_number ?? null,
    verification: {
      source: "CANONICAL_ATOMIC_MULTI_SHOT_REREAD",
      verified_at: new Date().toISOString(),
      exact_shot_count: canonical.length,
      checkpoint_id: atomic.checkpoint_id || null,
      atomic_commit: true,
      all_or_nothing: true,
      media_generation_executed: false,
      publish_authorized: false,
    },
    professional_locks_preserved: true,
    media_generation_executed: false,
    publish_authorized: false,
  };
}
