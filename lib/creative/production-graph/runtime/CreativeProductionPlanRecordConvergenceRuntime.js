import {
  ProductionGraphRuntime,
} from "./ProductionGraphRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.production-plan-record-convergence.v1",
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

function syntheticCastShot(shot = {}) {
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

function normalizeSyntheticCast(shot = {}) {
  if (!syntheticCastShot(shot)) return shot;

  const brief = actorBrief(shot);
  const cast = object(shot.cast_contract);
  const requirements = object(shot.identity_requirements);
  const performance = object(
    shot.performance_contract || shot.metadata?.performance_contract,
  );
  const generation = object(shot.generation);
  const providerParameters = object(generation.provider_parameters);
  const nonIdentityReferences = unique([
    shot.reference_asset_ids,
    providerParameters.reference_asset_ids,
  ]).filter((assetId) => !list(
    performance.identity_reference_asset_ids || requirements.reference_asset_ids,
  ).map(text).includes(assetId));

  return {
    ...shot,
    title: neutralizeText(shot.title),
    purpose: neutralizeText(shot.purpose),
    subject: neutralizeText(shot.subject),
    action: neutralizeText(shot.action),
    performance: neutralizeText(shot.performance),
    dialogue: neutralizeValue(shot.dialogue),
    actors: [],
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
      synthetic_cast_profile_id:
        performance.synthetic_cast_profile_id || cast.cast_profile_id || null,
    },
    generation: {
      ...generation,
      identity_lock: {
        ...object(generation.identity_lock),
        required: false,
        mode: "SYNTHETIC_CAST",
        identity_profile_id: null,
        reference_asset_node_ids: [],
        synthetic_cast_profile_id:
          generation.identity_lock?.synthetic_cast_profile_id ||
          cast.cast_profile_id ||
          null,
      },
      provider_parameters: {
        ...providerParameters,
        identity_profile_id: null,
        identity_reference_asset_ids: [],
        reference_asset_ids: nonIdentityReferences,
        cast_mode: cast.mode || "SYNTHETIC_CAST",
        synthetic_cast_contract: Object.keys(cast).length ? cast : null,
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
        "CREATIVE_PRODUCTION_PLAN_RECORD_CONVERGENCE_V1",
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
        "CREATIVE_PRODUCTION_PLAN_RECORD_CONVERGENCE_V1",
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
