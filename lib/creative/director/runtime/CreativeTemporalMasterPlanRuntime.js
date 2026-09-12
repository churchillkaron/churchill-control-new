import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  CREATIVE_AGENCY_ROLES,
  creativeAgencyDecisionSchema,
  creativeAgencyRoleInstructions,
} from "@/lib/creative/director/registry/CreativeAgencyRoleRegistry";
import {
  assertCreativeMasterPlan,
  creativeTemporalSceneShotFailures,
} from "@/lib/creative/director/validation/CreativeMasterPlanValidator";
import {
  mergeCreativeRepairedPlan,
} from "@/lib/creative/director/runtime/mergeCreativeRepairedPlan";
import {
  normalizeTemporalMechanicalContract,
} from "@/lib/creative/director/runtime/CreativeTemporalMechanicalNormalizationRuntime";
import {
  unaccountedSelectedAssetIds,
} from "@/lib/creative/director/planner/creativeAssetManifestGap";
import {
  applyDerivedRoleDecisions,
} from "@/lib/creative/director/planner/creativeRoleDecisionDefaults";
import {
  availableProductionCapabilities,
  productionCapabilityPairs,
} from "@/lib/creative/director/planner/creativeProductionCapabilities";

const MAXIMUM_CONTRACT_REPAIR_ATTEMPTS = 5;
const MAXIMUM_CONSECUTIVE_NO_PROGRESS_REPAIRS = 2;

const MAXIMUM_CONTRACT_REPAIR_FAILURES_PER_PASS = 12;

function compactRepairAsset(asset = {}) {
  return {
    asset_id: text(asset.asset_id || asset.id),
    name: asset.name || asset.title || null,
    description: asset.description || asset.analysis?.description || null,
    tags: list(asset.tags || asset.analysis?.tags),
    reference_role: asset.metadata?.reference_role || asset.metadata?.research_reference_role || null,
    source_url: asset.metadata?.source_url || asset.metadata?.research_source_url || null,
  };
}

function temporalRepairTargetContext(plan = {}, failures = []) {
  const roleIds = new Set();
  const shotTargets = new Map();
  for (const failure of failures) {
    const path = text(failure?.path);
    const roleMatch = path.match(/^role_decisions\.([^.]+)/);
    if (roleMatch) roleIds.add(roleMatch[1]);
    const shotMatch = path.match(/^scenes\.(\d+)\.shots\.(\d+)/);
    if (shotMatch) {
      const sceneIndex = Number(shotMatch[1]);
      const shotIndex = Number(shotMatch[2]);
      if (!shotTargets.has(sceneIndex)) shotTargets.set(sceneIndex, new Set());
      shotTargets.get(sceneIndex).add(shotIndex);
    }
  }

  return {
    workflow_kind: plan.workflow_kind || null,
    concept: object(plan.concept),
    story: object(plan.story),
    deliverable_output_spec: object(list(plan.deliverables)[0]?.output_spec),
    failed_role_decisions: Object.fromEntries(
      [...roleIds].map((id) => [id, object(plan.role_decisions?.[id])]),
    ),
    scenes: [...shotTargets.entries()].map(([sceneIndex, shotIndexes]) => {
      const scene = list(plan.scenes)[sceneIndex] || {};
      return {
        id: scene.id || null,
        title: scene.title || null,
        objective: scene.objective || null,
        emotion: scene.emotion || null,
        duration_seconds: scene.duration_seconds ?? null,
        location: object(scene.location),
        products: list(scene.products),
        reference_asset_ids: list(scene.reference_asset_ids),
        shots: [...shotIndexes].map((shotIndex) => list(scene.shots)[shotIndex]).filter(Boolean),
      };
    }),
  };
}
const MAXIMUM_SCENE_ARCHITECTURE_ATTEMPTS = 2;
const MAXIMUM_SCENE_SHOT_ATTEMPTS = 2;
const SCENE_SHOT_CONCURRENCY = 4;

const QUALITY_NUMBER_FIELDS = Object.freeze([
  "minimum_scene_score",
  "regenerate_below_score",
]);

const QUALITY_BOOLEAN_FIELDS = Object.freeze([
  "require_brand_fit",
  "require_non_ai_feel",
  "require_identity_continuity",
  "require_product_continuity",
  "require_story_progression",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}


function firstBalancedJsonObject(sourceValue) {
  const source = String(sourceValue ?? "").trim();
  const start = source.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0 && index > start) {
      const suffix = source.slice(index + 1).trim();
      if (suffix && !/^[}\]]+$/.test(suffix)) return null;
      return source.slice(start, index + 1);
    }
    if (depth < 0) return null;
  }
  return null;
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  const source = text(value);
  if (!source) return null;

  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const balanced = firstBalancedJsonObject(source);
  if (balanced) candidates.push(balanced);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Continue with the next conservative JSON extraction.
    }
  }
  return null;
}

function normalizedOutput(result) {
  const queue = [{ value: result, depth: 0 }];
  const seen = new Set();

  while (queue.length) {
    const entry = queue.shift();
    const current = entry?.value;
    const branchDepth = Number(entry?.depth || 0);
    if (branchDepth > 12) continue;
    if (!current || (typeof current !== "object" && typeof current !== "string")) continue;
    if (typeof current === "object") {
      if (seen.has(current)) continue;
      seen.add(current);
    }

    const candidate = typeof current === "string"
      ? current
      : current.text || current.content || null;
    const parsed = candidate ? parseJson(candidate) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed.result && typeof parsed.result === "object"
        ? parsed.result
        : parsed;
    }

    if (current && typeof current === "object" && !Array.isArray(current)) {
      if (Array.isArray(current.scenes) || Array.isArray(current.shots)) return current;
      for (const key of ["output", "result", "data", "response", "raw"]) {
        const nested = current[key];
        if (nested !== undefined && nested !== null) {
          queue.push({ value: nested, depth: branchDepth + 1 });
        }
      }
    }
  }

  return null;
}


function creativeProjectPromptSnapshot(project = {}) {
  const metadata = object(project.metadata);
  return {
    id: project.id || null,
    objective: project.objective || null,
    production_type: project.production_type || null,
    target_duration: project.target_duration ?? null,
    target_channels: project.target_channels || [],
    target_languages: project.target_languages || [],
    metadata: {
      creative_request: metadata.creative_request || null,
      organization_name: metadata.organization_name || null,
      organization_industry: metadata.organization_industry || null,
      selected_asset_ids: list(metadata.selected_asset_ids),
      temporal_contract: object(metadata.temporal_contract || metadata.temporalContract),
      creative_quality_policy: object(metadata.creative_quality_policy),
      semantic_quality_policy: object(metadata.semantic_quality_policy),
      grounding_reference_authority: object(metadata.grounding_reference_authority),
      workflow_kind: metadata.workflow_kind || null,
      creative_medium: metadata.creative_medium || null,
      desired_outcome: metadata.desired_outcome || null,
      communication_goal: metadata.communication_goal || null,
      tone: metadata.tone || null,
      emotion: metadata.emotion || null,
    },
  };
}

function creativeMissionPromptSnapshot(mission = {}) {
  const metadata = object(mission.metadata);
  return {
    id: mission.id || null,
    objective: mission.objective || null,
    status: mission.status || null,
    metadata: {
      target_duration: metadata.target_duration ?? null,
      selected_asset_ids: list(metadata.selected_asset_ids),
      workflow_kind: metadata.workflow_kind || null,
      creative_medium: metadata.creative_medium || null,
      desired_outcome: metadata.desired_outcome || null,
      communication_goal: metadata.communication_goal || null,
      tone: metadata.tone || null,
      emotion: metadata.emotion || null,
    },
  };
}

function qualityPolicyFor(project = {}, brief = {}) {
  const policy = object(
    project.metadata?.creative_quality_policy ||
    brief.creative_quality_policy ||
    brief.metadata?.creative_quality_policy,
  );

  if (!Object.keys(policy).length) {
    throw new Error("CREATIVE_QUALITY_POLICY_REQUIRED");
  }
  if (!text(policy.version)) {
    throw new Error("CREATIVE_QUALITY_POLICY_VERSION_REQUIRED");
  }

  for (const field of QUALITY_NUMBER_FIELDS) {
    const value = finite(policy[field]);
    if (value === null || value < 0 || value > 100) {
      throw new Error(`CREATIVE_QUALITY_POLICY_${field.toUpperCase()}_INVALID`);
    }
  }
  if (Number(policy.regenerate_below_score) > Number(policy.minimum_scene_score)) {
    throw new Error("CREATIVE_QUALITY_POLICY_REGENERATION_THRESHOLD_INVALID");
  }

  for (const field of QUALITY_BOOLEAN_FIELDS) {
    if (typeof policy[field] !== "boolean") {
      throw new Error(`CREATIVE_QUALITY_POLICY_${field.toUpperCase()}_REQUIRED`);
    }
  }

  return {
    version: text(policy.version),
    ...Object.fromEntries(
      QUALITY_NUMBER_FIELDS.map((field) => [field, Number(policy[field])]),
    ),
    ...Object.fromEntries(
      QUALITY_BOOLEAN_FIELDS.map((field) => [field, policy[field]]),
    ),
  };
}

function assetIdentity(asset = {}) {
  const id = text(asset.id || asset.asset_id);
  if (!id) throw new Error("CREATIVE_SELECTED_ASSET_ID_REQUIRED");
  return {
    asset_id: id,
    asset_type: asset.asset_type || asset.type || null,
    name: asset.name || asset.title || asset.file_name || null,
    description: asset.description || asset.analysis?.description || null,
    analysis: asset.analysis || {},
    tags: list(asset.tags || asset.analysis?.tags),
    // No storage URL. The director never reads one -- it understands an asset through the analysis
    // field, and production resolves files by id -- but every film so far mined ids out of it. The
    // URL is a hashed storage path, so a shot ended up declaring
    // f39fc9273753c6a2101bee9f42cd3caafe4036689c50ad8daeb617c4bb6ed0bc as its PRIMARY_SOURCE on 29
    // shots of one film: a real asset, named by its filename, which is not an id and does not exist.
    // Withholding what the director cannot use is a better fix than telling it not to misread it.
    rights: asset.rights || asset.metadata?.rights || {},
    consent: asset.consent || asset.metadata?.consent || {},
    restrictions: asset.restrictions || asset.metadata?.restrictions || {},
    technical: asset.technical || {},
    metadata: asset.metadata || {},
  };
}

