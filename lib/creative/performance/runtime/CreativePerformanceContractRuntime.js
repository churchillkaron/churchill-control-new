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
  return [...new Set(values.flat(Infinity).map((value) => text(
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

  if (mime.startsWith("audio/") || type.includes("audio") || type.includes("music") || /\.(mp3|wav|m4a|aac|flac|ogg)(\?|$)/.test(source)) {
    return "audio";
  }
  if (mime.startsWith("video/") || type.includes("video") || /\.(mp4|mov|m4v|webm)(\?|$)/.test(source)) {
    return "video";
  }
  if (mime.startsWith("image/") || type.includes("image") || /\.(jpg|jpeg|png|webp|heic)(\?|$)/.test(source)) {
    return "image";
  }
  return "other";
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

function evidenceText(value = {}) {
  const analysis = object(value.analysis);
  const identity = object(analysis.identity);
  const people = list(
    analysis.detected_people ||
    analysis.people ||
    analysis.persons ||
    analysis.subjects,
  );
  return [
    value.name,
    value.title,
    value.file_name,
    value.description,
    analysis.description,
    analysis.summary,
    identity.name,
    identity.label,
    identity.description,
    ...list(value.tags),
    ...list(analysis.tags),
    ...people.flatMap((person) => [
      person?.name,
      person?.label,
      person?.role,
      person?.description,
    ]),
  ].map(text).filter(Boolean).join(" ").toLowerCase();
}

function humanEvidenceScore(asset = {}) {
  if (!["image", "video"].includes(assetKind(asset))) return -100;
  const source = evidenceText(asset);
  let score = 0;
  if (/\b(face|facial|portrait|person|people|human|performer|singer|artist|actor|actress|model|dancer|woman|man|girl|boy)\b/.test(source)) score += 8;
  if (/\b(close[- ]?up|headshot|identity|subject)\b/.test(source)) score += 5;
  if (/\b(logo|menu|building|venue|food|product|object|landscape|empty room)\b/.test(source)) score -= 4;
  if (list(asset.analysis?.detected_people || asset.analysis?.people).length) score += 10;
  if (object(asset.analysis?.identity).id || object(asset.analysis?.identity).name) score += 10;
  return score;
}

function identityKey(asset = {}) {
  const analysis = object(asset.analysis);
  const identity = object(analysis.identity);
  const person = list(
    analysis.detected_people ||
    analysis.people ||
    analysis.persons ||
    analysis.subjects,
  )[0] || {};
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
  const candidates = list(assets)
    .map((asset) => ({ asset, score: humanEvidenceScore(asset) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
  const groups = new Map();

  for (const entry of candidates) {
    const key = identityKey(entry.asset) || "primary-performer";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  return [...groups.entries()]
    .map(([key, entries], index) => ({
      id: `identity-profile-${index + 1}`,
      identity_key: key,
      reference_asset_ids: unique(entries.map((entry) => assetId(entry.asset))).slice(0, 6),
      confidence: Math.min(100, Math.max(0, Math.round(
        entries.reduce((sum, entry) => sum + entry.score, 0) / Math.max(1, entries.length) * 8,
      ))),
      evidence: entries.slice(0, 6).map((entry) => ({
        asset_id: assetId(entry.asset),
        score: entry.score,
        analysis_status:
          entry.asset.analysis_status ||
          entry.asset.analysis?.status ||
          (Object.keys(object(entry.asset.analysis)).length ? "ANALYSED" : "UNVERIFIED"),
      })),
    }))
    .filter((profile) => profile.reference_asset_ids.length)
    .sort((left, right) =>
      right.reference_asset_ids.length - left.reference_asset_ids.length ||
      right.confidence - left.confidence,
    );
}

function selectPrimaryAudio(assets = [], creativePlan = {}) {
  const explicitId = text(
    creativePlan.performance_context?.primary_audio_asset_id ||
    creativePlan.production?.primary_audio_asset_id ||
    creativePlan.audio?.primary_asset_id,
  );
  const audio = list(assets)
    .filter((asset) => assetKind(asset) === "audio")
    .map((asset) => {
      const evidence = evidenceText(asset);
      let score = assetDuration(asset) || 0;
      if (/\b(master|song|music|track|single|soundtrack|vocal|mix)\b/.test(evidence)) score += 1000;
      if (/\b(sfx|sound effect|ambience|ambient|room tone)\b/.test(evidence)) score -= 500;
      if (assetId(asset) === explicitId) score += 10000;
      return { asset, score };
    })
    .sort((left, right) => right.score - left.score);
  const selected = audio[0]?.asset || null;
  if (!selected) return null;
  return {
    asset_id: assetId(selected),
    name: selected.name || selected.title || selected.file_name || null,
    duration_seconds: assetDuration(selected),
    analysis_status:
      selected.analysis_status ||
      selected.analysis?.status ||
      (Object.keys(object(selected.analysis)).length ? "ANALYSED" : "UNVERIFIED"),
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

function combinedShotText(shot = {}, planShot = {}) {
  return [
    planShot.subject,
    planShot.action,
    planShot.performance,
    shot.subject,
    shot.action,
    shot.purpose,
    shot.performance,
    object(shot.performance_direction).description,
    ...list(planShot.dialogue).map((entry) => entry?.text || entry),
    ...list(shot.dialogue).map((entry) => entry?.text || entry),
  ].map(text).filter(Boolean).join(" ").toLowerCase();
}

function hasHumanSubject(shot = {}, planShot = {}) {
  if (list(shot.actors).length || list(planShot.actors).length) return true;
  return /\b(person|people|human|performer|singer|artist|actor|actress|model|dancer|woman|man|girl|boy|face|portrait)\b/.test(
    combinedShotText(shot, planShot),
  );
}

function singingVisible(shot = {}, planShot = {}) {
  const explicit = [
    planShot.performance_contract?.singing_visible,
    planShot.performance_contract?.visible_singing,
    planShot.lip_sync_required,
    shot.performance_contract?.singing_visible,
    shot.performance_contract?.visible_singing,
    shot.lip_sync_required,
  ].find((value) => typeof value === "boolean");
  if (typeof explicit === "boolean") return explicit;

  return /\b(sing|sings|singing|sung|lip[- ]?sync|mouths? (the )?(lyrics|words)|vocal performance|performs? (the )?(song|verse|chorus)|delivers? (the )?(verse|chorus|lyric))\b/.test(
    combinedShotText(shot, planShot),
  );
}

function resolveMouthVisibility(shot = {}, planShot = {}, visibleSinging = false) {
  const explicit = [
    planShot.performance_contract?.mouth_visible,
    planShot.performance_contract?.mouth_visibility,
    shot.performance_contract?.mouth_visible,
    shot.performance_contract?.mouth_visibility,
  ].find((value) => typeof value === "boolean" || text(value));
  if (typeof explicit === "boolean") return explicit;
  if (text(explicit)) {
    return !/^(false|none|hidden|not visible|obscured)$/i.test(text(explicit));
  }

  const camera = [
    planShot.camera?.framing,
    planShot.camera?.angle,
    planShot.camera?.camera_distance,
    shot.camera?.framing,
    shot.camera?.angle,
    shot.camera?.camera_distance,
    combinedShotText(shot, planShot),
  ].map(text).join(" ").toLowerCase();
  if (/\b(from behind|rear view|back to camera|face hidden|mouth hidden|obscured|silhouette|extreme wide|aerial|crowd only)\b/.test(camera)) {
    return false;
  }
  if (/\b(close[- ]?up|medium close|medium shot|front|three quarter|face visible|facial)\b/.test(camera)) {
    return true;
  }
  return visibleSinging;
}

function actorLabels(shot = {}, planShot = {}) {
  return list(shot.actors).concat(list(planShot.actors))
    .flatMap((actor) => [actor?.name, actor?.label, actor?.role, actor])
    .map(text)
    .filter((value) => value.length > 1)
    .map((value) => value.toLowerCase());
}

function selectIdentityProfile({ shot, planShot, profiles, assetMap }) {
  const explicitIds = unique([
    shot.reference_asset_ids,
    planShot.reference_asset_ids,
    list(shot.reference_assets).map((item) => item?.asset_id || item),
    list(planShot.reference_assets).map((item) => item?.asset_id || item),
  ]);
  const explicitHumanIds = explicitIds.filter((id) => {
    const asset = assetMap.get(id);
    return asset && humanEvidenceScore(asset) > 0;
  });
  if (explicitHumanIds.length) {
    return {
      id: "shot-explicit-identity",
      reference_asset_ids: explicitHumanIds.slice(0, 6),
      confidence: 100,
      evidence: explicitHumanIds.map((asset_id) => ({ asset_id, source: "shot_reference" })),
    };
  }

  const labels = actorLabels(shot, planShot);
  if (labels.length) {
    const matched = profiles.find((profile) => profile.reference_asset_ids.some((id) => {
      const evidence = evidenceText(assetMap.get(id) || {});
      return labels.some((label) => evidence.includes(label));
    }));
    if (matched) return matched;
  }

  return profiles[0] || null;
}

function providerPromptSuffix({ identityProfile, contract }) {
  const lines = [];
  if (identityProfile?.reference_asset_ids?.length) {
    lines.push(
      `IDENTITY CONTINUITY: Use the supplied identity reference asset IDs ${identityProfile.reference_asset_ids.join(", ")} as the visual identity source. The visible person must remain recognisably the same individual across the entire shot. Preserve stable facial geometry, skin detail, body proportions and verified distinctive features. Do not average the references into a new person and do not replace the performer with a generic lookalike.`,
    );
  }
  if (contract.lip_sync_required) {
    lines.push(
      `VOCAL PERFORMANCE: The visible performer is singing during source-audio time ${contract.audio_start_seconds.toFixed(3)}s to ${contract.audio_end_seconds.toFixed(3)}s. Mouth, jaw, breath, facial effort and phrase timing must synchronise to that exact audio segment. Preserve natural performance between phonemes and do not generate unrelated mouth movement.`,
    );
  } else {
    lines.push(
      "PERFORMANCE LOGIC: Do not invent singing, dialogue, mouth articulation or handheld props unless the shot direction and assigned audio explicitly require them.",
    );
  }
  return lines.join("\n");
}

function mergeProviderPrompt(base, suffix) {
  return [text(base), text(suffix)].filter(Boolean).join("\n\n");
}

export function buildCreativePerformanceContracts({
  scenes = [],
  shots = [],
  creative_plan = {},
  assets = [],
} = {}) {
  const planScenes = list(creative_plan.scenes);
  const assetMap = new Map(list(assets).map((asset) => [assetId(asset), asset]));
  const primaryAudio = selectPrimaryAudio(assets, creative_plan);
  const identityProfiles = buildIdentityProfiles(assets);
  const sceneOrder = new Map(list(scenes).map((scene, index) => [text(scene.id), index]));
  const sortedShots = [...list(shots)].sort((left, right) => {
    const sceneDifference = (sceneOrder.get(text(left.scene_id)) ?? 0) - (sceneOrder.get(text(right.scene_id)) ?? 0);
    if (sceneDifference) return sceneDifference;
    return Number(left.shot_number || 0) - Number(right.shot_number || 0);
  });
  const enrichedById = new Map();
  let cursor = 0;

  for (const shot of sortedShots) {
    const scene = list(scenes).find((candidate) => text(candidate.id) === text(shot.scene_id)) || {};
    const planScene = planSceneFor(scene, planScenes);
    const planShot = planShotFor(shot, planScene);
    const duration = Math.max(0.001, finite(planShot.duration_seconds || shot.duration_seconds) || 5);
    const explicitStart = finite(
      planShot.performance_contract?.audio_start_seconds ||
      shot.performance_contract?.audio_start_seconds ||
      planShot.timeline_start_seconds ||
      shot.timeline_start_seconds,
    );
    const audioStart = explicitStart === null ? cursor : explicitStart;
    const explicitEnd = finite(
      planShot.performance_contract?.audio_end_seconds ||
      shot.performance_contract?.audio_end_seconds,
    );
    const audioEnd = explicitEnd !== null && explicitEnd > audioStart
      ? explicitEnd
      : audioStart + duration;
    const performerVisible = hasHumanSubject(shot, planShot);
    const visibleSinging = performerVisible && singingVisible(shot, planShot);
    const mouthVisible = performerVisible && resolveMouthVisibility(shot, planShot, visibleSinging);
    const identityProfile = performerVisible
      ? selectIdentityProfile({ shot, planShot, profiles: identityProfiles, assetMap })
      : null;
    const lipSyncRequired = Boolean(
      primaryAudio?.asset_id &&
      visibleSinging &&
      mouthVisible,
    );
    const referenceAssetIds = unique([
      shot.reference_asset_ids,
      planShot.reference_asset_ids,
      identityProfile?.reference_asset_ids,
    ]);
    const contract = {
      version: "CREATIVE_PERFORMANCE_CONTRACT_V1",
      performer_visible: performerVisible,
      singing_visible: visibleSinging,
      mouth_visible: mouthVisible,
      lip_sync_required: lipSyncRequired,
      primary_audio_asset_id: primaryAudio?.asset_id || null,
      audio_start_seconds: audioStart,
      audio_end_seconds: audioEnd,
      duration_seconds: audioEnd - audioStart,
      identity_profile_id: identityProfile?.id || null,
      identity_reference_asset_ids: identityProfile?.reference_asset_ids || [],
      preserve_source_audio: true,
      generated_at: new Date().toISOString(),
    };
    const promptSuffix = providerPromptSuffix({ identityProfile, contract });
    const planGeneration = object(planShot.generation);
    const shotGeneration = object(shot.generation);
    const providerParameters = {
      ...object(shotGeneration.provider_parameters),
      ...object(planGeneration.provider_parameters),
      performance_contract: contract,
      identity_profile: identityProfile,
      identity_reference_asset_ids: identityProfile?.reference_asset_ids || [],
      reference_asset_ids: referenceAssetIds,
    };

    enrichedById.set(text(shot.id), {
      ...shot,
      subject: shot.subject || planShot.subject || "",
      performance: shot.performance || planShot.performance || "",
      duration_seconds: duration,
      reference_asset_ids: referenceAssetIds,
      identity_requirements: {
        ...object(planShot.identity_requirements),
        ...object(shot.identity_requirements),
        required: Boolean(identityProfile),
        profile_id: identityProfile?.id || null,
        reference_asset_ids: identityProfile?.reference_asset_ids || [],
        confidence: identityProfile?.confidence ?? null,
        reject_identity_drift: Boolean(identityProfile),
      },
      performance_direction: {
        ...object(shot.performance_direction),
        description: shot.performance_direction?.description || planShot.performance || shot.performance || "",
        contract,
      },
      performance_contract: contract,
      generation: {
        ...shotGeneration,
        ...planGeneration,
        provider_prompt: mergeProviderPrompt(
          planGeneration.provider_prompt || shotGeneration.provider_prompt || shot.provider_prompt,
          promptSuffix,
        ),
        provider_parameters: providerParameters,
        output_spec: {
          ...object(shotGeneration.output_spec),
          ...object(planGeneration.output_spec),
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
    version: "CREATIVE_PERFORMANCE_CONTEXT_V1",
    primary_audio: primaryAudio,
    identity_profiles: identityProfiles,
    planned_duration_seconds: cursor,
    target_duration_seconds: targetDuration,
    coverage_gap_seconds: coverageGap,
    full_duration_coverage: targetDuration === null || coverageGap <= 0.25,
    lip_sync_shot_ids: enrichedShots
      .filter((shot) => shot.performance_contract?.lip_sync_required)
      .map((shot) => shot.id),
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

export const CreativePerformanceContractRuntime = {
  build: buildCreativePerformanceContracts,
};
