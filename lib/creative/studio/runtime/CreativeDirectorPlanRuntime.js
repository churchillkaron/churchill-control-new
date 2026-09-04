import crypto from "node:crypto";

export const CREATIVE_DIRECTOR_PLAN_CONTRACT =
  "AVANTIQO_CREATIVE_DIRECTOR_PLAN_V1";

export const CREATIVE_DIRECTOR_EXPERIENCE_MODES = Object.freeze({
  AI_CREATIVE: "AI_CREATIVE",
  SPECIALIST_PRO: "SPECIALIST_PRO",
});

function text(value, limit = 2400) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeExperienceMode(value) {
  const normalized = text(value, 80).toUpperCase() ||
    CREATIVE_DIRECTOR_EXPERIENCE_MODES.AI_CREATIVE;
  if (!Object.values(CREATIVE_DIRECTOR_EXPERIENCE_MODES).includes(normalized)) {
    const error = new Error("CREATIVE_DIRECTOR_EXPERIENCE_MODE_INVALID");
    error.status = 400;
    error.details = {
      experience_mode: normalized,
      allowed: Object.values(CREATIVE_DIRECTOR_EXPERIENCE_MODES),
    };
    throw error;
  }
  return normalized;
}

function fingerprint({ experience_mode, change_set_fingerprint }) {
  return crypto.createHash("sha256").update(JSON.stringify({
    contract: CREATIVE_DIRECTOR_PLAN_CONTRACT,
    experience_mode,
    change_set_fingerprint: text(change_set_fingerprint, 180),
  })).digest("hex");
}

function authorityForMode(experienceMode) {
  if (experienceMode === CREATIVE_DIRECTOR_EXPERIENCE_MODES.SPECIALIST_PRO) {
    return {
      experience: "SPECIALIST_PRO_STUDIO",
      interaction_model: "CONTROL_FIRST",
      creative_authority: "HUMAN_SPECIALIST",
      ai_role: "ASSIST_AND_EXECUTE_WITHIN_HUMAN_DIRECTION",
      precision_controls_expected: true,
      professional_locks_enforced: true,
    };
  }
  return {
    experience: "FULL_AI_CREATIVE",
    interaction_model: "OUTCOME_FIRST",
    creative_authority: "AVANTIQO_AI_DIRECTOR",
    ai_role: "PLAN_AND_OPERATE_WITHIN_GOVERNED_BOUNDARIES",
    precision_controls_expected: false,
    professional_locks_enforced: true,
  };
}

export function buildCreativeDirectorPlan({
  experience_mode = CREATIVE_DIRECTOR_EXPERIENCE_MODES.AI_CREATIVE,
  creative_project_id,
  request_ref = null,
  shot_set_plan,
} = {}) {
  if (!creative_project_id) throw new Error("creative_project_id required");
  if (!shot_set_plan?.plan_fingerprint) {
    const error = new Error("CREATIVE_DIRECTOR_SHOT_SET_PLAN_REQUIRED");
    error.status = 400;
    throw error;
  }

  const experienceMode = normalizeExperienceMode(experience_mode);
  const editableShots = list(shot_set_plan.summaries);
  const preservedShots = list(shot_set_plan.preserved_summaries);
  const lockConflicts = list(shot_set_plan.professional_lock_conflicts);
  const changeSetFingerprint = text(shot_set_plan.plan_fingerprint, 180);
  const directorPlanFingerprint = fingerprint({
    experience_mode: experienceMode,
    change_set_fingerprint: changeSetFingerprint,
  });

  return {
    contract: CREATIVE_DIRECTOR_PLAN_CONTRACT,
    plan_type: "VISUAL_CHANGE_SET",
    experience_mode: experienceMode,
    authority: authorityForMode(experienceMode),
    creative_project_id: text(creative_project_id, 180),
    request_ref: text(request_ref, 500) || null,
    objective: text(shot_set_plan.instruction, 1600) || null,
    change_set: {
      resolution: text(shot_set_plan.resolution, 500) || "EXACT_SET",
      revision_scope: list(shot_set_plan.revision_scope),
      editable: {
        shot_count: Number(shot_set_plan.shot_count || editableShots.length),
        shots: editableShots,
      },
      preserved: {
        shot_count: Number(
          shot_set_plan.preserved_shot_count || preservedShots.length,
        ),
        shots: preservedShots,
        immutable_during_execution: true,
      },
      professional_lock_conflicts: lockConflicts,
    },
    governance: {
      executable: lockConflicts.length === 0,
      confirmation_required_for_current_write: true,
      professional_locks_enforced: true,
      preserved_shots_immutable: true,
      stale_plan_preflight_required: true,
      atomic_execution_required: true,
      publication_separate_authority: true,
    },
    production: {
      operation_class: "DIRECTION_REVISION",
      current_plan_is_read_only: true,
      media_generation_required_for_current_plan: false,
      spend_class: "ZERO_COST_PLAN",
      qc_required_before_final_delivery: true,
    },
    fingerprints: {
      change_set: changeSetFingerprint,
      director_plan: directorPlanFingerprint,
    },
    media_generation_executed: false,
    publish_authorized: false,
  };
}

export const CreativeDirectorPlanRuntime = Object.freeze({
  contract: CREATIVE_DIRECTOR_PLAN_CONTRACT,
  experience_modes: CREATIVE_DIRECTOR_EXPERIENCE_MODES,
  build: buildCreativeDirectorPlan,
});

export default CreativeDirectorPlanRuntime;