function temporalBaseAssetEvidence(asset = {}) {
  const analysis = object(asset.analysis);
  const analysisKeys = [
    "summary", "description", "scene_type", "visible_subjects", "activities",
    "environments", "objects", "logos", "visible_text", "recommended_uses",
    "incompatible_uses", "semantic_fitness", "technical_quality",
    "motion_characteristics", "location_anchors", "product_anchors", "evidence",
  ];
  return {
    asset_id: asset.asset_id,
    asset_type: asset.asset_type,
    name: asset.name,
    description: asset.description,
    analysis: Object.fromEntries(
      analysisKeys
        .filter((key) => analysis[key] !== undefined && analysis[key] !== null)
        .map((key) => [key, analysis[key]]),
    ),
    tags: asset.tags,
    rights: asset.rights || {},
    consent: asset.consent || {},
    restrictions: asset.restrictions || {},
  };
}

function temporalDuration(project = {}, brief = {}) {
  const metadata = object(project.metadata);
  const value = finite(
    metadata.temporal_contract?.duration_seconds ??
    metadata.temporalContract?.duration_seconds ??
    metadata.full_master_duration ??
    metadata.full_song_duration_seconds ??
    metadata.creative_direction_constraints?.full_song_duration_seconds ??
    brief.duration_seconds ??
    brief.target_duration ??
    project.target_duration,
  );
  if (!value || value <= 0) {
    throw new Error("CREATIVE_FULL_TEMPORAL_DURATION_REQUIRED");
  }
  return value;
}

function fullSourceAudioIntent(
  project = {},
  brief = {},
) {
  const projectMetadata = object(project.metadata);
  const briefMetadata = object(brief.metadata);

  const mode = text(
    projectMetadata.duration_mode ||
    projectMetadata.durationMode ||
    projectMetadata.temporal_contract?.mode ||
    projectMetadata.temporalContract?.mode ||
    briefMetadata.duration_mode ||
    briefMetadata.temporal_contract?.mode,
  ).toUpperCase();

  if ([
    "FULL_SOURCE_AUDIO",
    "FULL_SONG",
    "MATCH_SOURCE_AUDIO",
    "SOURCE_AUDIO",
  ].includes(mode)) {
    return true;
  }

  if (
    projectMetadata.full_song === true ||
    projectMetadata.fullSong === true ||
    projectMetadata.music_video === true ||
    projectMetadata.musicVideo === true ||
    briefMetadata.full_song === true ||
    briefMetadata.music_video === true
  ) {
    return true;
  }

  const corpus = [
    project.name,
    project.description,
    project.objective,
    brief.creative_objective,
    brief.business_goal,
    projectMetadata.request,
    projectMetadata.request_text,
    projectMetadata.creative_request,
    projectMetadata.production_intent,
  ]
    .map(text)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(music video|official video|full song|entire song|whole song|complete song|song-length|full-length song)\b/i
    .test(corpus);
}

function temporalAudioContract(
  project = {},
  brief = {},
) {
  const sourceAudioRequired =
    fullSourceAudioIntent(project, brief);
  const projectTemporalContract = object(project.metadata?.temporal_contract || project.metadata?.temporalContract);
  const musicAllowed = projectTemporalContract.music_allowed !== false;

  if (!sourceAudioRequired && !musicAllowed) {
    return {
      contract: "TEMPORAL_AUDIO_DIRECTION_V1",
      mode: "PHYSICAL_SOUND_DESIGN_ONLY",
      source_audio_required: false,
      music_allowed: false,
      original_music_required: false,
      timing_authority: "MASTER_DURATION",
      output_spec_audio: "create authentic exact-duration physical sound design only; music is disabled",
      architecture_rule: "Design the complete physical sound arc for the exact master duration using only source-motivated ambience, machinery, impacts, movement and silence; do not add music.",
      production_rule: "Do not generate or add music; direct only authentic physical sound, ambience, effects and intentional silence tied to visible action.",
    };
  }

  return sourceAudioRequired
    ? {
        contract: "TEMPORAL_AUDIO_DIRECTION_V1",
        mode: "FULL_SOURCE_AUDIO",
        source_audio_required: true,
        music_allowed: true,
        original_music_required: false,
        timing_authority: "SOURCE_AUDIO",
        output_spec_audio:
          "preserve the supplied primary soundtrack exactly",
        architecture_rule:
          "Cover the complete verified source soundtrack without truncation, looping or time compression.",
        production_rule:
          "Do not replace, imitate or regenerate the supplied source soundtrack.",
      }
    : {
        contract: "TEMPORAL_AUDIO_DIRECTION_V1",
        mode: "ORIGINAL_SCORE_AND_SOUND_DESIGN",
        source_audio_required: false,
        music_allowed: true,
        original_music_required: true,
        timing_authority: "MASTER_DURATION",
        output_spec_audio:
          "create original exact-duration instrumental music and authentic sound design during production, with no copyrighted imitation",
        architecture_rule:
          "Design the complete audio arc for the exact master duration; original music and authentic sound design will be produced later and must support every causal story beat.",
        production_rule:
          "Do not assume a supplied soundtrack; direct an original score, ambience and effects without copyrighted imitation.",
      };
}

function allocateDurations(items, targetSeconds, minimumSeconds = 0.5) {
  const source = list(items);
  if (!source.length) return [];

  const targetMilliseconds = Math.round(Number(targetSeconds) * 1000);
  const minimumMilliseconds = Math.round(minimumSeconds * 1000);
  if (targetMilliseconds < source.length * minimumMilliseconds) {
    throw new Error("CREATIVE_TEMPORAL_DURATION_TOO_SHORT_FOR_ITEM_COUNT");
  }

  const distributable = targetMilliseconds - source.length * minimumMilliseconds;
  const weights = source.map((item) => {
    const duration = finite(item.duration_seconds);
    return duration && duration > 0 ? duration : 1;
  });
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || source.length;
  const raw = weights.map((weight) => (distributable * weight) / totalWeight);
  const floors = raw.map((value) => Math.floor(value));
  let remainder = distributable - floors.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);

  for (let cursor = 0; remainder > 0; cursor += 1, remainder -= 1) {
    floors[order[cursor % order.length].index] += 1;
  }

  return source.map((item, index) => ({
    ...item,
    duration_seconds: (minimumMilliseconds + floors[index]) / 1000,
  }));
}

function normalizeDynamicRhythmDurations(scenes = [], minimumSeconds = 0.5) {
  let normalizedScenes = list(scenes).map((scene) => ({
    ...scene,
    shots: list(scene.shots).map((shot) => ({
      ...shot,
      generation: {
        ...object(shot.generation),
        output_spec: { ...object(shot.generation?.output_spec) },
      },
    })),
  }));
  const totalShots = normalizedScenes.reduce((sum, scene) => sum + list(scene.shots).length, 0);
  if (totalShots < 6) return normalizedScenes;

  const duration = (shot) => finite(shot?.duration_seconds);
  const flatten = () => normalizedScenes.flatMap((scene, sceneIndex) =>
    list(scene.shots).map((shot, shotIndex) => ({ sceneIndex, shotIndex, duration: duration(shot) })),
  );
  const setDuration = (sceneIndex, shotIndex, value) => {
    const shot = normalizedScenes[sceneIndex].shots[shotIndex];
    const rounded = Math.round(value * 1000) / 1000;
    normalizedScenes[sceneIndex].shots[shotIndex] = {
      ...shot,
      duration_seconds: rounded,
      generation: {
        ...object(shot.generation),
        output_spec: {
          ...object(shot.generation?.output_spec),
          duration_seconds: rounded,
        },
      },
    };
  };

  for (let pass = 0; pass < totalShots * 2; pass += 1) {
    const rows = flatten();
    let run = 1;
    let violation = null;
    for (let index = 1; index < rows.length; index += 1) {
      const left = rows[index - 1].duration;
      const right = rows[index].duration;
      run = left !== null && right !== null && Math.abs(right - left) <= 0.12 ? run + 1 : 1;
      if (run > 3) { violation = rows[index]; break; }
    }
    if (!violation) break;

    const scene = normalizedScenes[violation.sceneIndex];
    const shots = list(scene.shots);
    const current = duration(shots[violation.shotIndex]);
    if (current === null) break;
    const partnerIndex = shots.findIndex((shot, index) =>
      index !== violation.shotIndex && (duration(shot) ?? 0) > minimumSeconds + 0.125,
    );
    if (partnerIndex < 0) break;
    const partner = duration(shots[partnerIndex]);
    const delta = 0.125;
    setDuration(violation.sceneIndex, violation.shotIndex, current + delta);
    setDuration(violation.sceneIndex, partnerIndex, partner - delta);
  }

  return normalizedScenes;
}

function normalizeTemporalQualityContract(plan = {}) {
  let scenes = normalizeDynamicRhythmDurations(plan.scenes, 0.5);
  const rows = scenes.flatMap((scene, sceneIndex) => list(scene.shots).map((shot, shotIndex) => ({ sceneIndex, shotIndex, shot })));
  if (rows.length && !rows.some(({ shot }) => text(shot.tempo_role).toUpperCase() === "ACCELERATE")) {
    const candidate = rows[Math.max(0, Math.min(rows.length - 1, Math.floor(rows.length * 0.6)))];
    scenes[candidate.sceneIndex].shots[candidate.shotIndex] = { ...candidate.shot, tempo_role: "ACCELERATE" };
  }
  if (rows.length && !rows.some(({ shot }) => ["RELEASE", "SILENCE"].includes(text(shot.tempo_role).toUpperCase()))) {
    const last = rows[rows.length - 1];
    scenes[last.sceneIndex].shots[last.shotIndex] = { ...scenes[last.sceneIndex].shots[last.shotIndex], tempo_role: "RELEASE" };
  }
  return { ...plan, scenes };
}

function ensureStableIds(items, prefix) {
  const used = new Set();
  return list(items).map((item, index) => {
    let id = text(item.id, `${prefix}-${String(index + 1).padStart(2, "0")}`);
    if (used.has(id)) id = `${id}-${index + 1}`;
    used.add(id);
    return { ...item, id };
  });
}

