function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique(values = []) {
  return [...new Set(list(values).flat(Infinity).map((value) => text(
    value?.asset_id || value?.assetId || value?.id || value,
  )).filter(Boolean))];
}

function assetId(asset = {}) {
  return text(asset.id || asset.asset_id);
}

function assetKind(asset = {}) {
  const mime = text(
    asset.mime_type ||
    asset.metadata?.mime_type ||
    asset.analysis?.mime_type ||
    asset.analysis?.technical?.mime_type,
  ).toLowerCase();
  const type = text(asset.previewType || asset.asset_type || asset.type).toLowerCase();
  const source = text(asset.url || asset.file_url || asset.image_url).toLowerCase();

  if (mime.startsWith("audio/") || type.includes("audio") || /\.(mp3|wav|m4a|aac|flac|ogg|opus)(\?|$)/.test(source)) {
    return "AUDIO";
  }
  if (mime.startsWith("video/") || type.includes("video") || /\.(mp4|mov|m4v|webm|mkv)(\?|$)/.test(source)) {
    return "VIDEO";
  }
  if (mime.startsWith("image/") || type.includes("image") || /\.(jpg|jpeg|png|webp|heic|avif)(\?|$)/.test(source)) {
    return "IMAGE";
  }
  return "OTHER";
}

function assetDuration(asset = {}) {
  return finite(
    asset.duration_seconds ||
    asset.metadata?.duration_seconds ||
    asset.analysis?.duration_seconds ||
    asset.analysis?.technical?.duration_seconds ||
    asset.technical?.duration_seconds,
  );
}

