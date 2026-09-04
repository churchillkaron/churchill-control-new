import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  CreativeTemporalMasterPlanRuntime,
} from "./CreativeTemporalMasterPlanRuntime";
import {
  CreativeCinematicCoverageAuthoringRuntime,
} from "./CreativeCinematicCoverageAuthoringRuntime";

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
    asset.technical?.mime_type ||
    asset.metadata?.mime_type ||
    asset.analysis?.technical?.mime_type,
  ).toLowerCase();
  const type = text(asset.asset_type || asset.type).toLowerCase();
  const source = text(asset.url || asset.file_url || asset.image_url).toLowerCase();
  if (mime.startsWith("audio/") || /audio|music/.test(type) || /\.(mp3|wav|m4a|aac|flac|ogg)(\?|$)/.test(source)) return "audio";
  if (mime.startsWith("video/") || type.includes("video") || /\.(mp4|mov|m4v|webm)(\?|$)/.test(source)) return "video";
  if (mime.startsWith("image/") || type.includes("image") || /\.(jpg|jpeg|png|webp|heic)(\?|$)/.test(source)) return "image";
  return "other";
}

function evidenceText(asset = {}) {
  return [
    asset.name,
    asset.title,
    asset.file_name,
    asset.description,
    asset.analysis?.description,
    asset.analysis?.summary,
    asset.analysis?.identity?.name,
    asset.analysis?.identity?.label,
    ...list(asset.tags),
    ...list(asset.analysis?.tags),
  ].map(text).filter(Boolean).join(" ").toLowerCase();
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

function humanAsset(asset = {}) {
  if (!["image", "video"].includes(assetKind(asset))) return false;
  const source = evidenceText(asset);
  return Boolean(
    identityKey(asset) ||
    list(asset.analysis?.detected_people || asset.analysis?.people).length ||
    /\b(face|portrait|person|performer|artist|singer|actor|actress|model|dancer|staff|employee|founder|owner|woman|man)\b/.test(source)
  );
}

function angleTags(asset = {}) {
  const source = evidenceText(asset);
  const tags = [];
  if (/\b(front|frontal|straight on|head on)\b/.test(source)) tags.push("FRONT");
  if (/\b(left profile|left side|profile left)\b/.test(source)) tags.push("LEFT_PROFILE");
  if (/\b(right profile|right side|profile right)\b/.test(source)) tags.push("RIGHT_PROFILE");
  if (/\b(left three quarter|left 3\/4|three-quarter left)\b/.test(source)) tags.push("LEFT_THREE_QUARTER");
  if (/\b(right three quarter|right 3\/4|three-quarter right)\b/.test(source)) tags.push("RIGHT_THREE_QUARTER");
  if (/\b(full body|full-length|standing)\b/.test(source)) tags.push("FULL_BODY");
  if (/\b(close-up|close up|headshot|portrait)\b/.test(source)) tags.push("FACE_DETAIL");
  if (/\b(singing|performing|dancing|movement|walking)\b/.test(source)) tags.push("PERFORMANCE_BODY");
  return tags.length ? tags : ["UNCLASSIFIED"];
}

function buildIdentityProfiles(assets = []) {
  const groups = new Map();
  for (const asset of list(assets).filter(humanAsset)) {
    const key = identityKey(asset) || evidenceText(asset).split(/\s+/).slice(0, 4).join("-") || "primary-person";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(asset);
  }
  return [...groups.entries()].map(([key, group], index) => {
    const references = group.map((asset) => ({
      asset_id: assetId(asset),
      angles: angleTags(asset),
      source_role: "IDENTITY_ONLY",
      background_policy: "EXCLUDE_UNLESS_EXPLICITLY_ASSIGNED",
      url_present: Boolean(asset.url || asset.file_url || asset.image_url),
    })).filter((item) => item.asset_id);
    const angleCoverage = unique(references.flatMap((item) => item.angles));
    return {
      id: `identity-profile-${index + 1}`,
      identity_key: key,
      reference_asset_ids: references.map((item) => item.asset_id),
      references,
      angle_coverage: angleCoverage,
      face_reference_ids: references.filter((item) => item.angles.some((angle) => angle !== "FULL_BODY" && angle !== "PERFORMANCE_BODY")).map((item) => item.asset_id),
      body_reference_ids: references.filter((item) => item.angles.includes("FULL_BODY") || item.angles.includes("PERFORMANCE_BODY")).map((item) => item.asset_id),
      background_reference_policy: "EXCLUDE",
      identity_lock_required: true,
      identity_verification_required: true,
      confidence: Math.min(100, 35 + references.length * 10 + angleCoverage.length * 5),
    };
  }).filter((profile) => profile.reference_asset_ids.length);
}

function primaryAudio(assets = []) {
  return list(assets)
    .filter((asset) => assetKind(asset) === "audio")
    .map((asset) => ({
      asset,
      score:
        (finite(asset.technical?.duration_seconds || asset.analysis?.duration_seconds || asset.metadata?.duration_seconds) || 0) +
        (/\b(master|song|music|track|single|soundtrack|mix)\b/.test(evidenceText(asset)) ? 10000 : 0),
    }))
    .sort((left, right) => right.score - left.score)[0]?.asset || null;
}

function normalizedReasoningOutput(result = {}) {
  const value = result?.output?.output || result?.output || result || {};
  if (value && typeof value === "object") return value.result || value;
  const source = text(value);
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

function projectIsMusicVideo(project = {}, brief = {}, audio = null) {
  const corpus = JSON.stringify({ project, brief }).toLowerCase();
  return Boolean(
    audio && (
      project.metadata?.music_video === true ||
      project.metadata?.full_song === true ||
      /music video|full song|artist video|performance video/.test(corpus)
    )
  );
}

async function createCreativeSynthesis({ organization_id, mission, project, brief, assets, identities, audio }) {
  const result = await ServiceExecutionRuntime.execute({
    organization_id,
    service_id: "ai.reasoning.execute",
    provider_id: null,
    category: "CREATIVE_DIRECTION",
    input: {
      quantity: 1,
      max_output_tokens: 12000,
      response_format: { type: "json_object" },
      prompt: `
You are Avantiqo's world-class music-video director, cultural strategist, choreographer, production designer and editor.
Analyse the complete supplied project as a physical, musical and environmental experience. Lyrics are only one evidence source and must never dominate tempo, groove, energy, social scale or environment.

Return strict JSON only with this structure:
{
  "music_world": {
    "bpm": null,
    "tempo_character": "",
    "danceability": 0,
    "party_energy": 0,
    "groove": "",
    "environmental_world": "",
    "movement_language": "",
    "camera_energy_language": "",
    "lighting_energy_language": "",
    "editing_energy_language": "",
    "sections": [{
      "id": "",
      "start_seconds": 0,
      "end_seconds": 0,
      "musical_role": "INTRO|VERSE|PRE_CHORUS|CHORUS|DROP|BRIDGE|OUTRO|INSTRUMENTAL|OTHER",
      "energy_start": 0,
      "energy_end": 0,
      "rhythmic_density": 0,
      "crowd_energy": 0,
      "performance_energy": 0,
      "environment_state": "",
      "environment_change": "",
      "camera_kinetic_level": 0,
      "edit_density": 0,
      "lighting_movement": "",
      "major_beats_or_impacts": []
    }]
  },
  "identity_strategy": {
    "profiles_used": [],
    "rules": [],
    "backgrounds_are_identity_sources": false,
    "multi_angle_identity_required": true
  },
  "concept_candidates": [{
    "id": "concept-a",
    "title": "",
    "original_world": "",
    "causal_story": "",
    "environment_progression": "",
    "performance_integration": "",
    "music_fit": "",
    "originality_score": 0,
    "energy_fit_score": 0,
    "identity_fit_score": 0,
    "production_feasibility_score": 0,
    "cliche_risks": []
  }],
  "selected_concept_id": "",
  "selection_reason": "",
  "anti_cliche_rules": [],
  "motif_limits": [{"motif":"", "maximum_uses":1, "variation_rule":""}],
  "performance_policy": {
    "artist_or_spokesperson_present": false,
    "visible_performance_required": false,
    "minimum_visible_performance_ratio": 0,
    "mouth_visible_when_singing": true,
    "audio_conditioned_lip_sync_required": true
  }
}

MANDATORY RULES
- Build at least three radically different concepts before selecting one.
- Interpret rhythm, bass, percussion, builds, drops, movement, social energy, environment and audience feeling independently from lyric meaning.
- Reject generic heartbreak symbols, repeated literal lyric illustrations, empty beauty shots, slow visuals over energetic music, generic people walking alone and disconnected montage.
- Uploaded people photos and videos are identity evidence. Preserve the person's exact face and body while allowing completely new environments, wardrobe, lighting, camera angles and story worlds when appropriate.
- Use every usable identity angle collectively. Do not copy an uploaded background unless explicitly assigned as a location reference.
- Every music section must cause a visible environmental, performance, camera, crowd, lighting or editorial state decision.
- Concepts must be original and feasible, not imitations of existing campaigns or artists.

PROJECT
${JSON.stringify(project)}

BRIEF
${JSON.stringify(brief)}

IDENTITY PROFILES
${JSON.stringify(identities)}

PRIMARY AUDIO ANALYSIS
${JSON.stringify(audio ? {
  asset_id: assetId(audio),
  name: audio.name || audio.title || audio.file_name,
  duration_seconds: audio.technical?.duration_seconds || audio.analysis?.duration_seconds || audio.metadata?.duration_seconds,
  analysis: audio.analysis || {},
  metadata: audio.metadata || {},
} : null)}

ASSET ANALYSIS
${JSON.stringify(list(assets).map((asset) => ({
  asset_id: assetId(asset),
  kind: assetKind(asset),
  name: asset.name || asset.title || asset.file_name,
  analysis: asset.analysis || {},
  metadata: asset.metadata || {},
  tags: asset.tags || [],
})))}
`,
    },
    metadata: {
      module: "CREATIVE",
      operation: "UNIVERSAL_MUSIC_WORLD_IDENTITY_SYNTHESIS_V1",
      creative_mission_id: mission?.id || mission?.creative_mission_id || null,
      creative_project_id: project.id,
    },
  });
  const output = normalizedReasoningOutput(result);
  if (!output?.music_world || list(output.concept_candidates).length < 3 || !text(output.selected_concept_id)) {
    throw new Error("UNIVERSAL_CREATIVE_SYNTHESIS_INVALID");
  }
  return { output, result };
}

function sectionForTime(sections = [], start = 0, end = 0) {
  return list(sections).find((section) => {
    const sectionStart = finite(section.start_seconds) ?? 0;
    const sectionEnd = finite(section.end_seconds) ?? Number.POSITIVE_INFINITY;
    return start < sectionEnd && end > sectionStart;
  }) || list(sections)[0] || {};
}

function shotCorpus(shot = {}) {
  return JSON.stringify({
    title: shot.title,
    purpose: shot.purpose,
    subject: shot.subject,
    action: shot.action,
    performance: shot.performance,
    actors: shot.actors,
    dialogue: shot.dialogue,
    metadata: shot.metadata,
  }).toLowerCase();
}

function humanShot(shot = {}) {
  return list(shot.actors).length > 0 || /\b(person|people|artist|performer|singer|actor|actress|model|dancer|staff|employee|founder|owner|woman|man|face|portrait)\b/.test(shotCorpus(shot));
}

function singingShot(shot = {}) {
  return /\b(sing|sings|singing|lip[- ]?sync|vocal performance|performs? the song|verse|chorus|lyric)\b/.test(shotCorpus(shot));
}

function identityForShot(shot, identities) {
  const labels = list(shot.actors).flatMap((actor) => [actor?.name, actor?.label, actor?.role, actor]).map((value) => text(value).toLowerCase()).filter(Boolean);
  if (labels.length) {
    const matched = list(identities).find((profile) => labels.some((label) => profile.identity_key.includes(label) || label.includes(profile.identity_key)));
    if (matched) return matched;
  }
  return list(identities)[0] || null;
}

function requestedAngle(shot = {}) {
  const source = JSON.stringify({ camera: shot.camera, opening: shot.opening_frame, frame_plan: shot.frame_plan }).toLowerCase();
  if (/left profile|left side/.test(source)) return "LEFT_PROFILE";
  if (/right profile|right side/.test(source)) return "RIGHT_PROFILE";
  if (/left three quarter|left 3\/4/.test(source)) return "LEFT_THREE_QUARTER";
  if (/right three quarter|right 3\/4/.test(source)) return "RIGHT_THREE_QUARTER";
  if (/full body|full-length|wide shot/.test(source)) return "FULL_BODY";
  return "FRONT_OR_THREE_QUARTER";
}

function orderedReferences(profile, angle) {
  if (!profile) return [];
  const preferred = list(profile.references).filter((item) => list(item.angles).includes(angle));
  const face = list(profile.references).filter((item) => list(item.angles).includes("FACE_DETAIL") || list(item.angles).includes("FRONT"));
  const body = angle === "FULL_BODY"
    ? list(profile.references).filter((item) => list(item.angles).includes("FULL_BODY") || list(item.angles).includes("PERFORMANCE_BODY"))
    : [];
  return unique([
    preferred.map((item) => item.asset_id),
    face.map((item) => item.asset_id),
    body.map((item) => item.asset_id),
    profile.reference_asset_ids,
  ]).slice(0, 8);
}

function enrichedProviderPrompt({ shot, section, profile, references, audioId, start, end, visibleSinging }) {
  const original = text(shot.generation?.provider_prompt || shot.provider_prompt);
  return [
    `SHOT PURPOSE: ${text(shot.purpose)}`,
    `VISIBLE SUBJECT: ${text(shot.subject)}`,
    `EXACT ACTION OVER TIME: ${text(shot.action)}`,
    `PERFORMANCE: ${text(shot.performance)}`,
    `OPENING FRAME: ${text(shot.frame_plan?.opening_frame || shot.opening_frame?.description || shot.opening_frame)}`,
    `TEMPORAL PROGRESSION: ${text(shot.frame_plan?.progression || shot.progression_frames?.map((frame) => frame?.description || frame).join(" | "))}`,
    `CLOSING FRAME: ${text(shot.frame_plan?.closing_frame || shot.closing_frame?.description || shot.closing_frame)}`,
    `MUSIC SECTION: ${text(section.musical_role)} from ${start.toFixed(3)}s to ${end.toFixed(3)}s; energy ${finite(section.energy_start) ?? "unknown"} to ${finite(section.energy_end) ?? "unknown"}; rhythmic density ${finite(section.rhythmic_density) ?? "unknown"}; crowd energy ${finite(section.crowd_energy) ?? "unknown"}; performance energy ${finite(section.performance_energy) ?? "unknown"}.`,
    `ENVIRONMENT: ${text(section.environment_state)}. REQUIRED CHANGE: ${text(section.environment_change)}. LIGHTING MOVEMENT: ${text(section.lighting_movement)}. CAMERA KINETIC LEVEL: ${finite(section.camera_kinetic_level) ?? "unknown"}. EDIT DENSITY: ${finite(section.edit_density) ?? "unknown"}.`,
    profile ? `IDENTITY LOCK: Preserve the exact same real person represented by identity profile ${profile.id}. Use references ${references.join(", ")} collectively for facial geometry, body proportions, hair, skin tone, age and distinguishing features. The uploaded backgrounds are excluded; create the story environment independently. Do not average the references into a new face or generic model.` : null,
    visibleSinging ? `AUDIO-CONDITIONED VOCAL PERFORMANCE: The performer visibly sings the exact source audio asset ${audioId} from ${start.toFixed(3)}s to ${end.toFixed(3)}s. Mouth, lips, jaw, breath, eyes, shoulders and body effort must follow the real phrase. Keep the mouth unobscured and camera framing suitable for verification.` : null,
    `CAMERA: ${JSON.stringify(shot.camera || {})}`,
    `LIGHTING: ${JSON.stringify(shot.lighting || {})}`,
    `PRODUCTION DESIGN: ${JSON.stringify(shot.production_design || {})}`,
    `CONTINUITY: ${JSON.stringify(shot.continuity || {})}`,
    original ? `ADDITIONAL DIRECTOR DIRECTION: ${original}` : null,
    `NEGATIVE: no identity drift, no lookalike substitution, no generic AI face, no body-type change, no ethnicity or age change, no copied reference background, no silent posing when performance is required, no random mouth movement, no repeated visual cliché, no impossible camera move, no synthetic skin, no duplicate subject, no text or watermark.`,
  ].filter(Boolean).join("\n\n");
}

const FRESH_REFERENCE_ROLES = new Set([
  "PRIMARY_SOURCE",
  "IDENTITY_REFERENCE",
  "LOCATION_REFERENCE",
  "CONTINUITY_REFERENCE",
  "PRODUCT_REFERENCE",
  "STYLE_REFERENCE",
  "BRAND_REFERENCE",
  "SUBJECT_REFERENCE",
  "AUDIO_REFERENCE",
]);

const VISUAL_REFERENCE_ROLES = new Set([
  "PRIMARY_SOURCE",
  "IDENTITY_REFERENCE",
  "LOCATION_REFERENCE",
  "CONTINUITY_REFERENCE",
  "PRODUCT_REFERENCE",
  "STYLE_REFERENCE",
  "SUBJECT_REFERENCE",
]);

function freshReferenceRows({ shot = {}, identityAssetIds = [], audioAssetId = null } = {}) {
  const byId = new Map();
  for (const reference of list(shot.reference_assets)) {
    if (!reference || typeof reference !== "object" || Array.isArray(reference)) continue;
    const id = assetId(reference);
    const role = text(reference.role).toUpperCase();
    if (!id || !FRESH_REFERENCE_ROLES.has(role)) continue;
    byId.set(id, {
      ...reference,
      asset_id: id,
      role,
      reason: text(reference.reason) || "Explicit shot reference selected by the director.",
    });
  }

  const existingPrimary = text(
    shot.primary_source_asset_id ||
    shot.generation?.primary_source_asset_id,
  );
  for (const id of unique(identityAssetIds)) {
    if (!id) continue;
    const current = byId.get(id);
    if (current?.role === "PRIMARY_SOURCE") continue;
    byId.set(id, {
      ...(current || {}),
      asset_id: id,
      role: "IDENTITY_REFERENCE",
      reason: text(current?.reason) ||
        "Identity evidence required to preserve the exact real subject across this shot.",
    });
  }
  if (audioAssetId) {
    const current = byId.get(audioAssetId);
    byId.set(audioAssetId, {
      ...(current || {}),
      asset_id: audioAssetId,
      role: "AUDIO_REFERENCE",
      reason: text(current?.reason) ||
        "Primary soundtrack timing and visible performance synchronization reference.",
    });
  }

  const rows = [...byId.values()];
  const visualRows = rows.filter((row) => VISUAL_REFERENCE_ROLES.has(row.role));
  const primaryRows = rows.filter((row) => row.role === "PRIMARY_SOURCE");
  let primaryId = existingPrimary || primaryRows[0]?.asset_id || null;

  if (!primaryId && visualRows.length) {
    const identityPrimary = unique(identityAssetIds).find((id) => byId.has(id));
    primaryId = identityPrimary || visualRows[0].asset_id;
  }
  if (primaryId && !byId.has(primaryId)) {
    throw new Error("FRESH_DIRECTION_PRIMARY_SOURCE_REFERENCE_MISSING:" + primaryId);
  }

  const normalized = rows.map((row) => ({
    ...row,
    role: row.asset_id === primaryId && VISUAL_REFERENCE_ROLES.has(row.role)
      ? "PRIMARY_SOURCE"
      : row.role === "PRIMARY_SOURCE"
        ? "CONTINUITY_REFERENCE"
        : row.role,
  }));
  const normalizedPrimary = normalized.filter((row) => row.role === "PRIMARY_SOURCE");
  if (visualRows.length && normalizedPrimary.length !== 1) {
    throw new Error("FRESH_DIRECTION_EXACT_PRIMARY_SOURCE_REQUIRED");
  }

  return {
    primary_source_asset_id: primaryId,
    reference_assets: normalized,
  };
}

function enrichPlan({ plan, synthesis, identities, audio, isMusicVideo }) {
  const sections = list(synthesis.music_world?.sections);
  const audioId = audio ? assetId(audio) : null;
  let cursor = 0;
  let humanShots = 0;
  let identityBoundShots = 0;
  let singingShots = 0;
  let lipSyncShots = 0;

  const scenes = list(plan.scenes).map((scene) => {
    const shots = list(scene.shots).map((shot) => {
      const duration = Math.max(0.001, finite(shot.duration_seconds) || 0.001);
      const start = cursor;
      const end = cursor + duration;
      cursor = end;
      const section = sectionForTime(sections, start, end);
      const hasHuman = humanShot(shot);
      const visibleSinging = isMusicVideo && singingShot(shot);
      const profile = hasHuman ? identityForShot(shot, identities) : null;
      const angle = requestedAngle(shot);
      const references = orderedReferences(profile, angle);
      if (hasHuman) humanShots += 1;
      if (profile && references.length) identityBoundShots += 1;
      if (visibleSinging) singingShots += 1;
      if (visibleSinging && audioId) lipSyncShots += 1;

      const referenceContract = freshReferenceRows({
        shot,
        identityAssetIds: references,
        audioAssetId: visibleSinging ? audioId : null,
      });

      const performanceContract = {
        ...object(shot.performance_contract),
        identity_profile_id: profile?.id || null,
        identity_reference_asset_ids: references,
        face_reference_ids: profile?.face_reference_ids || [],
        body_reference_ids: profile?.body_reference_ids || [],
        requested_face_angle: angle,
        requested_body_angle: angle,
        background_reference_policy: "EXCLUDE",
        identity_lock_required: Boolean(profile),
        identity_verification_required: Boolean(profile),
        visible_singing: visibleSinging,
        singing_visible: visibleSinging,
        mouth_visible: visibleSinging,
        lip_sync_required: visibleSinging && Boolean(audioId),
        primary_audio_asset_id: visibleSinging ? audioId : null,
        audio_start_seconds: visibleSinging ? start : null,
        audio_end_seconds: visibleSinging ? end : null,
      };

      return {
        ...shot,
        primary_source_asset_id: referenceContract.primary_source_asset_id,
        reference_asset_ids: [],
        reference_assets: referenceContract.reference_assets,
        assets: [],
        identity_requirements: profile ? {
          profile_id: profile.id,
          reference_asset_ids: references,
          face_reference_ids: profile.face_reference_ids,
          body_reference_ids: profile.body_reference_ids,
          requested_angle: angle,
          preserve_face: true,
          preserve_body_proportions: true,
          background_reference_policy: "EXCLUDE",
          verification_required: true,
        } : object(shot.identity_requirements),
        performance_contract: performanceContract,
        music_intelligence: {
          section_id: section.id || null,
          musical_role: section.musical_role || null,
          audio_start_seconds: start,
          audio_end_seconds: end,
          energy_start: section.energy_start ?? null,
          energy_end: section.energy_end ?? null,
          rhythmic_density: section.rhythmic_density ?? null,
          crowd_energy: section.crowd_energy ?? null,
          performance_energy: section.performance_energy ?? null,
          environment_state: section.environment_state || null,
          environment_change: section.environment_change || null,
          camera_kinetic_level: section.camera_kinetic_level ?? null,
          edit_density: section.edit_density ?? null,
          lighting_movement: section.lighting_movement || null,
        },
        reuse_policy: {
          ...object(shot.reuse_policy),
          mode: "NO_REUSE_UNLESS_EXPLICITLY_APPROVED",
          approved_source_asset_ids: list(shot.reuse_policy?.approved_source_asset_ids),
        },
        generation: {
          ...object(shot.generation),
          provider_prompt: enrichedProviderPrompt({
            shot,
            section,
            profile,
            references,
            audioId,
            start,
            end,
            visibleSinging,
          }),
          identity_lock: profile ? {
            required: true,
            subject: profile.identity_key,
            identity_profile_id: profile.id,
            reference_asset_node_id: references[0] || null,
            reference_asset_node_ids: references,
            verification_required: true,
            background_reference_policy: "EXCLUDE",
          } : object(shot.generation?.identity_lock),
          primary_source_asset_id: referenceContract.primary_source_asset_id,
          provider_parameters: {
            ...object(shot.generation?.provider_parameters),
            primary_source_asset_id: referenceContract.primary_source_asset_id,
            identity_profile_id: profile?.id || null,
            requested_identity_angle: angle,
          },
        },
        metadata: {
          ...object(shot.metadata),
          universal_creative_contract: "UNIVERSAL_IDENTITY_MUSIC_WORLD_V1",
          music_section_id: section.id || null,
          primary_audio_asset_id: visibleSinging ? audioId : null,
          identity_profile_id: profile?.id || null,
          identity_reference_asset_ids: references,
          background_reference_policy: "EXCLUDE",
        },
      };
    });
    const first = shots[0]?.music_intelligence || {};
    const last = shots[shots.length - 1]?.music_intelligence || first;
    return {
      ...scene,
      shots,
      music_intelligence: {
        audio_start_seconds: first.audio_start_seconds ?? null,
        audio_end_seconds: last.audio_end_seconds ?? null,
        musical_role: first.musical_role || null,
        energy_start: first.energy_start ?? null,
        energy_end: last.energy_end ?? null,
        environment_state_before: first.environment_state || null,
        environment_transformation: last.environment_change || null,
      },
      metadata: {
        ...object(scene.metadata),
        universal_creative_contract: "UNIVERSAL_IDENTITY_MUSIC_WORLD_V1",
      },
    };
  });

  if (humanShots > 0 && identityBoundShots !== humanShots) {
    throw new Error(`UNIVERSAL_IDENTITY_REFERENCES_REQUIRED:human=${humanShots};bound=${identityBoundShots}`);
  }
  if (isMusicVideo) {
    if (!audioId) throw new Error("MUSIC_VIDEO_PRIMARY_AUDIO_REQUIRED");
    if (!sections.length) throw new Error("MUSIC_VIDEO_MUSIC_WORLD_SECTIONS_REQUIRED");
    if (singingShots > 0 && lipSyncShots !== singingShots) {
      throw new Error(`MUSIC_VIDEO_LIP_SYNC_CONTRACT_REQUIRED:singing=${singingShots};lip_sync=${lipSyncShots}`);
    }
  }

  return {
    ...plan,
    scenes,
    music_world: synthesis.music_world,
    identity_profiles: identities,
    concept_candidates: synthesis.concept_candidates,
    selected_concept_id: synthesis.selected_concept_id,
    concept_selection_reason: synthesis.selection_reason,
    anti_cliche_rules: synthesis.anti_cliche_rules,
    motif_limits: synthesis.motif_limits,
    performance_policy: synthesis.performance_policy,
    production: {
      ...object(plan.production),
      reuse_assets: false,
      reuse_policy: "NO_REUSE_UNLESS_EXPLICITLY_APPROVED",
      primary_audio_asset_id: audioId,
      audio_required: true,
      source_audio_required: isMusicVideo,
      original_music_required: !isMusicVideo,
      sound_design_required: true,
      identity_verification_required:
        identities.length > 0,
      dry_run_dossier_required_before_paid_generation: true,
    },
    deliverables: list(plan.deliverables).map((deliverable) => ({
      ...deliverable,
      output_spec: {
        ...object(deliverable.output_spec),
        audio: isMusicVideo
          ? "preserve the supplied primary soundtrack exactly"
          : deliverable.output_spec?.audio ||
            "create original exact-duration instrumental music and authentic sound design during production, with no copyrighted imitation",
        audio_required: true,
        source_audio_required: isMusicVideo,
        original_music_required: !isMusicVideo,
        sound_design_required: true,
        primary_audio_asset_id:
          isMusicVideo ? audioId : null,
      },
    })),
    validation_summary: {
      human_shot_count: humanShots,
      identity_bound_shot_count: identityBoundShots,
      visible_singing_shot_count: singingShots,
      lip_sync_shot_count: lipSyncShots,
      music_section_count: sections.length,
    },
  };
}

function localNonMusicSynthesis({
  project = {},
  brief = {},
  identities = [],
} = {}) {
  return {
    contract:
      "LOCAL_NON_MUSIC_TEMPORAL_SYNTHESIS_V1",
    music_world: {
      bpm: null,
      tempo_character:
        "Original score to be designed during production",
      danceability: null,
      party_energy: null,
      groove:
        "Resolve from the approved concept and exact-duration edit",
      environmental_world: text(
        brief.creative_objective ||
        brief.business_goal ||
        project.objective,
      ),
      movement_language:
        "Resolve from visible human action and causal story progression",
      camera_energy_language:
        "Motivated by action, social energy and editorial state change",
      lighting_energy_language:
        "Motivated practical lighting with controlled progression",
      editing_energy_language:
        "Exact-duration pacing without filler or repeated scene purpose",
      sections: [],
    },
    identity_strategy: {
      profiles_used: list(identities).map(
        (profile) => profile.id,
      ),
      rules: [
        "Preserve exact verified identity",
        "Exclude uploaded backgrounds unless explicitly assigned as location evidence",
      ],
      backgrounds_are_identity_sources: false,
      multi_angle_identity_required: true,
    },
    concept_candidates: [],
    selected_concept_id: null,
    selection_reason:
      "The independent concept council is the sole concept-selection authority.",
    anti_cliche_rules: [
      "No generic montage",
      "No filler",
      "No repeated scene purpose",
      "No synthetic typography or logo inside provider pixels",
    ],
    motif_limits: [],
    performance_policy: {
      artist_or_spokesperson_present: false,
      visible_performance_required: false,
      minimum_visible_performance_ratio: 0,
      mouth_visible_when_singing: false,
      audio_conditioned_lip_sync_required: false,
    },
  };
}

export const CreativeUniversalTemporalDirectionRuntime = {
  async create(input = {}) {
    const organizationId = input.organization_id;
    const project = object(input.project);
    const brief = object(input.brief);
    const assets = list(input.assets);
    if (!organizationId) throw new Error("organization_id required");
    if (!project.id) throw new Error("creative_project_id required");

    const identities = buildIdentityProfiles(assets);
    const audio = primaryAudio(assets);
    const isMusicVideo = projectIsMusicVideo(project, brief, audio);
    const synthesis = isMusicVideo
      ? await createCreativeSynthesis({
          organization_id: organizationId,
          mission: object(input.mission),
          project,
          brief,
          assets,
          identities,
          audio,
        })
      : {
          output: localNonMusicSynthesis({
            project,
            brief,
            identities,
          }),
          result: null,
        };

    const enrichedBrief = {
      ...brief,
      metadata: {
        ...object(brief.metadata),
        universal_creative_synthesis: synthesis.output,
        universal_identity_profiles: identities,
        primary_audio_asset_id: audio ? assetId(audio) : null,
        music_video: isMusicVideo,
        director_mandate: {
          lyrics_are_one_signal_only: true,
          music_energy_environment_and_social_scale_required: true,
          generate_three_original_concepts_before_selection: true,
          uploaded_people_assets_are_identity_only_by_default: true,
          preserve_exact_face_and_body_across_new_environments: true,
          no_reuse_without_explicit_approval: true,
          zero_cost_dossier_before_paid_generation: true,
        },
      },
    };

    const temporal = await CreativeTemporalMasterPlanRuntime.create({
      ...input,
      brief: enrichedBrief,
    });
    const enrichedPlan = enrichPlan({
      plan: temporal.plan,
      synthesis: synthesis.output,
      identities,
      audio,
      isMusicVideo,
    });
    const coverage = await CreativeCinematicCoverageAuthoringRuntime.create({
      organization_id: organizationId,
      mission: object(input.mission),
      project,
      brief: enrichedBrief,
      plan: enrichedPlan,
    });
    const plan = coverage.plan;

    return {
      ...temporal,
      plan,
      cinematic_coverage: coverage.authored,
      coverage_validation: coverage.validation,
      universal_creative_synthesis: synthesis.output,
      universal_identity_profiles: identities,
      primary_audio_asset_id: audio ? assetId(audio) : null,
      music_video: isMusicVideo,
      usage: {
        ...(temporal.usage || {}),
        universal_synthesis: synthesis.result?.usage || null,
        cinematic_coverage: coverage.usage || null,
      },
      billing: {
        ...(temporal.billing || {}),
        universal_synthesis: synthesis.result?.billing || null,
        cinematic_coverage: coverage.billing || null,
      },
    };
  },
};