// Structure is the story's decision, not arithmetic on the running time.
//
// This used to compute duration / 14 and force the result into a narrow band, so a 205 second film could
// only ever be 13 to 18 scenes. It could not be three long movements. It could not be one continuous
// take. It could not be forty rapid fragments. Every film of a given length came out the same shape,
// which is how a studio produces competent, forgettable work.
//
// The range now spans what the medium actually allows, from a single unbroken take to a rapid montage,
// and the derived number is offered as a reference point rather than a target. The upper bound is a cost
// bound and nothing else -- each scene is its own planning call.

const TEMPORAL_REPAIR_LIST_FIELDS = new Set([
  "negative_constraints",
  "known_failure_modes",
  "repair_instructions",
  "evidence",
  "risks",
]);

function repairFailureCount(error) {
  const failures = error?.validation?.failures;
  return Array.isArray(failures) ? failures.length : Number.POSITIVE_INFINITY;
}

function normalizeTemporalRepairNode(value, key = "", baseValue = null) {
  if (TEMPORAL_REPAIR_LIST_FIELDS.has(key) && typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      normalizeTemporalRepairNode(entry, "", Array.isArray(baseValue) ? baseValue[index] : null));
  }
  if (!value || typeof value !== "object") return value;

  if ((key === "scenes" || key === "shots") && !Array.isArray(value)) {
    const numericKeys = Object.keys(value).filter((entry) => /^\d+$/.test(entry)).sort((a, b) => Number(a) - Number(b));
    if (numericKeys.length && numericKeys.length === Object.keys(value).length) {
      return numericKeys.map((entry) => {
        const index = Number(entry);
        const baseEntry = Array.isArray(baseValue) ? baseValue[index] : null;
        const normalized = normalizeTemporalRepairNode(value[entry], "", baseEntry);
        return baseEntry?.id && normalized && typeof normalized === "object" && !Array.isArray(normalized)
          ? { ...normalized, id: baseEntry.id }
          : normalized;
      });
    }
  }

  const normalized = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    const childBase = baseValue && typeof baseValue === "object" ? baseValue[childKey] : null;
    normalized[childKey] = normalizeTemporalRepairNode(childValue, childKey, childBase);
  }
  if (!normalized.decision && typeof normalized.reason === "string" && normalized.reason.trim()) {
    normalized.decision = normalized.reason.trim();
  }
  return normalized;
}

function normalizeTemporalRepairPatch(repair = {}, plan = {}) {
  const normalized = normalizeTemporalRepairNode(repair, "", plan);
  for (const structuralKey of ["scenes"]) {
    if (!Array.isArray(normalized?.[structuralKey])) continue;
    normalized[structuralKey] = normalized[structuralKey].map((entry, index) => {
      const baseEntry = plan?.[structuralKey]?.[index];
      if (!entry || typeof entry !== "object" || Array.isArray(entry) || !baseEntry?.id) return entry;
      const knownIds = new Set((plan?.[structuralKey] || []).map((item) => item?.id).filter(Boolean));
      const canonical = knownIds.has(entry.id) ? entry.id : baseEntry.id;
      const next = { ...entry, id: canonical };
      if (Array.isArray(next.shots) && Array.isArray(baseEntry.shots)) {
        const shotIds = new Set(baseEntry.shots.map((item) => item?.id).filter(Boolean));
        next.shots = next.shots.map((shot, shotIndex) => {
          const baseShot = baseEntry.shots[shotIndex];
          if (!shot || typeof shot !== "object" || Array.isArray(shot) || !baseShot?.id) return shot;
          return { ...shot, id: shotIds.has(shot.id) ? shot.id : baseShot.id };
        });
      }
      return next;
    });
  }
  return normalized;
}

function sceneCountRange(duration) {
  const reference = Math.max(3, Math.min(20, Math.round(duration / 14)));
  return {
    // One scene is a legitimate form. A single continuous take is a deliberate, difficult choice, and a
    // floor of five forbade it on arithmetic grounds alone.
    minimum: 1,
    reference,
    // Kept for callers that still read `preferred`, but it is a reference point, not an instruction.
    preferred: reference,
    maximum: 24,
  };
}

// The shot call asked for up to eight shots against a flat 15,000 token ceiling, and the shot
// contract requires around forty fields per shot -- opening, progression and closing frames, ten
// camera fields, lighting, production design, continuity, audio, transitions, safety and repair
// lists. Eight richly written shots do not fit, and the showreel died on
// OPENAI_TEXT_RESPONSE_NOT_COMPLETE:max_output_tokens.
//
// The trap is that scene count and shot count interact: a film that comes back as fewer, longer
// scenes gets more shots per scene, so the same duration can need twice the budget depending on
// how the architecture step chose to divide it. A flat ceiling cannot be right for both.
//
// The budget now scales with the shots actually requested, with headroom for the surrounding plan
// and a ceiling to keep a runaway request bounded.
function shotCallTokenBudget(range = {}) {
  const shots = Math.max(1, Number(range.maximum) || 1);
  return Math.min(32000, 6000 + shots * 2600);
}

function shotCountRange(duration) {
  // Fewer shots, each fully directed, rather than more shots each partly specified.
  //
  // A 205 second film came back as 13 scenes and 68 shots -- roughly 3,000 required shot values against
  // a contract of about 45 per shot -- and about a third of them were absent. The result was 1,100
  // validation failures on a film whose structure was right: correct scene count, durations summing
  // exactly to the source track, story and role decisions complete. It failed on depth, not shape.
  //
  // A half-specified shot is not a shot. The missing fields are the craft itself: framing, lens intent,
  // lighting direction, continuity, opening and closing frames. Sixty-eight shots at two thirds
  // specified is weaker work than thirty fully directed, not more of it. At roughly 6.5 seconds per
  // shot a 205 second film asks for about 39 shots and 1,755 values, which sits inside what the model
  // demonstrably produces, and 6 to 8 second shots are ordinary cinematic pacing rather than slow.
  //
  // What this does NOT do is impose a pace. Shot length is the story's decision: a cut can land in one
  // second for impact and a held frame can run eight while an expression changes. allocateDurations
  // already honours that -- it treats each shot's own duration as a weight and scales the set to meet
  // the scene exactly, so a director asking for 1s, 1s and 8s gets that ratio rather than three equal
  // thirds. Narrowing the count to enforce an average would have taken that away and forbidden a
  // fast-cut passage outright.
  //
  // So the range stays wide enough for a fast sequence, and the trade is handed to the director as a
  // judgement instead: choose the number of shots this scene's story actually needs and can be directed
  // completely, because a shot without its framing, lens, lighting and continuity is not a shot.
  // The upper bound is set by what a fast cut actually needs, not by the reference pace. Roughly two
  // seconds a shot is a rapid sequence, so the ceiling follows the scene length rather than sitting a
  // couple above the average -- capping a fifteen second scene at five shots forbade the fast passage
  // this is supposed to allow.
  const reference = Math.max(2, Math.min(5, Math.round(duration / 5.5)));
  return {
    minimum: 2,
    reference,
    preferred: reference,
    maximum: Math.min(10, Math.max(6, Math.round(duration / 2))),
  };
}

async function executeReasoning({
  organization_id,
  operation,
  missionId,
  projectId,
  prompt,
  maxOutputTokens,
  serviceId = "ai.reasoning.execute",
}) {
  const result = await ServiceExecutionRuntime.execute({
    organization_id,
    service_id: serviceId,
    provider_id: null,
    category: "CREATIVE_DIRECTION",
    input: {
      prompt,
      quantity: 1,
      max_output_tokens: maxOutputTokens,
      // Every output on this path is parsed as JSON, but JSON mode was never requested
      // -- unlike the master plan runtime and the tribunal, which both request it. The
      // model was therefore free to answer in prose or fenced markdown, parseJson
      // returned null, and the call failed with
      // TEMPORAL_SCENE_SHOT_DIRECTION_V1_JSON_REQUIRED. A film was lost to an output
      // format that was never asked for.
      response_format: { type: "json_object" },
    },
    metadata: {
      module: "CREATIVE",
      operation,
      creative_mission_id: missionId || null,
      creative_project_id: projectId,
    },
  });

  const output = normalizedOutput(result);
  if (!output) throw new Error(`${operation}_JSON_REQUIRED`);
  return { output, result };
}

