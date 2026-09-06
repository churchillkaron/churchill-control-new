import {
  CreativeIdentityAtlasRuntime,
} from "@/lib/creative/identity/runtime/CreativeIdentityAtlasRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.human-continuity-quality.v1",
);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function humanShot(shot = {}) {
  if (object(shot.identity_requirements).verification_required === true) return true;
  if (object(shot.generation?.identity_lock).required === true) return true;
  const source = JSON.stringify({
    actors: shot.actors,
    subject: shot.subject,
    performance: shot.performance,
    action: shot.action,
  }).toLowerCase();
  return list(shot.actors).length > 0 ||
    /\b(person|people|artist|performer|singer|actor|actress|model|dancer|staff|employee|founder|owner|woman|man|girl|boy|face|portrait)\b/.test(source);
}

function enrichValidation(validation = {}) {
  return {
    ...object(validation),
    minimum_anatomy_score: Number(validation.minimum_anatomy_score || 90),
    minimum_temporal_identity_consistency_score: Number(
      validation.minimum_temporal_identity_consistency_score || 90,
    ),
    anatomy_validation_required: true,
    hand_integrity_validation_required: true,
    limb_topology_validation_required: true,
    body_proportion_validation_required: true,
    face_geometry_validation_required: true,
    duplicate_subject_validation_required: true,
    temporal_identity_consistency_required: true,
    reject_on_extra_limbs: true,
    reject_on_missing_limbs: true,
    reject_on_malformed_hands: true,
    reject_on_face_identity_drift: true,
    reject_on_body_identity_drift: true,
  };
}

function enrichKeyframeContract(contract = {}) {
  if (!Object.keys(object(contract)).length) return contract;
  const prompt = text(contract.prompt);
  const qualityInstruction = [
    "Human continuity quality is binding.",
    "Hands must have natural finger count and articulation; limbs must be complete, correctly connected and anatomically plausible.",
    "Preserve face geometry and body proportions from the approved identity evidence.",
    "Do not duplicate the subject, fuse limbs, create extra or missing limbs, malformed hands, impossible joints, warped teeth or asymmetric identity drift.",
    "The validation result must explicitly report anatomy_valid, hand_integrity_valid, limb_topology_valid, body_proportions_preserved, face_geometry_preserved, duplicate_subject_detected, extra_limbs_detected, missing_limbs_detected and malformed_hands_detected.",
  ].join(" ");

  return {
    ...object(contract),
    prompt: prompt.includes("Human continuity quality is binding")
      ? prompt
      : [prompt, qualityInstruction].filter(Boolean).join("\n\n"),
    validation: enrichValidation(contract.validation),
  };
}

function enrichShot(shot = {}) {
  if (!humanShot(shot)) return shot;
  return {
    ...shot,
    keyframe_contract: enrichKeyframeContract(shot.keyframe_contract),
    identity_requirements: {
      ...object(shot.identity_requirements),
      anatomy_validation_required: true,
      human_continuity_validation_required: true,
    },
    generation: {
      ...object(shot.generation),
      identity_lock: {
        ...object(shot.generation?.identity_lock),
        preserve_face_geometry: true,
        preserve_body_proportions: true,
        preserve_hands_and_limbs: true,
        reject_identity_drift: true,
      },
    },
    metadata: {
      ...object(shot.metadata),
      human_continuity_contract: "HUMAN_CONTINUITY_QUALITY_V1",
      minimum_anatomy_score: 90,
      minimum_temporal_identity_consistency_score: 90,
    },
  };
}

function enrichPlan(plan = {}) {
  return {
    ...plan,
    scenes: list(plan.scenes).map((scene) => ({
      ...scene,
      shots: list(scene.shots).map(enrichShot),
    })),
    production: {
      ...object(plan.production),
      human_continuity_contract: "HUMAN_CONTINUITY_QUALITY_V1",
      anatomy_validation_required_for_human_generation: true,
      temporal_identity_validation_required_for_human_generation: true,
      human_anatomy_fail_closed: true,
    },
  };
}

function install() {
  if (CreativeIdentityAtlasRuntime[INSTALL_FLAG]) return;
  const attachWithoutHumanQuality = CreativeIdentityAtlasRuntime.attachToPlan.bind(
    CreativeIdentityAtlasRuntime,
  );

  Object.defineProperty(CreativeIdentityAtlasRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeIdentityAtlasRuntime.attachToPlan = function attachWithHumanQuality(
    plan = {},
    materialization = {},
  ) {
    return enrichPlan(attachWithoutHumanQuality(plan, materialization));
  };
}

install();

export const CreativeHumanContinuityQualityBootstrap = {
  installed: true,
  enrichPlan,
};
