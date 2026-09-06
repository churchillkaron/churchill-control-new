const HUMAN_REQUIRED_SCENES = Object.freeze([9, 11, 12, 13, 14, 15, 16, 17, 19]);
const HUMAN_REQUIRED_SCENE_SET = new Set(HUMAN_REQUIRED_SCENES);

const HUMAN_VISUAL_PATTERN = /\b(person|people|human|humans|guest|guests|customer|customers|staff|worker|workers|technician|technicians|manager|managers|founder|founders|server|servers|chef|chefs|receptionist|receptionists|employee|employees|operator|operators|owner|owners|team|teams|crowd|audience|woman|women|man|men|boy|boys|girl|girls|face|faces|hand|hands)\b/i;

export const INVESTOR_HUMAN_POLICY_CONTRACT =
  "AVANTIQO_INVESTOR_HUMAN_GENERATION_POLICY_V1";
export const INVESTOR_HUMAN_GENERATION_CONTRACT =
  "AVANTIQO_VIDEO_HUMAN_MULTI_KEYFRAME_NATIVE_MASTER_V1";
export const INVESTOR_HUMAN_RELEASE_CONTRACT =
  "AVANTIQO_INVESTOR_HUMAN_RELEASE_V1";
export const INVESTOR_HUMAN_QC_CONTRACT =
  "AVANTIQO_INVESTOR_HUMAN_QC_PACK_V1";
export const INVESTOR_HUMAN_MINIMUM_KEYFRAMES = 3;
export const INVESTOR_HUMAN_MAXIMUM_KEYFRAMES = 8;

const REQUIRED_QC_CHECKS = Object.freeze([
  "face_identity",
  "face_temporal_stability",
  "eyes",
  "hands",
  "anatomy",
  "skin_texture",
  "motion_physics",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function taskHumanPolicy(task = {}) {
  const metadata = object(task.metadata);
  const input = object(task.input);
  return object(
    metadata.investor_human_generation ||
    metadata.human_generation ||
    input.investor_human_generation ||
    input.human_generation,
  );
}

function taskHumanCorpus(task = {}) {
  const input = object(task.input);
  const metadata = object(task.metadata);
  const generation = object(input.generation);
  const shotBible = object(input.shot_bible);
  const creative = object(input.creative_direction);
  const values = [
    task.objective,
    task.description,
    task.title,
    input.objective,
    input.prompt,
    input.instruction,
    input.description,
    input.scene_description,
    input.visual_direction,
    generation.prompt,
    generation.instruction,
    generation.description,
    shotBible.description,
    shotBible.subject,
    shotBible.action,
    creative.objective,
    creative.description,
    metadata.objective,
    metadata.scene_description,
  ];
  return values.map(text).filter(Boolean).join(" ");
}

export function investorHumanSceneRequiresControl(scene) {
  return HUMAN_REQUIRED_SCENE_SET.has(Number(scene));
}

export function investorHumanGenerationPolicy(scene, { required } = {}) {
  const humanRequired = required === undefined
    ? investorHumanSceneRequiresControl(scene)
    : required === true;
  return Object.freeze({
    contract: INVESTOR_HUMAN_POLICY_CONTRACT,
    investor_scene: Number(scene) || null,
    scene_expected_to_include_human: humanRequired,
    human_mode_required: humanRequired,
    conditioning_mode: humanRequired
      ? "approved_same_identity_multi_keyframe"
      : "NOT_REQUIRED",
    generation_contract: humanRequired
      ? INVESTOR_HUMAN_GENERATION_CONTRACT
      : null,
    qc_contract: humanRequired ? INVESTOR_HUMAN_QC_CONTRACT : null,
    release_gate_contract: humanRequired
      ? INVESTOR_HUMAN_RELEASE_CONTRACT
      : null,
    minimum_keyframes: humanRequired
      ? INVESTOR_HUMAN_MINIMUM_KEYFRAMES
      : 0,
    maximum_keyframes: humanRequired
      ? INVESTOR_HUMAN_MAXIMUM_KEYFRAMES
      : 0,
    required_qc_checks: humanRequired ? [...REQUIRED_QC_CHECKS] : [],
    exact_master_digest_binding_required: humanRequired,
    automated_qc_required: humanRequired,
    visual_review_required: humanRequired,
    generic_video_dispatch_allowed: !humanRequired,
    external_provider_fallback_allowed: false,
  });
}

export function investorVideoTaskRequiresHumanControl({ scene, task } = {}) {
  const explicit = taskHumanPolicy(task);
  if (
    explicit.human_mode_required === true ||
    explicit.scene_expected_to_include_human === true
  ) {
    return true;
  }
  if (investorHumanSceneRequiresControl(scene)) return true;
  return HUMAN_VISUAL_PATTERN.test(taskHumanCorpus(task));
}

export function assertInvestorHumanGenerationPolicy(policy = {}) {
  const value = object(policy);
  if (value.contract !== INVESTOR_HUMAN_POLICY_CONTRACT) {
    throw new Error("AVANTIQO_INVESTOR_HUMAN_POLICY_REQUIRED");
  }
  if (value.human_mode_required !== true) {
    throw new Error("AVANTIQO_INVESTOR_HUMAN_MODE_REQUIRED");
  }
  if (value.scene_expected_to_include_human !== true) {
    throw new Error("AVANTIQO_INVESTOR_HUMAN_SCENE_CLASSIFICATION_REQUIRED");
  }
  if (value.conditioning_mode !== "approved_same_identity_multi_keyframe") {
    throw new Error("AVANTIQO_INVESTOR_HUMAN_CONDITIONING_INVALID");
  }
  if (value.generation_contract !== INVESTOR_HUMAN_GENERATION_CONTRACT) {
    throw new Error("AVANTIQO_INVESTOR_HUMAN_GENERATION_CONTRACT_INVALID");
  }
  if (value.release_gate_contract !== INVESTOR_HUMAN_RELEASE_CONTRACT) {
    throw new Error("AVANTIQO_INVESTOR_HUMAN_RELEASE_CONTRACT_INVALID");
  }
  if (
    Number(value.minimum_keyframes) < INVESTOR_HUMAN_MINIMUM_KEYFRAMES ||
    Number(value.maximum_keyframes) > INVESTOR_HUMAN_MAXIMUM_KEYFRAMES
  ) {
    throw new Error("AVANTIQO_INVESTOR_HUMAN_KEYFRAME_POLICY_INVALID");
  }
  if (value.generic_video_dispatch_allowed !== false) {
    throw new Error("AVANTIQO_INVESTOR_HUMAN_GENERIC_VIDEO_FORBIDDEN");
  }
  return true;
}

export const AVANTIQO_INVESTOR_HUMAN_GENERATION_POLICY = Object.freeze({
  contract: INVESTOR_HUMAN_POLICY_CONTRACT,
  source_repository: "churchillkaron/churchill-control-new",
  required_scenes: HUMAN_REQUIRED_SCENES,
  generation_contract: INVESTOR_HUMAN_GENERATION_CONTRACT,
  qc_contract: INVESTOR_HUMAN_QC_CONTRACT,
  release_gate_contract: INVESTOR_HUMAN_RELEASE_CONTRACT,
  minimum_keyframes: INVESTOR_HUMAN_MINIMUM_KEYFRAMES,
  maximum_keyframes: INVESTOR_HUMAN_MAXIMUM_KEYFRAMES,
  required_qc_checks: REQUIRED_QC_CHECKS,
  generic_video_dispatch_for_humans: "FORBIDDEN",
});

export default AVANTIQO_INVESTOR_HUMAN_GENERATION_POLICY;