// The repair is told exactly which paths failed and is asked to return only what it
// changes. Everything it omits keeps its reviewed value through the merge, so it never
// has to re-emit an entire film to fix one role status -- which on a plan this size is
// the difference between a repair that fits in the token budget and one that truncates.
function temporalContractRepairPrompt({ plan, validationError, assets, attempt }) {
  const allFailures = Array.isArray(validationError?.validation?.failures)
    ? validationError.validation.failures.map((entry) => ({
        code: entry.code,
        path: entry.path,
        message: entry.message,
      }))
    : [];
  const roleFailures = allFailures.filter((entry) => /^role_decisions\./.test(text(entry.path)));
  const otherFailures = allFailures.filter((entry) => !/^role_decisions\./.test(text(entry.path)));
  const remainingSlots = Math.max(0, MAXIMUM_CONTRACT_REPAIR_FAILURES_PER_PASS - roleFailures.length);
  const failures = [...roleFailures, ...otherFailures.slice(0, remainingSlots)];
  const repairContext = temporalRepairTargetContext(plan, failures);
  const repairAssets = assets.map(compactRepairAsset);

  const unaccounted = unaccountedSelectedAssetIds(plan, assets);
  const structure = list(plan.scenes).map((scene) => ({
    scene_id: text(scene?.id),
    shot_ids: list(scene?.shots).map((shot) => text(shot?.id)).filter(Boolean),
  }));
  const applicableRoles = CREATIVE_AGENCY_ROLES
    .filter((role) => role.applies_to.includes("ALL") || role.applies_to.includes("TEMPORAL"))
    .map((role) => ({ id: role.id, mandate: role.mandate }));
  const inapplicableRoles = CREATIVE_AGENCY_ROLES
    .filter((role) => !role.applies_to.includes("ALL") && !role.applies_to.includes("TEMPORAL"))
    .map((role) => role.id);

  return `
Repair this temporal Creative Master Plan so it satisfies the canonical contract. Do not
change the creative mission, invent evidence, lower quality thresholds, alter approved
rights, or reference services and capabilities that are not already in the plan.

This is repair attempt ${attempt} of at most ${MAXIMUM_CONTRACT_REPAIR_ATTEMPTS}. Resolve
every listed failure now rather than deferring any of them.

Return one JSON object containing only the keys you change. Keys you omit keep their
current values, so do not re-emit sections you are not repairing.

PATCH SHAPE IS STRICT
Return repairs only in this canonical JSON shape:
{
  "role_decisions": {
    "role_id": {
      "status": "ACTIVE|NOT_REQUIRED",
      "decision": "mission-specific decision",
      "evidence": ["exact supplied evidence"],
      "confidence": 0,
      "risks": ["specific risk"],
      "repair_instructions": ["bounded repair"]
    }
  },
  "scenes": [{
    "id": "EXACT_EXISTING_SCENE_ID",
    "shots": [{
      "id": "EXACT_EXISTING_SHOT_ID",
      "camera": {},
      "continuity": {},
      "audio": {},
      "energy_level": 0,
      "tempo_role": "HOLD|BUILD|ACCELERATE|PEAK|RELEASE|SILENCE",
      "transition_in": "specific transition",
      "transition_out": "specific transition",
      "negative_constraints": ["specific constraint"],
      "known_failure_modes": ["specific failure"],
      "repair_instructions": ["specific repair"],
      "generation": {
        "required": true,
        "service": "existing verified service from current plan",
        "capability": "existing verified capability from current plan",
        "output_spec": {}
      }
    }]
  }]
}
- scenes MUST be a JSON array, never an object keyed by numeric indexes.
- shots MUST be a JSON array, never an object keyed by numeric indexes.
- Use the literal key "id" for scene and shot identity. Do NOT use scene_id, shot_id, numeric map keys or positional aliases.
- Every scene patch MUST copy an exact scene id from STABLE STRUCTURE IDS below.
- Every shot patch MUST copy an exact shot id from that scene below. NEVER invent scene-0, shot-0 or substitute positional ids.
- role_decisions values MUST be full objects in the schema above. Never return a scalar string such as "ACTIVE".
- Use the canonical property name "decision". Do NOT rename it to concrete_mission_specific_decision or any synonym.
- negative_constraints, known_failure_modes and repair_instructions MUST be JSON arrays of specific strings, never scalar strings.
- generation.required must be boolean true for generated-video shots. generation.service and generation.capability must reuse verified values already present in the plan/capability set.
- generation.output_spec MUST preserve the MASTER OUTPUT SPEC below. A source/reference image's dimensions are never the film output specification.
- energy_level must be numeric 0-100 and tempo_role must be one of HOLD, BUILD, ACCELERATE, PEAK, RELEASE, SILENCE.
- Required text fields may not be blank, 'none', 'N/A' or 'not applicable'. If something is deliberately absent, describe the absence and its story/craft reason in real words.
- Do not weaken researched subject/location grounding into generic geography, generic machinery, generic products or category placeholders. Preserve the exact named researched subject, location, machine/product identity and reference authority already present in this plan.
- Do not invent procedures, operational documents, measurements or KPIs, recordings, certifications, source claims or other facts that are not present in supplied evidence.

AGENCY ROLE CONTRACT
- Every role must return an accountable decision record. Quality, rights/safety and release governance MUST be ACTIVE and can never be waived. Return status, a concrete mission-specific decision, evidence as a JSON array, confidence 0-100, risks as a JSON array, and repair_instructions as a JSON array.
- Any other applicable discipline may be NOT_REQUIRED only when the selected direction genuinely gives it no material job, with a concrete mission-specific reason.
- Never mark a discipline NOT_REQUIRED merely to satisfy validation or reduce work.
- A role decision must be mission-specific and may not copy or lightly paraphrase the registry mandate.
- Evidence must cite concrete supplied material such as an exact asset_id, scene/shot id, research fact, brief fact or mission requirement. Generic evidence such as "the role is required by the contract/project" is invalid.

MASTER OUTPUT SPEC
${JSON.stringify(object(list(plan.deliverables)[0]?.output_spec), null, 2)}

STABLE STRUCTURE IDS
${JSON.stringify(structure, null, 2)}

APPLICABLE TEMPORAL ROLES
${JSON.stringify(applicableRoles, null, 2)}

INAPPLICABLE ROLES
${JSON.stringify(inapplicableRoles, null, 2)}


Do not emit prompts, provider prompts, negative prompts or provider parameters.

FAILURES TO RESOLVE
${JSON.stringify(failures, null, 2)}

SELECTED ASSETS
${JSON.stringify(repairAssets, null, 2)}
${unaccounted.length ? `
ASSET IDS MISSING FROM asset_manifest
These exact ids have no manifest entry. Add one for each with an evidence-backed disposition:
${JSON.stringify(unaccounted, null, 2)}
` : ""}

TARGETED CURRENT PLAN CONTEXT
${JSON.stringify(repairContext, null, 2)}
`;
}

function basePlanPrompt(input) {
  return `
You are Avantiqo's accountable Executive Creative Director. Create the governing plan for
an original, world-class, full-length temporal production. This pass defines the concept,
story, deliverable, asset decisions and agency decisions only. Detailed scenes and shots
will be designed in controlled later passes so the full production is never truncated.

Return strict JSON only, with this exact top-level structure:
{
  "workflow_kind": "TEMPORAL",
  "concept": {
    "title": "specific original title",
    "creative_thesis": "single governing creative idea",
    "hook": "specific audience-facing idea",
    "message": "what the audience should understand or feel",
    "narrative": "complete causal narrative across the full duration",
    "creative_system": "specific art direction and composition system",
    "emotional_promise": "specific emotional outcome",
    "signature_device": "the one device this work is built on, and where it does not appear",
    "refused_devices": "the reflex devices for this brief, named and rejected with reasons",
    "call_to_action": "earned action, including the form it takes",
    "target_audience": {}
  },
  "story": {
    "hook": "first visible or audible beat",
    "audience_tension": "desire, contradiction or obstacle",
    "escalation": "how stakes increase",
    "observable_proof": "what visibly proves the message",
    "turn": "surprise, revelation or consequence",
    "resolution": "earned resolution",
    "call_to_action": "action integrated into resolution, and the form it takes",
    "emotional_arc": "precise emotional progression",
    "anti_cliche_strategy": "how montage, filler and category clichés are avoided"
  },
  "creative_review": {
    "passed": true,
    "overall_score": 0,
    "dimensions": {},
    "selected_direction_reason": "why this direction wins for this organization, mission and evidence",
    "rejected_patterns": ["four or more specific approaches rejected before selection, each with its failure mode"],
    "weakest_link": "the single weakest remaining aspect, stated precisely rather than defended",
    "craft_risks": ["four or more concrete medium-specific craft failures that could make this look generic or synthetic"],
    "finishing_requirements": ["four or more concrete finishing requirements needed to make this release-grade"],
    "repair_before_production": []
  },
  "deliverables": [{
    "id": "stable deliverable id",
    "type": "FILM|VIDEO",
    "purpose": "role of the master production",
    "channels": [],
    "languages": [],
    "output_spec": {
      "duration_seconds": ${input.duration},
      "aspect_ratio": "resolve from the brief and intended channel",
      "resolution": "resolve from the brief and release requirements",
      "frame_rate": "resolve from the creative and technical intent",
      "audio": ${JSON.stringify(input.audio_contract.output_spec_audio)}
    }
  }],
  "asset_manifest": [{
    "asset_id": "exact supplied asset id",
    "disposition": "ASSIGNED|REFERENCE|REGENERATE|EXCLUDE",
    "reason": "evidence-based production decision",
    "confidence": 0,
    "assignments": ["deliverable id"],
    "restrictions": {},
    "continuity_anchors": {},
    "repair_requirements": []
  }],
  "role_decisions": {},
  "scenes": [],
  "quality": ${JSON.stringify(input.quality_policy)}
}

AGENCY ROLE DECISION TIMING
- Do not author role_decisions in this base-plan pass. Return role_decisions as {}.
- Applicable agency disciplines are adjudicated after scene and shot direction exists, through the governed contract-repair pass, so cinematography, edit, sound, VFX, performance and quality decisions can cite the actual directed work rather than speculate before it exists.
- Registry-inapplicable roles are derived deterministically before final validation.

SUPPLIED ASSET IDS (${input.assets.length} assets, use exactly these):
${input.assets.map((asset) => asset.asset_id).join("\n")}

MANDATORY RULES
- Copy the supplied quality policy exactly.
- creative_review is your own accountable judgement of this direction and is required. dimensions must score every listed review dimension from 0 to 100. rejected_patterns, craft_risks and finishing_requirements each need four or more entries substantial enough to stand alone -- three is the floor below which the plan is invalid, not the standard. weakest_link names the weakest remaining aspect precisely instead of defending it.
- asset_manifest must contain exactly one entry for each id in SUPPLIED ASSET IDS, and no other entries. Copy those ids character for character.
- Every manifest entry except EXCLUDE must list in assignments the id of each deliverable it serves. A REFERENCE asset names the deliverable it informs, not nothing -- an empty assignments array is only valid for EXCLUDE.
- Never invent, guess, reformat or substitute an asset id. An id that is not in SUPPLIED ASSET IDS does not exist.
- Use evidence from asset analysis, rights, consent and restrictions.
- If BRIEF AND RESEARCH contains metadata.grounding_reference_authority with subject_claim_authority true, only ids listed there may serve as SUBJECT_REFERENCE, LOCATION_REFERENCE or other real-world subject/geography evidence for that grounded mission. Other project assets are not subject authority merely because they belong to the organization; EXCLUDE them from the grounded subject when irrelevant, or use them only for an independently evidenced role such as BRAND_REFERENCE or AUDIO_REFERENCE.
- Keep role_decisions empty in this base pass; final governed repair owns evidence-backed applicable role decisions after the directed work exists.
- Build a causal story with a beginning, escalation, turn and earned resolution.
- Do not create scenes in this pass; return scenes as an empty array.
- Do not copy protected campaigns, characters or a living artist's identity or style.
- The work must feel directed by an elite human agency, not assembled by an AI template.

INPUT
${JSON.stringify(input)}
`;
}

