import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  CreativeProfessionalDirectionAuthorityRuntime,
} from "@/lib/creative/continuity/runtime/CreativeProfessionalDirectionAuthorityRuntime";

export const CREATIVE_ATOMIC_SHOT_SET_REVISION_CONTRACT =
  "AVANTIQO_ATOMIC_SHOT_SET_REVISION_V1";

const ALLOWED_SCOPES = new Set([
  "camera",
  "coverage",
  "continuity",
  "performance",
  "edit",
]);

const EDIT_COVERAGE_FIELDS = new Set([
  "shot_to_shot_contrast",
  "edit_compatibility_status",
  "edit_relationship",
  "match_action",
  "continuity_consequence",
]);

function text(value, limit = 5000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeScope(value) {
  return [...new Set(
    list(value)
      .map((item) => text(item, 80).toLowerCase())
      .filter((item) => ALLOWED_SCOPES.has(item)),
  )];
}

function normalizedReasoningOutput(result = {}) {
  const value = result?.output?.output || result?.output || result || {};
  if (value && typeof value === "object") return value.result || value;
  const source = text(value, 300000);
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try {
    const parsed = JSON.parse(source.slice(first, last + 1));
    return parsed.result || parsed;
  } catch {
    return null;
  }
}

function shotSnapshot(shot = {}) {
  return {
    id: shot.id,
    scene_id: shot.scene_id,
    scene_number: shot.scene_number,
    shot_number: shot.shot_number,
    title: shot.title,
    purpose: shot.purpose,
    subject: shot.subject,
    action: shot.action,
    performance: shot.performance,
    duration_seconds: shot.duration_seconds,
    camera: object(shot.camera),
    coverage: object(shot.coverage || shot.metadata?.coverage),
    continuity: object(shot.continuity),
    transition_in: shot.transition_in || "",
    transition_out: shot.transition_out || "",
    revision_number: Number(shot.metadata?.revision_number || 0),
    updated_at: shot.updated_at || null,
    professional_locked_fields:
      CreativeProfessionalDirectionAuthorityRuntime.lockedFields(shot),
  };
}

function prompt({ instruction, scope, shots }) {
  return `
You are Avantiqo's senior film director, cinematographer, continuity supervisor and picture editor.
Revise one VERIFIED SET of existing shots as a coherent directing operation. This is a proposal only. Do not write data and do not generate media.

Return strict JSON only:
{
  "contract": "${CREATIVE_ATOMIC_SHOT_SET_REVISION_CONTRACT}",
  "scope": ["camera|coverage|continuity|performance|edit"],
  "reason": "why the whole set change improves the requested directing intent",
  "changes": [
    {
      "shot_id": "exact supplied shot id",
      "patch": {
        "camera": {},
        "coverage": {},
        "continuity": {},
        "performance": null,
        "transition_in": null,
        "transition_out": null
      },
      "reason": "shot-specific reason"
    }
  ]
}

USER DIRECTION
${JSON.stringify(text(instruction, 1600))}

AUTHORIZED CRAFT SCOPE
${JSON.stringify(scope)}

VERIFIED SHOT SET
${JSON.stringify(shots.map(shotSnapshot))}

RULES
- Return every supplied shot exactly once and no other shot.
- Never add, remove, reorder, merge or split shots.
- Keep shot_id exact.
- Return exactly the authorized scope values; never widen scope.
- Populate only fields needed to satisfy the direction.
- camera scope may change camera only.
- coverage scope may change coverage only.
- continuity scope may change continuity only.
- performance scope may change performance only.
- edit scope may change transition_in, transition_out and only edit-relationship coverage fields.
- Pro Studio locked fields are immutable. Never propose a locked field.
- Preserve purpose, subject, action, duration, identity, assets, products, brand truth, generation settings and all unrelated craft.
- Do not emit provider prompts or provider parameters.
- Do not generate media.
`;
}

function validatePatch(shot, patchValue, scope) {
  const patch = object(patchValue);
  const allowedRoots = new Set();
  if (scope.includes("camera")) allowedRoots.add("camera");
  if (scope.includes("coverage")) allowedRoots.add("coverage");
  if (scope.includes("continuity")) allowedRoots.add("continuity");
  if (scope.includes("performance")) allowedRoots.add("performance");
  if (scope.includes("edit")) {
    allowedRoots.add("coverage");
    allowedRoots.add("transition_in");
    allowedRoots.add("transition_out");
  }

  const forbidden = Object.keys(patch).filter(
    (key) => !allowedRoots.has(key) && patch[key] != null,
  );
  if (forbidden.length) {
    throw new Error(
      `CREATIVE_ATOMIC_MULTI_REVISION_SCOPE_VIOLATION:${shot.id}:${forbidden.join(",")}`,
    );
  }

  if (scope.includes("edit") && !scope.includes("coverage")) {
    const forbiddenCoverage = Object.keys(object(patch.coverage)).filter(
      (key) => !EDIT_COVERAGE_FIELDS.has(key),
    );
    if (forbiddenCoverage.length) {
      throw new Error(
        `CREATIVE_ATOMIC_MULTI_REVISION_EDIT_SCOPE_VIOLATION:${shot.id}:${forbiddenCoverage.join(",")}`,
      );
    }
  }

  const lockCheck = CreativeProfessionalDirectionAuthorityRuntime.stripLockedPatch(
    shot,
    patch,
  );
  if (lockCheck.preserved_locked_fields.length) {
    const error = new Error(
      `CREATIVE_ATOMIC_MULTI_REVISION_PROFESSIONAL_LOCKED:${shot.id}:${lockCheck.preserved_locked_fields.join(",")}`,
    );
    error.status = 409;
    error.details = {
      shot_id: shot.id,
      locked_fields: lockCheck.preserved_locked_fields,
      resolution:
        "Release the relevant Pro Studio field lock or narrow the directing request before executing the set revision.",
    };
    throw error;
  }

  if (!Object.keys(patch).some((key) => patch[key] != null)) {
    throw new Error(`CREATIVE_ATOMIC_MULTI_REVISION_EMPTY_PATCH:${shot.id}`);
  }
  return patch;
}

function validateProposal({ output, scope, shots }) {
  if (!output || text(output.contract, 160) !== CREATIVE_ATOMIC_SHOT_SET_REVISION_CONTRACT) {
    throw new Error("CREATIVE_ATOMIC_MULTI_REVISION_CONTRACT_INVALID");
  }

  const returnedScope = normalizeScope(output.scope);
  if (JSON.stringify([...returnedScope].sort()) !== JSON.stringify([...scope].sort())) {
    throw new Error("CREATIVE_ATOMIC_MULTI_REVISION_SCOPE_WIDENED");
  }

  const changes = list(output.changes);
  if (changes.length !== shots.length) {
    throw new Error("CREATIVE_ATOMIC_MULTI_REVISION_SHOT_COUNT_MISMATCH");
  }

  const byId = new Map(shots.map((shot) => [text(shot.id, 180), shot]));
  const seen = new Set();
  return changes.map((change) => {
    const shotId = text(change?.shot_id, 180);
    const shot = byId.get(shotId);
    if (!shot) throw new Error(`CREATIVE_ATOMIC_MULTI_REVISION_UNKNOWN_SHOT:${shotId}`);
    if (seen.has(shotId)) throw new Error(`CREATIVE_ATOMIC_MULTI_REVISION_DUPLICATE_SHOT:${shotId}`);
    seen.add(shotId);
    return {
      shot_id: shotId,
      expected_revision_number: Number(shot.metadata?.revision_number || 0),
      expected_updated_at: shot.updated_at,
      patch: validatePatch(shot, change.patch, scope),
      reason: text(change.reason, 2000) || null,
    };
  });
}

export const CreativeAtomicShotSetRevisionRuntime = Object.freeze({
  contract: CREATIVE_ATOMIC_SHOT_SET_REVISION_CONTRACT,

  async revise({
    organization_id,
    creative_project_id,
    plan_fingerprint,
    instruction,
    revision_scope,
    shots,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    if (!text(plan_fingerprint, 128)) throw new Error("plan_fingerprint required");
    if (!text(instruction, 1600)) throw new Error("instruction required");

    const scope = normalizeScope(revision_scope);
    const verifiedShots = list(shots);
    if (!scope.length) throw new Error("CREATIVE_ATOMIC_MULTI_REVISION_SCOPE_REQUIRED");
    if (!verifiedShots.length || verifiedShots.length > 24) {
      throw new Error("CREATIVE_ATOMIC_MULTI_REVISION_SHOT_SET_INVALID");
    }

    const result = await ServiceExecutionRuntime.execute({
      organization_id,
      service_id: "ai.reasoning.execute",
      provider_id: null,
      category: "CREATIVE_DIRECTION",
      input: {
        quantity: 1,
        max_output_tokens: Math.min(16000, 2500 + verifiedShots.length * 700),
        response_format: { type: "json_object" },
        prompt: prompt({
          instruction: text(instruction, 1600),
          scope,
          shots: verifiedShots,
        }),
      },
      metadata: {
        module: "CREATIVE",
        operation: "ATOMIC_MULTI_SHOT_REVISION_V1",
        creative_project_id,
        plan_fingerprint: text(plan_fingerprint, 128),
        shot_count: verifiedShots.length,
        media_generation_executed: false,
      },
    });

    const output = normalizedReasoningOutput(result);
    const changes = validateProposal({ output, scope, shots: verifiedShots });

    const { data, error } = await supabaseAdmin.rpc(
      "creative_apply_shot_set_revision_atomic",
      {
        p_organization_id: organization_id,
        p_creative_project_id: creative_project_id,
        p_plan_fingerprint: text(plan_fingerprint, 128),
        p_instruction: text(instruction, 1600),
        p_revision_scope: scope,
        p_changes: changes,
      },
    );
    if (error) throw error;

    return {
      success: true,
      contract: CREATIVE_ATOMIC_SHOT_SET_REVISION_CONTRACT,
      creative_project_id,
      plan_fingerprint: text(plan_fingerprint, 128),
      revision_scope: scope,
      shot_count: verifiedShots.length,
      checkpoint_id: data?.checkpoint_id || null,
      atomic_commit: true,
      all_or_nothing: true,
      reason: text(output.reason, 2000) || null,
      usage: result?.usage || result?.output?.usage || null,
      billing: result?.billing || result?.output?.billing || null,
      media_generation_executed: false,
      publish_authorized: false,
    };
  },

  async restore({ organization_id, creative_project_id, checkpoint_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    if (!checkpoint_id) throw new Error("checkpoint_id required");

    const checkpointLookup = await supabaseAdmin.rpc(
      "creative_direction_checkpoint_shot_ids",
      {
        p_organization_id: organization_id,
        p_creative_project_id: creative_project_id,
        p_checkpoint_id: checkpoint_id,
      },
    );
    if (checkpointLookup.error) throw checkpointLookup.error;
    const checkpointShotIds = list(checkpointLookup.data)
      .map((id) => text(id, 180))
      .filter(Boolean);
    if (!checkpointShotIds.length) {
      const error = new Error("CREATIVE_DIRECTION_CHECKPOINT_NOT_FOUND");
      error.status = 404;
      throw error;
    }

    const { data, error } = await supabaseAdmin.rpc(
      "creative_restore_shot_set_checkpoint_atomic",
      {
        p_organization_id: organization_id,
        p_creative_project_id: creative_project_id,
        p_checkpoint_id: checkpoint_id,
      },
    );
    if (error) throw error;
    return {
      ...object(data),
      checkpoint_shot_ids: checkpointShotIds,
      atomic_restore: true,
      media_generation_executed: false,
      publish_authorized: false,
    };
  },
});

export default CreativeAtomicShotSetRevisionRuntime;
