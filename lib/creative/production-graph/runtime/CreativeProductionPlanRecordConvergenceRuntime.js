import crypto from "node:crypto";

import {
  ProductionGraphRuntime,
} from "./ProductionGraphRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.production-plan-record-convergence.v2",
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

function finiteIndex(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function unique(values = []) {
  return [...new Set(values.flat(Infinity).map((value) => text(
    value?.asset_id || value?.assetId || value?.id || value,
  )).filter(Boolean))];
}

function stableId(prefix, value) {
  return `${prefix}-${crypto.createHash("sha256")
    .update(text(value).toLowerCase())
    .digest("hex")
    .slice(0, 16)}`;
}

function neutralizeText(value) {
  return text(value)
    .replace(/\bpeople\b/gi, "participants")
    .replace(/\bperson\b/gi, "participant")
    .replace(/\bhuman\b/gi, "participant")
    .replace(/\b(artist|performer|singer|actor|actress|model|dancer)\b/gi, "featured talent")
    .replace(/\b(staff|employee)\b/gi, "service team")
    .replace(/\b(founder|owner)\b/gi, "principal")
    .replace(/\b(woman|man)\b/gi, "adult")
    .replace(/\b(girl|boy)\b/gi, "young participant")
    .replace(/\b(face|portrait)\b/gi, "close visual");
}

function neutralizeValue(value) {
  if (typeof value === "string") return neutralizeText(value);
  if (Array.isArray(value)) return value.map(neutralizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, neutralizeValue(entry)]),
    );
  }
  return value;
}

function actorBrief(shot = {}) {
  return list(shot.actors).map((actor) => ({
    id: text(actor?.id) || null,
    name: text(actor?.name) || null,
    label: text(actor?.label) || null,
    role: text(actor?.role) || null,
    description: text(actor?.description || actor) || null,
  }));
}

function actorLabel(actor) {
  return text(
    actor?.name ||
    actor?.label ||
    actor?.role ||
    actor?.description ||
    actor,
  );
}

function genericCastLabel(value) {
  return /^(staff|staff member|employee|team member|service team|worker|crew|operator|attendant|assistant|host|server|cashier|technician|specialist|manager|supervisor|customer|client|guest|visitor|audience|crowd|participant|passerby|family|couple|friends|adult|woman|man|girl|boy|people|person|human|extra|extras)$/i.test(
    text(value),
  );
}

function explicitRealIdentityEvidence(shot = {}) {
  const requirements = object(shot.identity_requirements);
  const performance = object(
    shot.performance_contract || shot.metadata?.performance_contract,
  );
  const identityLock = object(shot.generation?.identity_lock);
  const providerParameters = object(shot.generation?.provider_parameters);
  const metadata = object(shot.metadata);
  const actors = list(shot.actors);

  if (unique([
    requirements.reference_asset_ids,
    performance.identity_reference_asset_ids,
    identityLock.reference_asset_node_ids,
    providerParameters.identity_reference_asset_ids,
  ]).length) {
    return true;
  }

  if (text(
    requirements.profile_id ||
    requirements.identity_profile_id ||
    performance.identity_profile_id ||
    identityLock.identity_profile_id ||
    providerParameters.identity_profile_id ||
    metadata.identity_profile_id,
  )) {
    return true;
  }

  if (
    requirements.required === true ||
    requirements.preserve_real_identity === true ||
    performance.identity_lock_required === true ||
    performance.identity_verification_required === true ||
    identityLock.required === true
  ) {
    return true;
  }

  return actors.some((actor) => {
    const record = object(actor);
    if (text(
      record.identity_id ||
      record.person_id ||
      record.identity_profile_id ||
      record.profile_id,
    )) {
      return true;
    }
    const name = text(record.name);
    return Boolean(name && !genericCastLabel(name));
  });
}