function normalizedRole(value) {
  return text(
    value?.role ||
    value?.type ||
    value?.name ||
    value,
  ).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function declaredRoles(asset = {}) {
  return unique([
    asset.roles,
    asset.reference_roles,
    asset.referenceRoles,
    asset.role,
    asset.asset_role,
    asset.assetRole,
    asset.metadata?.roles,
    asset.metadata?.reference_roles,
    asset.analysis?.roles,
    asset.analysis?.semantic_roles,
    asset.analysis?.reference_roles,
  ].flat(Infinity).map(normalizedRole).filter(Boolean));
}

function faceObservations(asset = {}) {
  const analysis = object(asset.analysis);
  return [
    ...list(analysis.faces),
    ...list(analysis.face_annotations),
    ...list(analysis.faceAnnotations),
    ...list(analysis.vision?.faces),
    ...list(asset.metadata?.faces),
  ];
}

function personObservations(asset = {}) {
  const analysis = object(asset.analysis);
  return [
    ...list(analysis.detected_people),
    ...list(analysis.people),
    ...list(analysis.persons),
    ...list(analysis.subjects),
    ...list(asset.metadata?.people),
  ];
}

function identityEvidence(asset = {}) {
  if (!["IMAGE", "VIDEO"].includes(assetKind(asset))) return false;
  const roles = new Set(declaredRoles(asset));
  return Boolean(
    faceObservations(asset).length ||
    personObservations(asset).length ||
    Object.keys(object(asset.analysis?.identity)).length ||
    roles.has("IDENTITY_REFERENCE") ||
    roles.has("PERSON_IDENTITY_REFERENCE")
  );
}

function identityKey(asset = {}) {
  const analysis = object(asset.analysis);
  const identity = object(analysis.identity);
  const person = personObservations(asset)[0] || {};
  return text(
    identity.id ||
    identity.identity_id ||
    identity.name ||
    analysis.identity_id ||
    analysis.person_id ||
    analysis.face_cluster_id ||
    person.id ||
    person.person_id ||
    person.name ||
    asset.metadata?.identity_id ||
    asset.metadata?.person_id,
  ).toLowerCase();
}

function buildIdentityProfiles(assets = []) {
  const groups = new Map();
  for (const asset of list(assets).filter(identityEvidence)) {
    const key = identityKey(asset) || `unresolved:${assetId(asset)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(asset);
  }

  return [...groups.entries()].map(([key, group], index) => {
    const resolved = !key.startsWith("unresolved:");
    return {
      id: `identity-profile-${index + 1}`,
      identity_key: key,
      resolved,
      reference_asset_ids: unique(group.map(assetId)),
      confidence: resolved ? 100 : 60,
      evidence: group.map((asset) => ({
        asset_id: assetId(asset),
        declared_roles: declaredRoles(asset),
        face_observation_count: faceObservations(asset).length,
        person_observation_count: personObservations(asset).length,
        source: "STRUCTURED_ASSET_EVIDENCE",
      })),
    };
  });
}

function explicitPrimaryAudioId(creativePlan = {}) {
  return text(
    creativePlan.performance_context?.primary_audio_asset_id ||
    creativePlan.performance_context?.primary_audio?.asset_id ||
    creativePlan.production?.primary_audio_asset_id ||
    creativePlan.audio?.primary_asset_id,
  );
}

function selectPrimaryAudio(assets = [], creativePlan = {}) {
  const audioAssets = list(assets).filter((asset) => assetKind(asset) === "AUDIO");
  const explicitId = explicitPrimaryAudioId(creativePlan);
  const rolePrimary = audioAssets.filter((asset) => {
    const roles = new Set(declaredRoles(asset));
    return roles.has("PRIMARY_AUDIO_SOURCE") || roles.has("PRIMARY_AUDIO");
  });

  let selected = null;
  let mode = "UNRESOLVED";
  const blockingIssues = [];

  if (explicitId) {
    selected = audioAssets.find((asset) => assetId(asset) === explicitId) || null;
    mode = selected ? "EXPLICIT_ASSET_ID" : "EXPLICIT_ASSET_ID_NOT_FOUND";
    if (!selected) blockingIssues.push("PRIMARY_AUDIO_ASSET_UNRESOLVED");
  } else if (rolePrimary.length === 1) {
    selected = rolePrimary[0];
    mode = "EXPLICIT_PRIMARY_ROLE";
  } else if (rolePrimary.length > 1) {
    mode = "AMBIGUOUS_PRIMARY_ROLE";
    blockingIssues.push("PRIMARY_AUDIO_ASSET_AMBIGUOUS");
  }

  return {
    asset: selected ? {
      asset_id: assetId(selected),
      name: selected.name || selected.title || selected.file_name || null,
      duration_seconds: assetDuration(selected),
      analysis_status:
        selected.analysis_status ||
        selected.analysis?.status ||
        (Object.keys(object(selected.analysis)).length ? "ANALYSED" : "UNVERIFIED"),
    } : null,
    mode,
    blocking_issues: blockingIssues,
  };
}

function planSceneFor(scene = {}, planScenes = []) {
  const index = Number(scene.metadata?.master_plan_index);
  if (Number.isInteger(index) && planScenes[index]) return planScenes[index];
  return planScenes.find((candidate) => text(candidate.id) === text(scene.id)) || {};
}

function planShotFor(shot = {}, planScene = {}) {
  const index = Number(shot.metadata?.master_plan_shot_index);
  if (Number.isInteger(index) && list(planScene.shots)[index]) return planScene.shots[index];
  return list(planScene.shots).find((candidate) => text(candidate.id) === text(shot.id)) || {};
}

function firstBoolean(values = []) {
  return list(values).find((value) => typeof value === "boolean") ?? null;
}

function explicitBoolean(shot = {}, planShot = {}, field) {
  return firstBoolean([
    planShot.performance_contract?.[field],
    shot.performance_contract?.[field],
    planShot[field],
    shot[field],
    planShot.metadata?.[field],
    shot.metadata?.[field],
  ]);
}

function typedReferenceIds(shot = {}, planShot = {}, roles = []) {
  const accepted = new Set(roles);
  return unique([
    ...list(planShot.reference_assets)
      .filter((item) => accepted.has(normalizedRole(item?.role || item?.asset_role || item?.binding_role)))
      .map((item) => item?.asset_id || item?.assetId),
    ...list(shot.reference_assets)
      .filter((item) => accepted.has(normalizedRole(item?.role || item?.asset_role || item?.binding_role)))
      .map((item) => item?.asset_id || item?.assetId),
  ]);
}

function structuredPerformerVisible(shot = {}, planShot = {}) {
  const explicit = explicitBoolean(shot, planShot, "performer_visible");
  if (explicit !== null) return explicit;
  if (list(shot.actors).length || list(planShot.actors).length) return true;
  if (typedReferenceIds(shot, planShot, ["IDENTITY_REFERENCE"]).length) return true;
  return null;
}

function selectIdentityProfile({ shot, planShot, profiles, assetMap }) {
  const requestedId = text(
    planShot.performance_contract?.identity_profile_id ||
    shot.performance_contract?.identity_profile_id ||
    planShot.identity_requirements?.profile_id ||
    shot.identity_requirements?.profile_id,
  );
  if (requestedId) {
    const exact = profiles.find((profile) => profile.id === requestedId);
    return exact
      ? { profile: exact, mode: "EXPLICIT_PROFILE_ID" }
      : { profile: null, mode: "EXPLICIT_PROFILE_ID_NOT_FOUND" };
  }

  const identityIds = typedReferenceIds(shot, planShot, ["IDENTITY_REFERENCE"])
    .filter((id) => identityEvidence(assetMap.get(id) || {}));
  if (!identityIds.length) return { profile: null, mode: "UNRESOLVED" };

  const matched = profiles.find((profile) =>
    profile.reference_asset_ids.some((id) => identityIds.includes(id)),
  );
  return matched
    ? { profile: matched, mode: "TYPED_IDENTITY_REFERENCE" }
    : { profile: null, mode: "TYPED_IDENTITY_REFERENCE_UNRESOLVED" };
}

const PROMPT_FIELDS = new Set([
  "prompt",
  "provider_prompt",
  "visual_prompt",
  "video_prompt",
  "negative_prompt",
  "instruction",
  "instructions",
]);

function stripPromptFields(value) {
  if (Array.isArray(value)) return value.map(stripPromptFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PROMPT_FIELDS.has(key.toLowerCase()))
      .map(([key, entry]) => [key, stripPromptFields(entry)]),
  );
}

export function buildCreativePerformanceContracts({
  scenes = [],
  shots = [],
  creative_plan = {},
  assets = [],
} = {}) {
  const planScenes = list(creative_plan.scenes);
  const assetMap = new Map(list(assets).map((asset) => [assetId(asset), asset]));
  const audioResolution = selectPrimaryAudio(assets, creative_plan);
  const primaryAudio = audioResolution.asset;
  const identityProfiles = buildIdentityProfiles(assets);
  const sceneOrder = new Map(list(scenes).map((scene, index) => [text(scene.id), index]));
  const sortedShots = [...list(shots)].sort((left, right) => {
    const sceneDifference =
      (sceneOrder.get(text(left.scene_id)) ?? 0) -
      (sceneOrder.get(text(right.scene_id)) ?? 0);
    if (sceneDifference) return sceneDifference;
    return Number(left.shot_number || 0) - Number(right.shot_number || 0);
  });
  const enrichedById = new Map();
  const blockingIssues = [...audioResolution.blocking_issues];
  let cursor = 0;

  for (const shot of sortedShots) {
    const scene = list(scenes).find((candidate) => text(candidate.id) === text(shot.scene_id)) || {};
    const planScene = planSceneFor(scene, planScenes);
    const planShot = planShotFor(shot, planScene);
    const duration = Math.max(0.001, finite(planShot.duration_seconds || shot.duration_seconds) || 5);
    const explicitStart = finite(
      planShot.performance_contract?.audio_start_seconds ??
      shot.performance_contract?.audio_start_seconds ??
      planShot.timeline_start_seconds ??
      shot.timeline_start_seconds,
    );
    const audioStart = explicitStart === null ? cursor : explicitStart;
    const explicitEnd = finite(
      planShot.performance_contract?.audio_end_seconds ??
      shot.performance_contract?.audio_end_seconds,
    );
    const audioEnd = explicitEnd !== null && explicitEnd > audioStart
      ? explicitEnd
      : audioStart + duration;

    const performerVisible = structuredPerformerVisible(shot, planShot);
    const singingVisible = explicitBoolean(shot, planShot, "singing_visible");
    const mouthVisible = explicitBoolean(shot, planShot, "mouth_visible");
    const identityResolution = performerVisible === true
      ? selectIdentityProfile({ shot, planShot, profiles: identityProfiles, assetMap })
      : { profile: null, mode: performerVisible === false ? "NOT_REQUIRED" : "UNRESOLVED" };
    const identityProfile = identityResolution.profile;
    const shotIssues = [];

    if (performerVisible === true && !identityProfile) {
      shotIssues.push("IDENTITY_REFERENCE_UNRESOLVED");
    }
    if (singingVisible === true && !primaryAudio?.asset_id) {
      shotIssues.push("PRIMARY_AUDIO_ASSET_UNRESOLVED");
    }
    if (singingVisible === true && mouthVisible === null) {
      shotIssues.push("MOUTH_VISIBILITY_UNRESOLVED");
    }

    const lipSyncRequired = Boolean(
      primaryAudio?.asset_id &&
      performerVisible === true &&
      singingVisible === true &&
      mouthVisible === true,
    );
    const referenceAssetIds = unique([
      shot.reference_asset_ids,
      planShot.reference_asset_ids,
      list(shot.reference_assets).map((item) => item?.asset_id || item?.assetId),
      list(planShot.reference_assets).map((item) => item?.asset_id || item?.assetId),
      identityProfile?.reference_asset_ids,
    ]);
    const contract = {
      version: "CREATIVE_PERFORMANCE_CONTRACT_V2",
      evidence_contract: "STRUCTURED_PERFORMANCE_EVIDENCE_V1",
      performer_visible: performerVisible,
      singing_visible: singingVisible,
      mouth_visible: mouthVisible,
      lip_sync_required: lipSyncRequired,
      primary_audio_asset_id: primaryAudio?.asset_id || null,
      audio_start_seconds: audioStart,
      audio_end_seconds: audioEnd,
      duration_seconds: audioEnd - audioStart,
      identity_profile_id: identityProfile?.id || null,
      identity_reference_asset_ids: identityProfile?.reference_asset_ids || [],
      identity_resolution_mode: identityResolution.mode,
      audio_resolution_mode: audioResolution.mode,
      preserve_source_audio: true,
      promptless_execution: true,
      stored_prompt_generated: false,
      free_text_routing_used: false,
      fixed_business_vocabulary_used: false,
      implicit_identity_fallback_used: false,
      implicit_audio_ranking_used: false,
      blocking_issues: shotIssues,
      passed: shotIssues.length === 0,
    };
    blockingIssues.push(...shotIssues.map((code) => `${text(shot.id) || "shot"}:${code}`));

    const generation = stripPromptFields({
      ...object(shot.generation),
      ...object(planShot.generation),
    });
    const providerParameters = stripPromptFields({
      ...object(generation.provider_parameters),
      performance_contract: contract,
      identity_profile: identityProfile,
      identity_reference_asset_ids: identityProfile?.reference_asset_ids || [],
      reference_asset_ids: referenceAssetIds,
    });

    enrichedById.set(text(shot.id), {
      ...shot,
      subject: shot.subject || planShot.subject || "",
      performance: shot.performance || planShot.performance || "",
      duration_seconds: duration,
      reference_asset_ids: referenceAssetIds,
      identity_requirements: {
        ...object(planShot.identity_requirements),
        ...object(shot.identity_requirements),
        required: performerVisible === true,
        profile_id: identityProfile?.id || null,
        reference_asset_ids: identityProfile?.reference_asset_ids || [],
        confidence: identityProfile?.confidence ?? null,
        reject_identity_drift: Boolean(identityProfile),
      },
      performance_direction: {
        ...object(shot.performance_direction),
        description:
          shot.performance_direction?.description ||
          planShot.performance ||
          shot.performance ||
          "",
        contract,
      },
      performance_contract: contract,
      generation: {
        ...generation,
        provider_parameters: providerParameters,
        output_spec: {
          ...object(generation.output_spec),
          duration_seconds: duration,
        },
      },
      metadata: {
        ...object(shot.metadata),
        performance_contract: contract,
        identity_profile: identityProfile,
      },
    });
    cursor = Math.max(cursor, audioEnd);
  }

  const enrichedShots = list(shots).map((shot) => enrichedById.get(text(shot.id)) || shot);
  const targetDuration = primaryAudio?.duration_seconds || cursor || null;
  const coverageGap = targetDuration === null ? 0 : Math.max(0, targetDuration - cursor);
  const performanceContext = {
    version: "CREATIVE_PERFORMANCE_CONTEXT_V2",
    evidence_contract: "STRUCTURED_PERFORMANCE_EVIDENCE_V1",
    primary_audio: primaryAudio,
    primary_audio_asset_id: primaryAudio?.asset_id || null,
    audio_resolution_mode: audioResolution.mode,
    identity_profiles: identityProfiles,
    planned_duration_seconds: cursor,
    target_duration_seconds: targetDuration,
    coverage_gap_seconds: coverageGap,
    full_duration_coverage: targetDuration === null || coverageGap <= 0.25,
    lip_sync_shot_ids: enrichedShots
      .filter((shot) => shot.performance_contract?.lip_sync_required)
      .map((shot) => shot.id),
    blocking_issues: unique(blockingIssues),
    passed: blockingIssues.length === 0,
    promptless_execution: true,
    stored_prompt_generated: false,
    free_text_routing_used: false,
    fixed_business_vocabulary_used: false,
    implicit_identity_fallback_used: false,
    implicit_audio_ranking_used: false,
    provider_calls_executed: false,
  };

  return {
    scenes,
    shots: enrichedShots,
    creative_plan: {
      ...creative_plan,
      performance_context: performanceContext,
      production: {
        ...object(creative_plan.production),
        primary_audio_asset_id: primaryAudio?.asset_id || null,
        target_duration_seconds: targetDuration,
        require_full_primary_audio: Boolean(primaryAudio?.asset_id),
      },
      deliverables: list(creative_plan.deliverables).map((deliverable) => ({
        ...deliverable,
        output_spec: {
          ...object(deliverable.output_spec),
          ...(targetDuration ? { duration_seconds: targetDuration } : {}),
        },
      })),
    },
    assets,
    performance_context: performanceContext,
  };
}

export const CreativePerformanceContractRuntime = Object.freeze({
  contract: "CREATIVE_PERFORMANCE_CONTRACT_V2",
  build: buildCreativePerformanceContracts,
});