function sceneArchitecturePrompt({ basePlan, duration, range, assets, project, brief, audioContract, retryReason = "" }) {
  return `
You are Avantiqo's film director and narrative editor. Design the complete scene architecture
for the full temporal master. Return strict JSON only as {"scenes": [...]}.

${retryReason ? `YOUR PREVIOUS ARCHITECTURE RESPONSE WAS REJECTED: ${retryReason}. Return the complete required {"scenes": [...]} object now.\n\n` : ""}MASTER DURATION: ${duration} seconds
SCENE COUNT: choose it from the story. Permitted ${range.minimum} to ${range.maximum}. For reference, an evenly cut film of this length would sit near ${range.reference} scenes -- that is a reference point, not a target, and matching it earns nothing.

STRUCTURE IS YOURS TO INVENT
- Decide the shape this specific story needs. One continuous unbroken take, three long movements, a rapid montage of fragments, a non-linear order, a repeating motif that returns changed, a single location that transforms, parallel threads that collide -- all of these are available and none is more correct than another.
- Do not produce the average film of this length. If the structure you return is the one anybody would default to for this duration, reject it and find the one this story actually needs.
- Justify the shape in each scene's objective and state change: the count you choose must be the consequence of the story, not of the running time.

THE DEVICE IS YOURS TO INVENT
- Shape alone is not imagination. Inside the shape, this work runs on a device: a mechanism it repeats or breaks that does something coverage cannot.
- Camera movement is not a device. A push-in, a pan, a track and an orbit are how a camera behaves, and describing one precisely is craft. A device is a rule the work obeys: a frame that refuses the subject until it is earned, a cut that lands on sound rather than picture, type that contradicts the image, an object that survives every cut, a colour that appears only when someone lies, a scale that is wrong on purpose, one unbroken sound holding unrelated pictures together, a transformation that cannot happen in life.
- Typography, effects and sound are instruments, not a finishing layer. If this work uses text, decide what the text does beyond naming things. If it uses none, decide that too. An effect may be invisible repair or may be the whole idea -- say which.
- The call to action is part of the work and has a form: performed on screen, spoken, typographic, an object, a sound, a held silence, something the audience does, or withheld. A card at the end is one option among many and never the default.
- Name what this brief would reach for by reflex, reject it, then apply the device only where it earns its place. A device on every shot is decoration and reads as noise -- plain shots are how the device stays legible.

Each scene must contain:
{
  "id": "stable unique scene id",
  "title": "specific title",
  "objective": "unique causal story purpose",
  "emotion": "specific audience emotion",
  "story_state_before": "what is true before this scene",
  "state_change": "new action, information or emotional change",
  "story_state_after": "what is now true",
  "transition_logic": "why the next scene follows",
  "tension": {
    "pressure_before": 0,
    "pressure_after": 0,
    "audience_question": "what the viewer is waiting to discover or resolve",
    "withheld_information": "what is deliberately not shown yet and why",
    "reveal_state": "WITHHELD|FRAGMENT|ESCALATING|REVEALED|PAYOFF|RELEASE",
    "visual_density": 0,
    "sonic_pressure": 0,
    "release_reason": "why any pressure drop increases later impact, or NOT_A_RELEASE",
    "payoff": "what earned reveal or consequence lands here, or NOT_YET"
  },
  "duration_seconds": 12,
  "location": {},
  "actors": [],
  "products": [],
  "brand_rules": [],
  "visual_style": {},
  "camera_style": {},
  "audio_style": {},
  "reference_asset_ids": []
}

MANDATORY RULES
- The complete scene duration sum must equal exactly ${duration} seconds.
- ${audioContract.architecture_rule}
- Every scene must change the story state and have a distinct objective.
- Every scene must author a tension object. pressure_before and pressure_after are 0-100 and describe audience pressure, not visual brightness or loudness. Do not make the curve monotonic: use earned rises, holds, interruptions and releases. A release must buy later impact.
- audience_question and withheld_information must identify what keeps the viewer leaning forward. reveal_state must progress deliberately; do not spend the hero/environment/process reveal before pressure earns it.
- visual_density and sonic_pressure are separate 0-100 controls. High tension may use sparse picture or near-silence; constant density is forbidden.
- No generic montage, filler, repeated beauty shots or disconnected performance coverage.
- Use supplied assets deliberately as direct material, references, continuity anchors or exclusions.
- Preserve identity, product, wardrobe, location and screen-direction continuity.
- Make transitions motivated by action, sound, emotion or visual causality.
- Do not include shots in this response.

GOVERNING PLAN
${JSON.stringify({ concept: basePlan.concept, story: basePlan.story, deliverables: basePlan.deliverables })}

PROJECT
${JSON.stringify(project)}

BRIEF AND RESEARCH
${JSON.stringify(brief)}

ASSETS
${JSON.stringify(assets)}
`;
}

