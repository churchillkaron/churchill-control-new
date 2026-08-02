import {
  CreativeCastClassificationRuntime,
} from "@/lib/creative/identity/runtime/CreativeCastClassificationRuntime";

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

function normalized(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function unique(values = []) {
  return [...new Set(values.flat(Infinity).map((value) => text(
    value?.asset_id || value?.assetId || value?.id || value,
  )).filter(Boolean))];
}

function planShotMap(plan = {}) {
  const map = new Map();
  for (const [sceneIndex, scene] of list(plan.scenes).entries()) {
    for (const [shotIndex, shot] of list(scene.shots).entries()) {
      const id = text(shot.id);
      if (id) map.set(id, shot);
      map.set(`${sceneIndex}:${shotIndex}`, shot);
    }
  }
  return map;
}

function sourceShotFor(shot = {}, sourceShots = [], planMap = new Map()) {
  const exact = list(sourceShots).find((candidate) =>
    text(candidate.id) === text(shot.id),
  );
  if (exact) return exact;
  const sceneIndex = Number(shot.metadata?.master_plan_scene_index);
  const shotIndex = Number(shot.metadata?.master_plan_shot_index);
  if (Number.isInteger(sceneIndex) && Number.isInteger(shotIndex)) {
    return planMap.get(`${sceneIndex}:${shotIndex}`) || shot;
  }
  return planMap.get(text(shot.id)) || shot;
}

function actorValues(shot = {}) {
  return list(shot.actors).flatMap((actor) => [
    actor?.name,
    actor?.label,
    actor?.role,
    actor?.description,
    actor,
  ]).map(normalized).filter(Boolean);
}

const GENERIC_ROLE_TERMS = new Set([
  "staff",
  "staff member",
  "employee",
  "team member",
  "service team",
  "bartender",
  "bar staff",
  "server",
  "waiter",
  "waitress",
  "chef",
  "cook",
  "host",
  "hostess",
  "cashier",
  "manager",
  "supervisor",
  "worker",
  "crew",
  "operator",
  "attendant",
  "assistant",
  "technician",
  "specialist",
  "customer",
  "client",
  "guest",
  "visitor",
  "patron",
  "diner",
  "audience",
  "crowd",
  "participant",
  "passerby",
  "family",
  "couple",
  "friends",
  "friend",
  "adult",
  "woman",
  "man",
  "girl",
  "boy",
  "people",
  "person",
  "human",
  "extra",
  "extras",
  "player",
  "players",
  "new arrival",
  "arriving guest",
  "venue guest",
  "social group",
]);

function genericRoleValue(value) {
  const source = normalized(value);
  if (!source) return false;
  if (GENERIC_ROLE_TERMS.has(source)) return true;
  const words = source.split(/\s+/).filter(Boolean);
  return words.some((word) => GENERIC_ROLE_TERMS.has(word)) ||
    /^(staff|guest|customer|client|patron|diner|friend|player|extra|person|participant|bartender|server|waiter|waitress|chef|host|crew|team)\s*\d*$/.test(source);
}

function genericRoleSource(shot = {}) {
  const actors = list(shot.actors);
  if (actors.length) {
    return actors.every((actor) => {
      const record = object(actor);
      if (text(
        record.identity_id ||
        record.person_id ||
        record.identity_profile_id ||
        record.profile_id,
      )) return false;
      if ((record.role || record.label) && !record.name) return true;
      return actorValues({ actors: [actor] }).every(genericRoleValue);
    });
  }
  const source = normalized([
    shot.title,
    shot.subject,
    shot.purpose,
    shot.action,
    shot.performance,
  ].filter(Boolean).join(" "));
  return /\b(staff|employee|bartender|server|waiter|waitress|chef|host|customer|client|guest|visitor|patron|diner|crowd|audience|friends|family|couple|players|participants|extras)\b/.test(source);
}

function explicitSourceIdentity(shot = {}) {
  const requirements = object(shot.identity_requirements);
  const performance = object(shot.performance_contract);
  const lock = object(shot.generation?.identity_lock);
  const actorIdentity = list(shot.actors).some((actor) => Boolean(text(
    actor?.identity_id ||
    actor?.person_id ||
    actor?.identity_profile_id ||
    actor?.profile_id,
  )));
  return actorIdentity ||
    Boolean(text(
      requirements.profile_id ||
      requirements.identity_profile_id ||
      performance.identity_profile_id ||
      lock.identity_profile_id,
    )) ||
    unique([
      requirements.reference_asset_ids,
      performance.identity_reference_asset_ids,
      lock.reference_asset_node_ids,
    ]).length > 0;
}

function sourceClassification(shot = {}) {
  const classified = CreativeCastClassificationRuntime.classifyShot(shot);
  if (classified.synthetic_cast) return classified;
  if (genericRoleSource(shot) && !explicitSourceIdentity(shot)) {
    return {
      mode: "SYNTHETIC_CAST",
      human: true,
      real_identity: false,
      synthetic_cast: true,
      unresolved: false,
      reason: "GENERIC_ROLE_RECOVERED_AFTER_PERFORMANCE_ENRICHMENT",
    };
  }
  return classified;
}

function forceSyntheticCast(performanceShot = {}, sourceShot = {}) {
  const sourceCast = object(sourceShot.cast_contract);
  const sourceRequirements = object(sourceShot.identity_requirements);
  const sourcePerformance = object(sourceShot.performance_contract);
  const generation = object(performanceShot.generation);
  const parameters = object(generation.provider_parameters);
  const seeded = {
    ...performanceShot,
    actors: list(sourceShot.actors),
    cast_contract: sourceCast,
    identity_requirements: {
      ...object(performanceShot.identity_requirements),
      ...sourceRequirements,
      mode: "SYNTHETIC_CAST",
      profile_id: null,
      identity_profile_id: null,
      reference_asset_ids: [],
      required: false,
      preserve_real_identity: false,
      real_person_identity_reference_prohibited: true,
      verification_required: false,
      reject_identity_drift: false,
    },
    performance_contract: {
      ...object(performanceShot.performance_contract),
      ...sourcePerformance,
      identity_profile_id: null,
      identity_reference_asset_ids: [],
      identity_lock_required: false,
      identity_verification_required: false,
      synthetic_cast: true,
    },
    generation: {
      ...generation,
      identity_lock: {
        ...object(generation.identity_lock),
        required: false,
        mode: "SYNTHETIC_CAST",
        identity_profile_id: null,
        reference_asset_node_ids: [],
      },
      provider_parameters: {
        ...parameters,
        identity_profile: null,
        identity_profile_id: null,
        identity_reference_asset_ids: [],
      },
    },
    metadata: {
      ...object(performanceShot.metadata),
      identity_profile: null,
      identity_profile_id: null,
      identity_reference_asset_ids: [],
      synthetic_cast_source_recovered: true,
      synthetic_cast_source_recovery_contract:
        "CREATIVE_PERFORMANCE_CONTRACT_CONVERGENCE_V1",
    },
  };
  return CreativeCastClassificationRuntime.normalizeSyntheticShot(seeded);
}

function singingSemantics(shot = {}) {
  const source = normalized([
    shot.performance,
    shot.action,
    shot.purpose,
    shot.subject,
  ].filter(Boolean).join(" "));
  return /\b(sing|sings|singing|sung|vocal|lyrics|verse|chorus|live music|band performance)\b/.test(source);
}

function reconcileVocalContract(shot = {}, primaryAudioId = null) {
  const contract = object(shot.performance_contract);
  const explicitAudioId = text(
    contract.primary_audio_asset_id || primaryAudioId,
  );
  const validAudioRange = Number.isFinite(Number(contract.audio_start_seconds)) &&
    Number.isFinite(Number(contract.audio_end_seconds)) &&
    Number(contract.audio_end_seconds) > Number(contract.audio_start_seconds);
  const audioConditioned = Boolean(
    explicitAudioId &&
    validAudioRange &&
    contract.singing_visible === true &&
    contract.mouth_visible === true,
  );

  if (audioConditioned) {
    return {
      ...shot,
      performance_contract: {
        ...contract,
        visible_singing: true,
        lip_sync_required: true,
        primary_audio_asset_id: explicitAudioId,
      },
    };
  }

  const ambientPerformance = singingSemantics(shot) ||
    contract.singing_visible === true ||
    contract.visible_singing === true;
  if (!ambientPerformance) {
    return {
      ...shot,
      performance_contract: {
        ...contract,
        visible_singing: false,
        singing_visible: false,
        lip_sync_required: false,
      },
    };
  }

  const generation = object(shot.generation);
  return {
    ...shot,
    performance_contract: {
      ...contract,
      visible_singing: false,
      singing_visible: false,
      mouth_visible: false,
      lip_sync_required: false,
      primary_audio_asset_id: null,
      ambient_live_performance_without_source_vocal: true,
      visible_lyric_articulation_prohibited: true,
    },
    generation: {
      ...generation,
      provider_prompt: [
        text(generation.provider_prompt),
        "LIVE PERFORMANCE SAFETY: No source vocal recording is assigned to this shot. Preserve the live-music atmosphere through instrumental action, crowd response, body movement, hands, stage lighting and environmental sound cues, but do not show readable lyric articulation or an unobscured mouth visibly singing. Frame vocalists off-axis, between phrases, in silhouette, from behind, or focus on instrumental performers until exact source audio is available.",
      ].filter(Boolean).join("\n\n"),
      provider_parameters: {
        ...object(generation.provider_parameters),
        visible_singing: false,
        lip_sync_required: false,
        source_vocal_audio_available: false,
      },
    },
    metadata: {
      ...object(shot.metadata),
      ambient_live_performance_without_source_vocal: true,
      visible_lyric_articulation_prohibited: true,
      vocal_contract_convergence:
        "CREATIVE_PERFORMANCE_CONTRACT_CONVERGENCE_V1",
    },
  };
}

function videoShot(shot = {}) {
  const capability = text(
    shot.generation?.capability ||
    shot.generation?.service ||
    shot.capability ||
    shot.service_id,
  ).toLowerCase();
  return capability.includes("video");
}

function convergence({
  performance_bound = {},
  source_shots = [],
  source_plan = {},
} = {}) {
  const planMap = planShotMap(source_plan);
  const primaryAudioId = text(
    performance_bound.performance_context?.primary_audio?.asset_id ||
    performance_bound.creative_plan?.production?.primary_audio_asset_id,
  ) || null;

  const shots = list(performance_bound.shots).map((performanceShot) => {
    const sourceShot = sourceShotFor(performanceShot, source_shots, planMap);
    const classification = sourceClassification(sourceShot);
    const castReconciled = classification.synthetic_cast
      ? forceSyntheticCast(performanceShot, sourceShot)
      : performanceShot;
    return reconcileVocalContract(castReconciled, primaryAudioId);
  });

  const finalClassifications = shots.map((shot) => ({
    shot,
    classification: CreativeCastClassificationRuntime.classifyShot(shot),
  }));
  const realIdentityVideoCount = finalClassifications.filter((entry) =>
    entry.classification.real_identity && videoShot(entry.shot),
  ).length;
  const lipSyncShotIds = shots
    .filter((shot) => shot.performance_contract?.lip_sync_required === true)
    .map((shot) => shot.id);
  const creativePlan = object(performance_bound.creative_plan);

  return {
    ...performance_bound,
    shots,
    creative_plan: {
      ...creativePlan,
      production: {
        ...object(creativePlan.production),
        identity_story_keyframe_required_before_video:
          realIdentityVideoCount > 0,
        identity_story_keyframe_human_approval_required_before_video:
          realIdentityVideoCount > 0,
        audio_conditioned_lip_sync_required:
          lipSyncShotIds.length > 0,
        performance_contract_convergence:
          "CREATIVE_PERFORMANCE_CONTRACT_CONVERGENCE_V1",
      },
      performance_context: {
        ...object(creativePlan.performance_context),
        lip_sync_shot_ids: lipSyncShotIds,
        real_identity_video_shot_count: realIdentityVideoCount,
        performance_contract_convergence:
          "CREATIVE_PERFORMANCE_CONTRACT_CONVERGENCE_V1",
      },
      validation_summary: {
        ...object(creativePlan.validation_summary),
        real_identity_video_shot_count: realIdentityVideoCount,
        lip_sync_shot_count: lipSyncShotIds.length,
        performance_contract_convergence_passed: true,
      },
    },
    performance_context: {
      ...object(performance_bound.performance_context),
      lip_sync_shot_ids: lipSyncShotIds,
      real_identity_video_shot_count: realIdentityVideoCount,
      performance_contract_convergence:
        "CREATIVE_PERFORMANCE_CONTRACT_CONVERGENCE_V1",
    },
  };
}

export const CreativePerformanceContractConvergenceRuntime = {
  apply: convergence,
  sourceClassification,
  reconcileVocalContract,
};