function roleOnlyGenericCast(shot = {}) {
  const actors = list(shot.actors);
  if (!actors.length || explicitRealIdentityEvidence(shot)) return false;

  return actors.every((actor) => {
    const record = object(actor);
    const label = actorLabel(actor);
    if (!label) return false;
    if (record.role && !record.name) return true;
    if (record.label && !record.name) return true;
    return genericCastLabel(label);
  });
}

function existingSyntheticCastMarker(shot = {}) {
  const cast = object(shot.cast_contract);
  const requirements = object(shot.identity_requirements);
  const performance = object(
    shot.performance_contract || shot.metadata?.performance_contract,
  );
  const identityLock = object(shot.generation?.identity_lock);
  const mode = text(
    requirements.mode ||
    cast.mode ||
    identityLock.mode,
  ).toUpperCase();

  return (
    cast.contract === "UNIVERSAL_SYNTHETIC_CAST_V1" ||
    performance.synthetic_cast === true ||
    identityLock.mode === "SYNTHETIC_CAST" ||
    mode.startsWith("SYNTHETIC")
  );
}

function syntheticCastShot(shot = {}) {
  return existingSyntheticCastMarker(shot) || roleOnlyGenericCast(shot);
}

function crowdShot(shot = {}) {
  const source = JSON.stringify({
    actors: shot.actors,
    subject: shot.subject,
    action: shot.action,
    purpose: shot.purpose,
  }).toLowerCase();
  return list(shot.actors).length > 2 ||
    /\b(crowd|audience|group|people|customers|clients|guests|visitors|family|friends|team|staff|crew|extras|participants)\b/.test(source);
}

function reconstructedCastContract(shot = {}, brief = []) {
  const existing = object(shot.cast_contract);
  if (existing.contract === "UNIVERSAL_SYNTHETIC_CAST_V1") {
    return existing;
  }

  const description = brief
    .flatMap((actor) => [
      actor.role,
      actor.label,
      actor.description,
      actor.name,
    ])
    .map(text)
    .filter(Boolean)
    .join("; ") ||
    text(shot.subject || shot.purpose || "supporting cast");
  const ensemble = crowdShot(shot);

  return {
    contract: "UNIVERSAL_SYNTHETIC_CAST_V1",
    mode: ensemble ? "SYNTHETIC_ENSEMBLE" : "SYNTHETIC_CAST",
    cast_profile_id: stableId("synthetic-cast", description),
    description,
    fictional_people_required: true,
    real_person_identity_reference_prohibited: true,
    reference_person_asset_ids: [],
    continuity_scope: ensemble ? "SHOT_AND_SCENE" : "PROJECT",
    preserve_cast_continuity: true,
    natural_anatomy_required: true,
    natural_skin_texture_required: true,
    role_accurate_behavior_required: true,
    wardrobe_continuity_required: true,
    environment_interaction_required: true,
    reconstructed_from_generic_role_evidence: true,
    reconstruction_contract:
      "CREATIVE_PRODUCTION_PLAN_RECORD_CONVERGENCE_V2",
    ensemble_rules: ensemble ? {
      unique_individuals_required: true,
      duplicate_faces_prohibited: true,
      cloned_body_or_pose_prohibited: true,
      coherent_social_relationships_required: true,
      believable_attention_and_eye_lines_required: true,
      background_people_must_perform_real_actions: true,
    } : null,
    prohibited: [
      "matching or imitating any uploaded real person",
      "generic stock-photo posing",
      "duplicate faces or bodies",
      "frozen background figures",
      "synthetic skin or malformed anatomy",
      "role-inaccurate props, uniforms or behavior",
    ],
  };
}

function castPrompt(contract = {}, shot = {}) {
  if (!contract.cast_profile_id) return "";
  return [
    "SYNTHETIC CAST DIRECTIVE:",
    `Generate original fictional cast for profile ${contract.cast_profile_id}.`,
    `Role and behavior: ${contract.description}.`,
    "Do not reproduce, blend, or approximate any uploaded real person's face or body.",
    "Maintain the same fictional individual across recurring shots when the cast profile repeats.",
    "Performance must be candid, role-accurate and physically integrated with the environment.",
    contract.ensemble_rules
      ? "Every visible individual must be distinct and naturally occupied. No cloned faces, repeated bodies, mirrored poses or frozen background figures."
      : null,
    `Shot action: ${text(shot.action)}.`,
  ].filter(Boolean).join("\n");
}