function shotPlanPrompt({
  basePlan,
  scene,
  sceneIndex,
  range,
  assets,
  outputSpec,
  capabilityPairs,
  outstandingFailures = [],
}) {
  return `
You are Avantiqo's director, cinematographer, production designer, editor and sound director.
Create executable shot direction for one scene of a world-class temporal production.
Return strict JSON only as {"shots": [...]}.

${outstandingFailures.length ? `YOUR PREVIOUS ATTEMPT AT THIS SCENE WAS REJECTED. Fix every one of these and return the complete scene again:
${outstandingFailures.map((failure) => `- ${failure.path}: ${failure.message}`).join("\n")}

` : ""}SCENE INDEX: ${sceneIndex + 1}
SCENE: ${JSON.stringify(scene)}
SHOT COUNT: choose it from this scene's action. Permitted ${range.minimum} to ${range.maximum}, reference ${range.preferred}.
EXACT SHOT DURATION SUM: ${scene.duration_seconds} seconds
MASTER CONCEPT AND STORY: ${JSON.stringify({ concept: basePlan.concept, story: basePlan.story })}
MASTER OUTPUT SPEC: ${JSON.stringify(outputSpec)}
PRODUCTION CAPABILITIES YOU MAY PLAN AGAINST: ${JSON.stringify(capabilityPairs)}
AVAILABLE ASSETS: ${JSON.stringify(assets)}
SUPPLIED ASSET IDS (the only ids that exist -- ${assets.length} assets):
${assets.map((asset) => asset.asset_id).join("\n")}

Every shot must contain:
{
  "id": "stable unique shot id",
  "title": "specific shot title",
  "purpose": "new story information delivered by this shot",
  "device": "how this shot carries the signature device, or why it is deliberately plain",
  "subject": "exact visible subject",
  "action": "exact visible action over time",
  "performance": "micro-behaviour, timing and emotional behaviour",
  "performance_direction": {},
  "energy_level": 0,
  "tempo_role": "HOLD|BUILD|ACCELERATE|PEAK|RELEASE|SILENCE",
  "tension": {
    "pressure_before": 0,
    "pressure_after": 0,
    "audience_question": "what remains unresolved during this exact shot",
    "withheld_information": "what remains outside frame, obscured, unheard or delayed",
    "reveal_state": "WITHHELD|FRAGMENT|ESCALATING|REVEALED|PAYOFF|RELEASE",
    "visual_density": 0,
    "sonic_pressure": 0,
    "micro_payoff": "what changes by the end of this shot",
    "next_pressure_hook": "what pulls attention into the next shot"
  },
  "duration_seconds": 4,
  "medium": "generated-video|asset-led-motion|live-asset|animation|other",
  "frame_plan": {
    "opening_frame": "complete opening composition and state",
    "progression": "beat-by-beat visible progression",
    "closing_frame": "complete closing composition and state"
  },
  "opening_frame": {},
  "progression_frames": [],
  "closing_frame": {},
  "camera": {
    "platform": "specific physical camera platform/operator mode such as tripod, handheld, shoulder, dolly, slider, Steadicam, gimbal, crane/jib, vehicle mount, macro rig, drone/FPV or helicopter/chase platform",
    "platform_motivation": "why this platform is the strongest physical viewpoint for this exact story beat",
    "framing": "specific framing",
    "angle": "specific angle",
    "camera_distance": "distance and spatial relationship",
    "lens_intent": "optical intent",
    "movement_path": "physical camera path",
    "movement_speed": "speed and acceleration",
    "stabilization": "designed stabilization",
    "movement_motivation": "why the camera moves",
    "focus_target": "precise focus subject",
    "focus_transition": "focus behaviour through time"
  },
  "aerial_cinematography": {
    "mode": "STABILIZED_AERIAL|FPV when and only when this shot is aerial",
    "flight_path": "evidence-consistent physical flight path",
    "start_position": "opening spatial position",
    "end_position": "closing spatial position",
    "altitude_profile": "altitude evolution through the shot",
    "speed_profile": "speed and easing through the shot",
    "yaw_behavior": "heading/yaw behaviour",
    "gimbal_behavior": "gimbal/look behaviour",
    "horizon_behavior": "horizon/roll behaviour",
    "subject_tracking": "subject or destination relationship",
    "point_of_interest": "anchor for orbit/arc/circle when applicable",
    "terrain_relationship": "relationship to terrain/buildings/route",
    "clearance_strategy": "believable obstacle clearance",
    "movement_motivation": "why this flight exists in the story"
  },
  "lighting": {
    "source": "motivated source",
    "direction": "direction and falloff",
    "contrast": "contrast intent",
    "colour": "colour-temperature and palette intent",
    "exposure_intent": "highlight, skin, product and shadow treatment"
  },
  "production_design": {
    "environment": "complete environment",
    "wardrobe": "wardrobe and grooming",
    "props": "required props",
    "materials": "surface and material behaviour",
    "texture_detail": "micro-detail preventing synthetic appearance"
  },
  "subject_truth": {
    "required": false,
    "exact_subject": "exact researched real-world subject name when fidelity matters",
    "variant": "exact researched variant/model/version",
    "defining_visual_features": ["minimum three evidence-backed visible features"],
    "source_ids": ["research source ids proving the subject truth"],
    "continuity_constraints": ["identity features that may not drift across shots"]
  },
  "reference_evidence": [{
    "source_id": "research source id",
    "subject": "what this evidence visibly proves",
    "role": "SUBJECT_TRUTH|GEOGRAPHY|CONTINUITY|BEAUTY_REFERENCE",
    "source_url": "exact evidence URL from RESEARCH",
    "media_url": "exact media URL from RESEARCH when present"
  }],
  "cinematic_beauty_intent": {
    "required": true,
    "composition": "specific authored frame geometry and negative-space intent",
    "lighting": "motivated light and contrast that makes this shot beautiful",
    "atmosphere": "air, weather, haze, particles or environmental depth",
    "camera_placement": "why this exact physical camera position creates scale or intimacy",
    "emotional_charge": "what the beauty makes the audience feel beyond legibility"
  },
  "continuity": {
    "identity": "identity anchors",
    "product": "product anchors",
    "location": "location anchors",
    "wardrobe": "wardrobe anchors",
    "screen_direction": "movement and eyeline direction",
    "spatial_geography": "where subjects are in the space"
  },
  "dialogue": [],
  "narration": {},
  "audio": {
    "source_sound": "diegetic source sound",
    "sound_effects": [],
    "music": {},
    "silence": "intentional silence",
    "mix_intent": "voice, music, effects and ambience hierarchy",
    "sync_events": [{"at_seconds": 0.0, "event": "exact audible event tied to picture", "priority": "FOREGROUND|SUPPORT|TRANSITION"}],
    "spatial_field": "foreground position, environment width/depth, motivated motion and reverb space"
  },
  "music": {},
  "sound_effects": [],
  "sound_design": {},
  "graphics": {
    "titles": [],
    "subtitles": [],
    "logo": {},
    "overlays": [],
    "type_behaviour": "what the type does beyond naming things, or why this shot carries none",
    "render_text_outside_generated_pixels": true
  },
  "vfx": {
    "effects": [],
    "cleanup": [],
    "compositing": [],
    "intent": "INVISIBLE_CREDIBILITY or THE_IDEA_ITSELF, and what the effect is for"
  },
  "transition_in": "specific editorial transition into the shot",
  "transition_out": "specific editorial transition out of the shot",
  "primary_source_asset_id": "exact asset id or null for a fully synthetic source-free shot",
  "reference_assets": [{
    "asset_id": "exact supplied asset id",
    "role": "PRIMARY_SOURCE|IDENTITY_REFERENCE|LOCATION_REFERENCE|CONTINUITY_REFERENCE|PRODUCT_REFERENCE|STYLE_REFERENCE|BRAND_REFERENCE|SUBJECT_REFERENCE|AUDIO_REFERENCE",
    "reason": "specific evidence-based reason this asset is required for this shot",
    "semantic_claim": {"kind":"LOCATION|PROFESSION|SUBJECT|STYLE|IDENTITY|PRODUCT|BRAND|AUDIO|CONTINUITY","value":"exact audience-facing claim this asset supports","audience_must_recognize":true}
  }],
  "reference_asset_ids": [],
  "negative_constraints": ["what must not appear or happen in this shot, one entry per risk"],
  "known_failure_modes": ["how this specific shot is most likely to come out wrong"],
  "repair_instructions": ["what to change if this shot comes back wrong, one entry per failure mode"],
  "generation": {
    "required": true,
    "service": "one service id from PRODUCTION CAPABILITIES YOU MAY PLAN AGAINST",
    "capability": "a capability id offered by that same service",
    "output_spec": {
      "duration_seconds": "this shot's duration_seconds, the same number",
      "aspect_ratio": "inherit from MASTER OUTPUT SPEC",
      "resolution": "inherit from MASTER OUTPUT SPEC",
      "frame_rate": "inherit from MASTER OUTPUT SPEC"
    }
  }
}

MANDATORY RULES
- Shot duration sum must equal exactly ${scene.duration_seconds} seconds.
- Shot length is a story decision, not an average. Give each shot the time its action actually needs: a cut can land in one second for impact, and a held frame can run eight while a performance or expression changes. Do not divide the scene into equal parts.
- energy_level is mandatory from 0 to 100 and must describe the felt intensity of this exact shot. The sequence must have meaningful rises, drops and contrast, not a flat numerical pattern.
- tension is mandatory for every shot. pressure_before/after, visual_density and sonic_pressure are 0-100. They are independent: a nearly silent, sparse frame can carry extreme pressure.
- Every shot must either deepen the audience question, withhold something meaningful, reveal a fragment, land a micro-payoff, or deliberately release pressure to amplify the next beat. Decorative beauty with no tension function is invalid.
- Do not reveal full subjects/environments by reflex. Use partial geometry, occlusion, reflections, silhouettes, off-screen sound, consequences, scale clues and delayed orientation only when they preserve legibility and strengthen anticipation.
- tempo_role is mandatory. Use HOLD, BUILD, ACCELERATE, PEAK, RELEASE or SILENCE according to what the audience should feel here. Across a film longer than 20 seconds, create at least one real acceleration and one release or silence state.
- Do not create a metronomic chain of equal-duration shots. Use at least three materially different pacing bands across premium temporal work, including short punctuation cuts and longer emotional holds when the story earns them.
- Premium trailer grammar is built on contrast, not constant speed. Plan explicit alternation between restraint, acceleration, interruption, silence and payoff. A film that is equally intense from beginning to end has no tension.
- Withhold the hero reveal until the preceding visual and sonic pressure has earned it. Fragments, consequences and environment may foreshadow the hero, but do not spend the payoff early.
- Audio must be directed to picture. Put physically motivated, exact-time events in audio.sync_events: alarms, footsteps, doors, train movement, impacts, device sounds, breaths, room changes. Never write generic filler whooshes.
- Design audio lead-ins and J-cuts when a sound can pull the audience into the next image before the cut. Foreground physical sounds must be allowed to dominate over score when they carry story.
- Every premium temporal master longer than 20 seconds requires at least one designed near-silence or major density drop before a meaningful payoff, unless the story explicitly requires continuous sound pressure and states why.
- Original score must change density, register, pulse or harmonic pressure with the energy curve; it may not behave as one constant background bed under unrelated images.
- audio.spatial_field must describe the cinematic field: what is center-locked, what carries stereo width/depth, what movement is picture-motivated, and how the acoustic space changes.
- Music intensity and SFX density must respond to energy_level and tempo_role. Silence is an active editorial state, not missing audio.
- Face close-ups are not filler. If a face is held close, the performance must visibly change story state; otherwise use the human through action, hands, movement, objects, geography or interaction.
- Choose how many shots this scene's story needs within the permitted range, and choose a number you can direct completely. Every shot requires its framing, lens intent, movement, lighting, production design, continuity, opening and closing frames and sound. A shot missing those is not a shot, and more half-specified shots are weaker work than fewer fully directed ones.
- Every shot must add new information and visibly advance this scene's state change.
- Describe opening frame, temporal progression and closing frame precisely.
- Specify camera, lighting, design, performance, continuity, sound, graphics, VFX and transitions.
- Every physical shot must choose an explicit camera.platform and platform_motivation. Use the full professional camera language when story and geography earn it: locked tripod/head, shoulder, handheld, dolly, slider, Steadicam, gimbal, crane/jib, vehicle mount, macro/inspection rig, cable/suspended system, drone, FPV, helicopter/chase platform or another physically plausible platform. Never default a sequence to one camera platform.
- Camera variety is not random spectacle. Change platform, height, distance, optics or movement when the story state, scale, physical action, reveal or emotional proximity changes. Deliberate stillness may be the strongest contrast after kinetic movement.
- Aerial is not synonymous with drone. Choose stabilized aerial, FPV, helicopter/chase or grounded crane/telephoto according to the physical geography and shot purpose.
- Avoid repeated slow push-ins, repeated digital zoom language, repeated eye-level gimbal tracking and repeated orbit moves. If two adjacent shots use similar camera grammar, the second must state why continuity is stronger than contrast.
- If RESEARCH creative_grounding.spatial_path.required is true, preserve its ordered_nodes and directed_edges in the physical camera geography. Aerial/drone shots must populate aerial_cinematography using the existing Studio aerial contract and must move consistently toward the evidence-backed next node/destination; a beautiful view that travels against the grounded route is invalid. Do not create aerial_cinematography for non-aerial shots.
- If a shot makes an audience-facing claim about a named real-world machine, vehicle, product, place, building or other fidelity-sensitive subject, subject_truth.required must be true. Populate exact_subject, exact variant/model/version, at least three defining_visual_features, research source_ids, continuity_constraints and reference_evidence from RESEARCH creative_grounding/reference_candidates. If research does not support those fields, block the shot rather than inventing a generic category lookalike.
- cinematic_beauty_intent.required is true for every physical premium film shot. Composition, lighting, atmosphere, camera placement and emotional charge must be specific to the shot. Beauty is not decoration: it must amplify scale, tension, intimacy, awe or reveal while preserving semantic truth. Flat, merely legible or generic AI coverage is invalid.
- The concept declares a signature device. Decide each shot's part in it. "device" states what this shot does that coverage could not, or states that it is deliberately plain and what the plainness sets up. Do not restate the camera movement in "device" -- a push-in is camera behaviour, not a device. Most shots in a good film are plain; the device has to stay legible.
- Graphics and VFX are creative instruments here, not a caption layer and a cleanup pass. If type appears, decide what it does beyond naming things. If an effect appears, say whether it is invisible repair or the idea itself. Both may be empty for a shot that needs neither.
- Do not use the devices the concept lists as refused.
- Use only the ids in SUPPLIED ASSET IDS, copied character for character. An asset's payload also carries hashes, file names and technical values; none of those is its id, and a 64-character hash is never an asset id.
- generation.service and generation.capability must be one pair from PRODUCTION CAPABILITIES YOU MAY PLAN AGAINST. Never name a service or capability that is not listed there.
- generation.output_spec must be a populated object, never empty.
- generation.output_spec duration_seconds must equal this shot's duration_seconds exactly, and the remaining fields inherit from MASTER OUTPUT SPEC.
- negative_constraints, known_failure_modes and repair_instructions must each hold at least one real entry, specific to this shot. Never return them empty.
- State absence as a decision, never as a blank. "none", "N/A" and an empty string are rejected. A locked-off frame has no movement path, and the way to say so is to say it: "locked off on sticks, the frame does not move for the whole shot". A shot with no props says "no props, the bare room is the point". Absence is often the strongest choice available and this is how you make it, but it has to read as a choice rather than a gap.
- A shot that works through graphics or type rather than a camera -- a card, a title, an end frame -- does not need camera, lighting, production design or continuity, and must carry real graphics direction instead: what the type says, how it behaves, what it does. It still needs its sound and its opening and closing frames, because the track keeps playing across a card.
- reference_assets is the only authoritative shot-reference field and every entry must be a typed object.
- When BRIEF AND RESEARCH supplies grounding_reference_authority.asset_ids, every SUBJECT_REFERENCE or LOCATION_REFERENCE supporting the mission's researched external subject must use one of those ids. Never use an unrelated organization asset as visual evidence for that subject or place.
- reference_asset_ids must always be an empty array in fresh direction output; it is legacy context only.
- Every shot using any uploaded source or reference must declare exactly one PRIMARY_SOURCE entry.
- primary_source_asset_id must exactly match that one PRIMARY_SOURCE entry.
- Fully synthetic source-free shots must use primary_source_asset_id null and reference_assets [].
- Never use PRIMARY_SOURCE for audio; soundtrack and audio evidence use AUDIO_REFERENCE.
- Use IDENTITY_REFERENCE only when the asset evidence contains a person or identity.
- Use LOCATION_REFERENCE only when the asset analysis proves a visually identifiable location, not merely a generic environment or metadata provenance.
- Every reference used to make an audience-facing location or profession claim must include semantic_claim with the exact claim. A source tagged Phuket cannot claim Phuket unless the asset analysis says Phuket is visually identifiable; a source from an accounting website cannot claim accounting unless the profession is visibly supported.
- Use PRODUCT_REFERENCE only when the asset evidence contains a product or physical item.
- Use BRAND_REFERENCE only when the asset evidence contains a logo, wordmark, signage or brand mark.
- CONTINUITY_REFERENCE, STYLE_REFERENCE and SUBJECT_REFERENCE are contextual references and never replace PRIMARY_SOURCE.
- Do not emit repair_version, legacy_repair_version or any metadata copied from an earlier plan.
- Do not populate provider source arrays such as source_asset_ids, image_urls, reference_images or asset_ids.
- Generated pixels must not be trusted for final logos, typography, subtitles or legal text.
- Do not emit prompts, provider prompts, negative prompts or provider parameters; the execution adapter derives vendor transport from this structured direction at the final boundary.
- That derivation has only this direction to work from, so it must be complete enough to execute without interpretation, and everything a negative prompt would carry belongs in negative_constraints as direction.
- Negative constraints and repair instructions are mandatory and specific.
- Avoid generic cinematic language, impossible camera movement, identity drift and synthetic texture.
`;
}

