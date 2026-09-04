import crypto from "node:crypto";

export const CREATIVE_DIRECTOR_PLAN_CONTRACT =
  "AVANTIQO_CREATIVE_DIRECTOR_PLAN_V2";

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

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function meaningful(value) {
  if (Array.isArray(value)) return value.some(meaningful);
  if (value && typeof value === "object") {
    return Object.values(value).some(meaningful);
  }
  if (typeof value === "string") return Boolean(text(value, 1000));
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  return value === true;
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

function storySignals(shots = []) {
  return list(shots).map((shot) => ({
    shot_id: text(shot.id, 180),
    scene_number: Number(shot.scene_number || 0) || null,
    shot_number: Number(shot.shot_number || 0) || null,
    purpose: text(shot.purpose, 900) || null,
    subject: text(shot.subject, 500) || null,
    action: text(shot.action, 900) || null,
  }));
}

function identityRef(kind, value = {}) {
  if (typeof value === "string" || typeof value === "number") {
    const label = text(value, 500);
    return label ? { kind, id: null, label } : null;
  }
  const source = object(value);
  const id = text(
    source.id ||
      source.actor_id ||
      source.character_id ||
      source.product_id ||
      source.location_id ||
      source.asset_id,
    180,
  );
  const label = text(
    source.name || source.title || source.label || source.subject || source.role,
    500,
  );
  if (!id && !label) return null;
  return { kind, id: id || null, label: label || null };
}

function uniqueIdentityRefs(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values.filter(Boolean)) {
    const key = `${value.kind}:${value.id || ""}:${value.label || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function identityDependencies(shots = []) {
  const characters = [];
  const products = [];
  const locations = [];
  const referenceAssets = [];
  let identityRequirementShotCount = 0;
  let productRequirementShotCount = 0;

  for (const shot of list(shots)) {
    for (const actor of list(shot.actors)) {
      characters.push(identityRef("CHARACTER", actor));
    }
    for (const product of list(shot.products)) {
      products.push(identityRef("PRODUCT", product));
    }
    if (meaningful(shot.location)) {
      locations.push(identityRef("LOCATION", shot.location));
    }
    for (const asset of list(shot.reference_assets)) {
      referenceAssets.push(identityRef("REFERENCE_ASSET", asset));
    }
    const bible = object(shot.metadata?.shot_bible_source);
    if (meaningful(bible.identity_requirements)) identityRequirementShotCount += 1;
    if (meaningful(bible.product_requirements)) productRequirementShotCount += 1;
  }

  const resolvedCharacters = uniqueIdentityRefs(characters);
  const resolvedProducts = uniqueIdentityRefs(products);
  const resolvedLocations = uniqueIdentityRefs(locations);
  const resolvedReferenceAssets = uniqueIdentityRefs(referenceAssets);
  return {
    characters: resolvedCharacters,
    products: resolvedProducts,
    locations: resolvedLocations,
    reference_assets: resolvedReferenceAssets,
    shot_bible_identity_requirement_shot_count: identityRequirementShotCount,
    shot_bible_product_requirement_shot_count: productRequirementShotCount,
    identity_consistency_required: Boolean(
      resolvedCharacters.length ||
        resolvedProducts.length ||
        resolvedLocations.length ||
        resolvedReferenceAssets.length ||
        identityRequirementShotCount ||
        productRequirementShotCount
    ),
  };
}

function continuityDependencies(shots = []) {
  const categories = new Set();
  const sceneIds = new Set();
  const sceneNumbers = new Set();
  let explicitContinuityShotCount = 0;
  let wardrobeShotCount = 0;
  let hairMakeupShotCount = 0;
  let propShotCount = 0;

  for (const shot of list(shots)) {
    if (text(shot.scene_id, 180)) sceneIds.add(text(shot.scene_id, 180));
    if (Number(shot.scene_number || 0)) sceneNumbers.add(Number(shot.scene_number));
    if (meaningful(shot.continuity)) {
      explicitContinuityShotCount += 1;
      categories.add("CONTINUITY_CONTRACT");
    }
    if (list(shot.actors).length) categories.add("CHARACTER_IDENTITY");
    if (list(shot.products).length) categories.add("PRODUCT_IDENTITY");
    if (meaningful(shot.location)) categories.add("LOCATION");
    if (list(shot.reference_assets).length) categories.add("REFERENCE_ASSET");

    const bible = object(shot.metadata?.shot_bible_source);
    if (list(bible.wardrobe).length) {
      wardrobeShotCount += 1;
      categories.add("WARDROBE");
    }
    if (list(bible.hair_makeup).length) {
      hairMakeupShotCount += 1;
      categories.add("HAIR_MAKEUP");
    }
    if (list(bible.props).length) {
      propShotCount += 1;
      categories.add("PROPS");
    }
    if (meaningful(bible.identity_requirements)) categories.add("IDENTITY_REQUIREMENTS");
    if (meaningful(bible.product_requirements)) categories.add("PRODUCT_REQUIREMENTS");
  }

  return {
    cross_shot_review_required: list(shots).length > 1,
    categories: [...categories],
    scene_ids: [...sceneIds],
    scene_numbers: [...sceneNumbers].sort((left, right) => left - right),
    explicit_continuity_shot_count: explicitContinuityShotCount,
    wardrobe_shot_count: wardrobeShotCount,
    hair_makeup_shot_count: hairMakeupShotCount,
    prop_shot_count: propShotCount,
  };
}

function audioDependencyProfile(shots = [], revisionScope = []) {
  let dialogueShotCount = 0;
  let narrationShotCount = 0;
  let audioPlanShotCount = 0;
  let musicShotCount = 0;
  let soundEffectShotCount = 0;
  let subtitleShotCount = 0;

  for (const shot of list(shots)) {
    if (list(shot.dialogue).length) dialogueShotCount += 1;
    if (meaningful(shot.narration)) narrationShotCount += 1;
    if (meaningful(shot.audio)) audioPlanShotCount += 1;
    if (meaningful(shot.music) || meaningful(object(shot.audio).music)) {
      musicShotCount += 1;
    }
    if (
      list(shot.sound_effects).length ||
      meaningful(object(shot.audio).sound_effects)
    ) {
      soundEffectShotCount += 1;
    }
    if (list(shot.subtitles).length) subtitleShotCount += 1;
  }

  const dependencyPresent = Boolean(
    dialogueShotCount ||
      narrationShotCount ||
      audioPlanShotCount ||
      musicShotCount ||
      soundEffectShotCount ||
      subtitleShotCount
  );
  const scope = new Set(list(revisionScope));
  return {
    dependency_present: dependencyPresent,
    dialogue_shot_count: dialogueShotCount,
    narration_shot_count: narrationShotCount,
    audio_plan_shot_count: audioPlanShotCount,
    music_shot_count: musicShotCount,
    sound_effect_shot_count: soundEffectShotCount,
    subtitle_shot_count: subtitleShotCount,
    direct_audio_change_authorized_by_current_operation: false,
    audiovisual_review_required: Boolean(
      dependencyPresent &&
        (scope.has("performance") || scope.has("edit") || scope.has("continuity"))
    ),
  };
}

function runtimeProfile(editableShots = [], preservedShots = []) {
  const seconds = (shots) => list(shots).reduce(
    (total, shot) => total + Math.max(0, Number(shot.duration_seconds || 0)),
    0,
  );
  const editableSeconds = seconds(editableShots);
  const preservedSeconds = seconds(preservedShots);
  return {
    editable_current_seconds: editableSeconds,
    preserved_current_seconds: preservedSeconds,
    governed_current_seconds: editableSeconds + preservedSeconds,
    duration_change_authorized_by_current_operation: false,
    estimated_duration_delta_seconds: null,
  };
}

function qcTargets({
  revisionScope,
  governedShots,
  identities,
  continuity,
  audio,
}) {
  const targets = new Set([
    "SHOT_SCOPE_FIDELITY",
    "PRESERVED_SHOT_IMMUTABILITY",
    "PROFESSIONAL_LOCK_COMPLIANCE",
    "STALE_PLAN_FRESHNESS",
  ]);
  const scope = new Set(list(revisionScope));
  if (continuity.cross_shot_review_required || scope.has("continuity")) {
    targets.add("SHOT_TO_SHOT_CONTINUITY");
  }
  if (identities.identity_consistency_required) targets.add("IDENTITY_CONSISTENCY");
  if (identities.products.length) targets.add("PRODUCT_FIDELITY");
  if (identities.reference_assets.length) targets.add("REFERENCE_ASSET_FIDELITY");
  if (audio.audiovisual_review_required) targets.add("AUDIOVISUAL_CONTINUITY");
  if (scope.has("camera") || scope.has("coverage")) {
    targets.add("CINEMATIC_DIRECTION_FIDELITY");
  }
  if (scope.has("performance")) targets.add("PERFORMANCE_DIRECTION_FIDELITY");
  if (scope.has("edit")) targets.add("EDIT_RELATIONSHIP_FIDELITY");
  if (list(governedShots).length > 1) targets.add("SEQUENCE_COHERENCE");
  return [...targets];
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
  const editableSummaries = list(shot_set_plan.summaries);
  const preservedSummaries = list(shot_set_plan.preserved_summaries);
  const editableShots = list(shot_set_plan.shots);
  const preservedShots = list(shot_set_plan.preserved_shots);
  const governedShots = [...editableShots, ...preservedShots];
  const revisionScope = list(shot_set_plan.revision_scope);
  const lockConflicts = list(shot_set_plan.professional_lock_conflicts);
  const changeSetFingerprint = text(shot_set_plan.plan_fingerprint, 180);
  const directorPlanFingerprint = fingerprint({
    experience_mode: experienceMode,
    change_set_fingerprint: changeSetFingerprint,
  });
  const identities = identityDependencies(governedShots);
  const continuity = continuityDependencies(governedShots);
  const audio = audioDependencyProfile(governedShots, revisionScope);
  const runtime = runtimeProfile(editableShots, preservedShots);
  const qualityTargets = qcTargets({
    revisionScope,
    governedShots,
    identities,
    continuity,
    audio,
  });

  return {
    contract: CREATIVE_DIRECTOR_PLAN_CONTRACT,
    plan_type: "VISUAL_CHANGE_SET",
    experience_mode: experienceMode,
    authority: authorityForMode(experienceMode),
    creative_project_id: text(creative_project_id, 180),
    request_ref: text(request_ref, 500) || null,
    objective: text(shot_set_plan.instruction, 1600) || null,
    story: {
      objective: text(shot_set_plan.instruction, 1600) || null,
      touched_shot_intents: storySignals(editableShots),
      preserved_story_context: storySignals(preservedShots),
    },
    change_set: {
      resolution: text(shot_set_plan.resolution, 500) || "EXACT_SET",
      revision_scope: revisionScope,
      editable: {
        shot_count: Number(shot_set_plan.shot_count || editableSummaries.length),
        shots: editableSummaries,
      },
      preserved: {
        shot_count: Number(
          shot_set_plan.preserved_shot_count || preservedSummaries.length,
        ),
        shots: preservedSummaries,
        immutable_during_execution: true,
      },
      professional_lock_conflicts: lockConflicts,
    },
    production_dependencies: {
      continuity,
      identities,
      audio,
      runtime,
    },
    quality: {
      required_qc_targets: qualityTargets,
      automated_qc_executed: false,
      final_delivery_blocked_until_qc: true,
    },
    approvals: {
      read_only_plan: "NO_CONFIRMATION_REQUIRED",
      direction_write: "CONVERSATION_CONFIRMATION",
      professional_lock_override: "NOT_AUTHORIZED_WHILE_LOCKED",
      media_generation: "EXPLICIT_PRODUCTION_CONFIRMATION",
      publication: "SEPARATE_PUBLICATION_APPROVAL",
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
      next_direction_write_spend_class: "PAID_REASONING",
      media_generation_spend_class: "PAID_MEDIA",
      media_generation_authorized: false,
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