function normalizeSyntheticCast(shot = {}) {
  if (!syntheticCastShot(shot)) return shot;

  const brief = actorBrief(shot);
  const cast = reconstructedCastContract(shot, brief);
  const requirements = object(shot.identity_requirements);
  const performance = object(
    shot.performance_contract || shot.metadata?.performance_contract,
  );
  const generation = object(shot.generation);
  const providerParameters = object(generation.provider_parameters);
  const identityReferences = new Set(unique([
    performance.identity_reference_asset_ids,
    requirements.reference_asset_ids,
    generation.identity_lock?.reference_asset_node_ids,
    providerParameters.identity_reference_asset_ids,
  ]));
  const nonIdentityReferences = unique([
    shot.reference_asset_ids,
    providerParameters.reference_asset_ids,
  ]).filter((assetId) => !identityReferences.has(assetId));

  return {
    ...shot,
    title: neutralizeText(shot.title),
    purpose: neutralizeText(shot.purpose),
    subject: neutralizeText(shot.subject),
    action: neutralizeText(shot.action),
    performance: neutralizeText(shot.performance),
    dialogue: neutralizeValue(shot.dialogue),
    actors: [],
    cast_contract: cast,
    reference_asset_ids: nonIdentityReferences,
    identity_requirements: {
      ...requirements,
      mode: "SYNTHETIC_CAST",
      profile_id: null,
      identity_profile_id: null,
      reference_asset_ids: [],
      required: false,
      preserve_real_identity: false,
      real_person_identity_reference_prohibited: true,
      reject_identity_drift: false,
    },
    performance_contract: {
      ...performance,
      identity_profile_id: null,
      identity_reference_asset_ids: [],
      identity_lock_required: false,
      identity_verification_required: false,
      synthetic_cast: true,
      synthetic_cast_profile_id: cast.cast_profile_id,
    },
    generation: {
      ...generation,
      provider_prompt: [
        text(generation.provider_prompt || shot.provider_prompt),
        castPrompt(cast, shot),
      ].filter(Boolean).join("\n\n"),
      identity_lock: {
        ...object(generation.identity_lock),
        required: false,
        mode: "SYNTHETIC_CAST",
        identity_profile_id: null,
        reference_asset_node_ids: [],
        synthetic_cast_profile_id: cast.cast_profile_id,
      },
      provider_parameters: {
        ...providerParameters,
        identity_profile_id: null,
        identity_reference_asset_ids: [],
        reference_asset_ids: nonIdentityReferences,
        cast_mode: cast.mode,
        synthetic_cast_contract: cast,
      },
    },
    metadata: {
      ...object(shot.metadata),
      synthetic_cast_actor_brief:
        brief.length
          ? brief
          : list(shot.metadata?.synthetic_cast_actor_brief),
      synthetic_cast_record_normalized: true,
      synthetic_cast_record_normalization_contract:
        "CREATIVE_PRODUCTION_PLAN_RECORD_CONVERGENCE_V2",
      synthetic_cast_reconstructed_from_generic_roles:
        roleOnlyGenericCast(shot),
      real_identity_reference_prohibited: true,
    },
  };
}

function normalizePlan(plan = {}) {
  return {
    ...plan,
    scenes: list(plan.scenes).map((scene) => ({
      ...scene,
      shots: list(scene.shots).map(normalizeSyntheticCast),
    })),
    production: {
      ...object(plan.production),
      synthetic_cast_record_convergence_required: true,
    },
    validation_summary: {
      ...object(plan.validation_summary),
      synthetic_cast_record_convergence_contract:
        "CREATIVE_PRODUCTION_PLAN_RECORD_CONVERGENCE_V2",
    },
  };
}