function normalizeShotCompatibility(shot = {}) {
  const framePlan = object(shot.frame_plan);
  const audio = object(shot.audio);
  const graphics = object(shot.graphics);
  const vfx = object(shot.vfx);

  // The generated output duration follows the directed duration, because the directed duration is not
  // the one the director wrote. Shot durations are rescaled to meet the scene exactly -- a director
  // asking for one second, one second and eight gets that ratio stretched across the real scene length --
  // and generation.output_spec.duration_seconds was left holding the original number. The validator then
  // reported SHOT_OUTPUT_DURATION_MISMATCH on every shot, correctly, because the plan was asking the
  // provider to render a different length from the one the edit was cut to.
  //
  // This happens on every film, since scene durations must sum exactly to the master. It accounted for
  // the shot output spec failures on the rejected full-song film.
  const generation = object(shot.generation);
  const directedDuration = finite(shot.duration_seconds);
  const synchronisedGeneration = directedDuration
    ? {
        ...generation,
        output_spec: {
          ...object(generation.output_spec),
          duration_seconds: directedDuration,
        },
      }
    : generation;

  return {
    ...shot,
    generation: synchronisedGeneration,
    performance_direction:
      Object.keys(object(shot.performance_direction)).length
        ? shot.performance_direction
        : { direction: shot.performance || "" },
    opening_frame:
      Object.keys(object(shot.opening_frame)).length
        ? shot.opening_frame
        : { description: framePlan.opening_frame || "" },
    progression_frames:
      list(shot.progression_frames).length
        ? shot.progression_frames
        : [{ description: framePlan.progression || "" }],
    closing_frame:
      Object.keys(object(shot.closing_frame)).length
        ? shot.closing_frame
        : { description: framePlan.closing_frame || "" },
    music: Object.keys(object(shot.music)).length ? shot.music : object(audio.music),
    sound_effects: list(shot.sound_effects).length
      ? shot.sound_effects
      : list(audio.sound_effects),
    sound_design: Object.keys(object(shot.sound_design)).length
      ? shot.sound_design
      : {
          source_sound: audio.source_sound || "",
          silence: audio.silence || "",
          mix_intent: audio.mix_intent || "",
        },
    subtitles: list(shot.subtitles).length ? shot.subtitles : list(graphics.subtitles),
    typography: Object.keys(object(shot.typography)).length
      ? shot.typography
      : {
          titles: list(graphics.titles),
          render_text_outside_generated_pixels:
            graphics.render_text_outside_generated_pixels !== false,
        },
    vfx: Array.isArray(shot.vfx)
      ? shot.vfx
      : [
          ...list(vfx.effects),
          ...list(vfx.cleanup),
          ...list(vfx.compositing),
        ],
    assets: [],
  };
}

export const CreativeTemporalMasterPlanRuntime = {
  async create({
    organization_id,
    mission = {},
    project = {},
    brief = {},
    assets = [],
    approved_master = null,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!project.id) throw new Error("creative_project_id required");

    const duration = temporalDuration(project, brief);
    const audioContract =
      temporalAudioContract(project, brief);
    const qualityPolicy =
      qualityPolicyFor(project, brief);
    const normalizedAssets = list(assets).map(assetIdentity);
    // The shot skeleton used to name "ai.video.generate" literally, so every film planned against a
    // capability id written into the prompt rather than one this organization actually has. Resolve
    // the real list once and let the director choose from it.
    const { capabilities: productionCapabilities } =
      await availableProductionCapabilities(organization_id);
    const capabilityPairs = productionCapabilityPairs(productionCapabilities);
    if (!capabilityPairs.length) {
      throw new Error("CREATIVE_PRODUCTION_CAPABILITIES_REQUIRED");
    }
    const missionId = mission.id || mission.creative_mission_id || null;
    const executions = [];

    const promptMission = creativeMissionPromptSnapshot(mission);
    const promptProject = creativeProjectPromptSnapshot(project);
    const approvedMasterPlan = object(approved_master?.plan || approved_master);
    const tribunalSeeded = Object.keys(approvedMasterPlan).length > 0;
    if (tribunalSeeded && approvedMasterPlan.creative_tribunal?.passed !== true) {
      throw new Error("CREATIVE_TEMPORAL_TRIBUNAL_APPROVAL_REQUIRED");
    }
    if (tribunalSeeded && text(approvedMasterPlan.workflow_kind).toUpperCase() !== "TEMPORAL") {
      throw new Error(`CREATIVE_TEMPORAL_TRIBUNAL_WORKFLOW_REQUIRED:${text(approvedMasterPlan.workflow_kind) || "UNKNOWN"}`);
    }
    if (tribunalSeeded && list(approvedMasterPlan.scenes).length) {
      let approvedPlan = applyDerivedRoleDecisions(approvedMasterPlan, CREATIVE_AGENCY_ROLES);
      approvedPlan = normalizeTemporalMechanicalContract(approvedPlan, {
        duration_seconds: duration,
        assets: normalizedAssets,
      });
      const validation = assertCreativeMasterPlan({
        plan: approvedPlan,
        assets: normalizedAssets,
      });
      return {
        plan: {
          ...approvedPlan,
          degraded: false,
          release_blocked: false,
          validation,
        },
        validation,
        contract_repair: {
          executed: false,
          attempts: 0,
          maximum_attempts: MAXIMUM_CONTRACT_REPAIR_ATTEMPTS,
          rejected_repairs: [],
        },
        provider: null,
        model: null,
        usage: { calls: 0, items: [] },
        billing: { calls: 0, items: [] },
        fallback: false,
        degraded: false,
        chunked_temporal_direction: false,
        reused_approved_master: true,
      };
    }

    let basePlan;
    if (tribunalSeeded) {
      basePlan = {
        ...approvedMasterPlan,
        workflow_kind: "TEMPORAL",
        scenes: [],
        quality: qualityPolicy,
      };
    } else {
      const baseInput = {
        mission: promptMission,
        project: promptProject,
        brief,
        assets: normalizedAssets.map(temporalBaseAssetEvidence),
        duration,
        duration_mode: audioContract.mode,
        exact_duration_required: true,
        audio_contract: audioContract,
        quality_policy: qualityPolicy,
      };
      const baseExecution = await executeReasoning({
        organization_id,
        operation: "TEMPORAL_MASTER_PLAN_BASE_V1",
        missionId,
        projectId: project.id,
        prompt: basePlanPrompt(baseInput),
        maxOutputTokens: 16000,
      });
      executions.push(baseExecution.result);
      basePlan = {
        ...object(baseExecution.output),
        workflow_kind: "TEMPORAL",
        scenes: [],
        quality: qualityPolicy,
      };
    }

    let scenes = [];
    let architectureFailure = "";
    for (let attempt = 1; attempt <= MAXIMUM_SCENE_ARCHITECTURE_ATTEMPTS; attempt += 1) {
      const architectureExecution = await executeReasoning({
        organization_id,
        operation: "TEMPORAL_SCENE_ARCHITECTURE_V1",
        missionId,
        projectId: project.id,
        prompt: sceneArchitecturePrompt({
          basePlan,
          duration,
          range: sceneCountRange(duration),
          assets: normalizedAssets.map(temporalBaseAssetEvidence),
          project: promptProject,
          brief,
          audioContract,
          retryReason: architectureFailure,
        }),
        maxOutputTokens: 7000,
        serviceId: "ai.text.generate",
      });
      executions.push(architectureExecution.result);
      scenes = ensureStableIds(architectureExecution.output.scenes, "scene");
      if (scenes.length) break;
      architectureFailure = "the response did not contain a non-empty scenes array";
    }
    if (!scenes.length) {
      throw new Error(
        `CREATIVE_TEMPORAL_SCENE_ARCHITECTURE_REQUIRED:${MAXIMUM_SCENE_ARCHITECTURE_ATTEMPTS}_ATTEMPTS`,
      );
    }
    const authoredSceneDuration = scenes.reduce(
      (sum, scene) => sum + Math.max(0, Number(scene?.duration_seconds || 0)),
      0,
    );
    scenes = Math.abs(authoredSceneDuration - duration) <= 0.001
      ? scenes
      : allocateDurations(scenes, duration, 0.5);

    const outputSpec = object(list(basePlan.deliverables)[0]?.output_spec);

    // Each scene's shot direction is planned independently: shotPlanPrompt receives the base plan,
    // its own scene and the output spec, and never sees another scene's shots. Running them one
    // after another therefore bought nothing and cost everything -- a 205 second master is around
    // fifteen sequential calls, which is most of the fifty minutes a single film was taking to
    // produce direction with no media generated at all.
    //
    // They now run concurrently in bounded waves. Bounded rather than all at once because each call
    // can ask for up to 32,000 output tokens, and fifteen of those in flight together is a good way
    // to meet a provider rate limit and lose the film to throttling instead of latency.
    //
    // Scene order is reassembled by index, not by completion, because scene order is the film.
    async function planScene(scene, sceneIndex) {
      const shotRange = shotCountRange(scene.duration_seconds);
      let shots = [];
      let sceneFailure = null;
      let outstandingFailures = [];
      const results = [];

      // A single failing scene used to discard every scene planned before it. Each is retried once
      // on its own: a transient bad response costs one call rather than the whole film, and a scene
      // that fails twice still fails closed.
      for (let attempt = 1; attempt <= MAXIMUM_SCENE_SHOT_ATTEMPTS; attempt += 1) {
        try {
          const shotExecution = await executeReasoning({
            organization_id,
            operation: "TEMPORAL_SCENE_SHOT_DIRECTION_V1",
            missionId,
            projectId: project.id,
            prompt: shotPlanPrompt({
              basePlan,
              scene,
              sceneIndex,
              range: shotRange,
              assets: normalizedAssets.map(temporalBaseAssetEvidence),
              outputSpec,
              capabilityPairs,
              outstandingFailures,
            }),
            maxOutputTokens: shotCallTokenBudget(shotRange),
            serviceId: "ai.text.generate",
          });
          results.push(shotExecution.result);

          shots = ensureStableIds(shotExecution.output.shots, `${scene.id}-shot`);
          if (!shots.length) {
            sceneFailure = `CREATIVE_TEMPORAL_SCENE_SHOTS_REQUIRED:${scene.id}`;
            continue;
          }

          // Judge the scene on the rules the final validation will apply, against the same
          // normalisation it will see. "It returned some shots" was the entire test before, so a
          // scene of skeletal stubs passed here and surfaced as dozens of failures at assembly,
          // where two whole-plan repair calls had to fix every scene at once and could not.
          const candidate = allocateDurations(shots, scene.duration_seconds, 0.5)
            .map(normalizeShotCompatibility);
          outstandingFailures = creativeTemporalSceneShotFailures({
            shots: candidate,
            sceneIndex,
            quality: qualityPolicy,
            assets: normalizedAssets,
          });
          if (!outstandingFailures.length) {
            shots = candidate;
            break;
          }

          // The last attempt keeps its work. Incomplete direction is still worth more than none: the
          // whole-plan contract repair downstream can still fix a scene or two, and throwing here
          // would discard every other scene in the film.
          sceneFailure =
            `CREATIVE_TEMPORAL_SCENE_SHOTS_INCOMPLETE:${scene.id}:${outstandingFailures.length}_FAILURES`;
          shots = candidate;
        } catch (error) {
          // An unparseable or truncated response for one scene says nothing about the scenes that
          // already succeeded.
          sceneFailure = String(error?.message || error);
        }
      }

      if (!shots.length) {
        throw new Error(
          `CREATIVE_TEMPORAL_SCENE_SHOTS_REQUIRED:${scene.id}:${MAXIMUM_SCENE_SHOT_ATTEMPTS}_ATTEMPTS:${sceneFailure}`,
        );
      }

      return {
        sceneIndex,
        results,
        scene: {
          ...scene,
          shots,
        },
      };
    }

    const planned = [];
    for (let offset = 0; offset < scenes.length; offset += SCENE_SHOT_CONCURRENCY) {
      const wave = scenes
        .slice(offset, offset + SCENE_SHOT_CONCURRENCY)
        .map((scene, index) => planScene(scene, offset + index));
      planned.push(...(await Promise.all(wave)));
    }

    planned.sort((left, right) => left.sceneIndex - right.sceneIndex);
    for (const entry of planned) executions.push(...entry.results);
    const completedScenes = normalizeDynamicRhythmDurations(
      planned.map((entry) => entry.scene),
      0.5,
    );

    const projectTemporalContract = object(project.metadata?.temporal_contract || project.metadata?.temporalContract);
    let plan = {
      ...basePlan,
      workflow_kind: "TEMPORAL",
      scenes: completedScenes,
      quality: qualityPolicy,
      temporal_contract: {
        contract: audioContract.contract,
        planning_contract: text(projectTemporalContract.contract) || null,
        duration_seconds: duration,
        single_continuous_shot: projectTemporalContract.single_continuous_shot === true,
        scene_count: positiveInteger(projectTemporalContract.scene_count),
        shot_count: positiveInteger(projectTemporalContract.shot_count),
        music_allowed: audioContract.music_allowed !== false,
        duration_mode: audioContract.mode,
        timing_authority:
          audioContract.timing_authority,
        source_audio_required:
          audioContract.source_audio_required,
        original_music_required: audioContract.original_music_required === true,
        exact_duration_required: true,
        scene_duration_sum_must_equal_master: true,
        scene_duration_sum_must_equal_source:
          audioContract.source_audio_required,
        shot_duration_sum_must_equal_scene: true,
        dynamic_rhythm_required: true,
        shot_energy_curve_required: true,
        picture_locked_audio_direction_required: true,
        cinematic_spatial_soundfield_required: true,
        face_closeup_story_purpose_required: true,
        audio_production_rule:
          audioContract.production_rule,
      },
    };
    // The temporal path had no contract repair at all. It builds a plan across a base
    // call, a scene architecture call and a shot plan call per scene, then asserted the
    // assembled result once and threw on any failure -- while the universal path got
    // two repair attempts. Every temporal case therefore died on its first
    // imperfection, and the imperfections were contract completeness rather than
    // creative quality: an explicit NOT_REQUIRED missing for a role that does not apply
    // to film, an absent concept.creative_system, a shot without an output_spec. A film
    // was lost to a missing role status.
    //
    // The repair targets the assembled plan rather than re-running the pipeline, so it
    // costs one call instead of many, and it follows the same discipline as the other
    // repair paths: merge onto what exists, validate the candidate, and adopt it only
    // if it is valid. A repair that fails is discarded and costs an attempt, never the
    // film.
    // Roles the registry says cannot apply to this medium are completed before validation rather than
    // demanded from the director.
    plan = applyDerivedRoleDecisions(plan, CREATIVE_AGENCY_ROLES);
    plan = normalizeTemporalQualityContract(
      normalizeTemporalMechanicalContract(plan, { duration_seconds: duration, assets: normalizedAssets }),
    );

    let validation;
    let plannedRepairs = 0;
    let consecutiveNoProgressRepairs = 0;
    const rejectedRepairs = [];

    for (let attempt = 0; attempt <= MAXIMUM_CONTRACT_REPAIR_ATTEMPTS; attempt += 1) {
      try {
        validation = assertCreativeMasterPlan({
          plan,
          assets: normalizedAssets,
        });
        break;
      } catch (validationError) {
        if (attempt === MAXIMUM_CONTRACT_REPAIR_ATTEMPTS) {
          // The plan travels with the failure. A film is around fifteen calls of story, scene
          // architecture and shot direction, and rejecting it for two missing role statuses used to
          // discard all of it -- the work was gone and only the reason survived. Whoever reads this
          // failure can now read the film.
          validationError.rejected_plan = plan;
          throw validationError;
        }

        plannedRepairs += 1;
        const repair = await executeReasoning({
          organization_id,
          operation: "TEMPORAL_MASTER_PLAN_CONTRACT_REPAIR_V1",
          missionId: mission.id,
          projectId: project.id,
          maxOutputTokens: 12000,
          prompt: temporalContractRepairPrompt({
            plan,
            validationError,
            assets: normalizedAssets,
            attempt: plannedRepairs,
          }),
        });
        executions.push(repair.result);

        const normalizedRepair = normalizeTemporalRepairPatch(repair.output, plan);
        const candidate = normalizeTemporalQualityContract(
          normalizeTemporalMechanicalContract(
            mergeCreativeRepairedPlan(plan, normalizedRepair),
            { duration_seconds: duration, assets: normalizedAssets },
          ),
        );
        try {
          assertCreativeMasterPlan({ plan: candidate, assets: normalizedAssets });
          plan = candidate;
        } catch (candidateError) {
          const beforeFailures = repairFailureCount(validationError);
          const afterFailures = repairFailureCount(candidateError);
          if (afterFailures < beforeFailures) {
            plan = candidate;
            consecutiveNoProgressRepairs = 0;
            rejectedRepairs.push({
              attempt: plannedRepairs,
              partial_repair_accepted: true,
              failures_before: beforeFailures,
              failures_after: afterFailures,
              reason: String(candidateError?.message || candidateError).slice(0, 300),
            });
            continue;
          }
          consecutiveNoProgressRepairs += 1;
          rejectedRepairs.push({
            attempt: plannedRepairs,
            partial_repair_accepted: false,
            failures_before: beforeFailures,
            failures_after: afterFailures,
            consecutive_no_progress_repairs: consecutiveNoProgressRepairs,
            reason: String(candidateError?.message || candidateError).slice(0, 300),
          });
          if (consecutiveNoProgressRepairs >= MAXIMUM_CONSECUTIVE_NO_PROGRESS_REPAIRS) {
            validationError.rejected_plan = plan;
            throw validationError;
          }
          continue;
        }
      }
    }

    const lastExecution = executions[executions.length - 1] || {};
    return {
      plan: {
        ...plan,
        degraded: false,
        release_blocked: false,
        validation,
      },
      validation,
      contract_repair: {
        executed: plannedRepairs > 0,
        attempts: plannedRepairs,
        maximum_attempts: MAXIMUM_CONTRACT_REPAIR_ATTEMPTS,
        rejected_repairs: rejectedRepairs,
      },
      provider: lastExecution.provider || null,
      model: lastExecution.model || null,
      usage: {
        calls: executions.length,
        items: executions.map((item) => item.usage).filter(Boolean),
      },
      billing: {
        calls: executions.length,
        items: executions.map((item) => item.billing).filter(Boolean),
      },
      fallback: false,
      degraded: false,
      chunked_temporal_direction: true,
    };
  },
};