function scenePlanIndex(scene = {}, fallback = null) {
  return finiteIndex(scene.metadata?.master_plan_index) ??
    finiteIndex(Number(scene.scene_number) - 1) ??
    fallback;
}

function shotPlanIndex(shot = {}) {
  return finiteIndex(shot.metadata?.master_plan_shot_index) ??
    finiteIndex(Number(shot.shot_number) - 1);
}

function convergeScenes(scenes = [], plan = {}) {
  const planScenes = list(plan.scenes);
  return list(scenes).map((scene, fallbackIndex) => {
    const index = scenePlanIndex(scene, fallbackIndex);
    const planScene = index === null ? null : planScenes[index];
    if (!planScene) return scene;
    return {
      ...scene,
      ...planScene,
      id: scene.id,
      organization_id: scene.organization_id,
      creative_project_id: scene.creative_project_id,
      storyboard_id: scene.storyboard_id,
      scene_number: scene.scene_number,
      metadata: {
        ...object(planScene.metadata),
        ...object(scene.metadata),
        master_plan_index: index,
        production_plan_record_converged: true,
      },
    };
  });
}

function convergeShots(shots = [], scenes = [], plan = {}) {
  const planScenes = list(plan.scenes);
  const sceneIndexes = new Map(
    list(scenes).map((scene, fallbackIndex) => [
      text(scene.id),
      scenePlanIndex(scene, fallbackIndex),
    ]),
  );

  return list(shots).map((shot) => {
    const sceneIndex = finiteIndex(shot.metadata?.master_plan_scene_index) ??
      sceneIndexes.get(text(shot.scene_id)) ??
      finiteIndex(Number(shot.scene_number) - 1);
    const shotIndex = shotPlanIndex(shot);
    const planShot = sceneIndex === null || shotIndex === null
      ? null
      : list(planScenes[sceneIndex]?.shots)[shotIndex];
    if (!planShot) return normalizeSyntheticCast(shot);

    const converged = {
      ...shot,
      ...planShot,
      id: shot.id,
      organization_id: shot.organization_id,
      creative_project_id: shot.creative_project_id,
      storyboard_id: shot.storyboard_id,
      scene_id: shot.scene_id,
      scene_number: shot.scene_number,
      shot_number: shot.shot_number,
      reference_asset_ids: unique([
        shot.reference_asset_ids,
        planShot.reference_asset_ids,
      ]),
      identity_requirements: {
        ...object(shot.identity_requirements),
        ...object(planShot.identity_requirements),
      },
      performance_contract: {
        ...object(shot.performance_contract),
        ...object(planShot.performance_contract),
      },
      cast_contract: {
        ...object(shot.cast_contract),
        ...object(planShot.cast_contract),
      },
      generation: {
        ...object(shot.generation),
        ...object(planShot.generation),
        provider_parameters: {
          ...object(shot.generation?.provider_parameters),
          ...object(planShot.generation?.provider_parameters),
        },
      },
      metadata: {
        ...object(planShot.metadata),
        ...object(shot.metadata),
        master_plan_scene_index: sceneIndex,
        master_plan_shot_index: shotIndex,
        production_plan_record_converged: true,
      },
    };

    return normalizeSyntheticCast(converged);
  });
}

function install() {
  if (ProductionGraphRuntime[INSTALL_FLAG]) return;

  const planWithoutRecordConvergence =
    ProductionGraphRuntime.plan.bind(ProductionGraphRuntime);

  Object.defineProperty(ProductionGraphRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionGraphRuntime.plan =
    async function planWithRecordConvergence(input = {}) {
      const creativePlan = normalizePlan(object(input.creative_plan));
      const scenes = convergeScenes(input.scenes, creativePlan);
      const shots = convergeShots(input.shots, scenes, creativePlan);

      return planWithoutRecordConvergence({
        ...input,
        creative_plan: creativePlan,
        scenes,
        shots,
      });
    };
}

install();

export const CreativeProductionPlanRecordConvergenceRuntime = {
  installed: true,
  syntheticCastShot,
  normalizeSyntheticCast,
};
