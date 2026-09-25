import { createHash } from "node:crypto";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { awaitServiceExecutionCompletion } from "@/lib/platform/service-runtime/execution/ServiceExecutionCompletionRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";
import {
  executeIntelligenceLocalQueueAndWait,
} from "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime";
import {
  executeHierarchicalLocalIntelligence,
  shouldUseHierarchicalLocalIntelligence,
} from "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceHierarchicalLocalRuntime";
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
import {
  CreativeTemporalCinematicIntelligenceRuntime,
} from "@/lib/creative/director/runtime/CreativeTemporalCinematicIntelligenceRuntime";
import {
  CreativeStudioLearningRuntime,
} from "@/lib/creative/learning/runtime/CreativeStudioLearningRuntime";
import {
  CreativeTemporalTasteMemoryRuntime,
} from "@/lib/creative/learning/runtime/CreativeTemporalTasteMemoryRuntime";
import {
  CreativeFinishingIntelligenceRuntime,
} from "@/lib/creative/post-production/runtime/CreativeFinishingIntelligenceRuntime";
import {
  CreativeTemporalConsistencyIntelligenceRuntime,
} from "@/lib/creative/quality/runtime/CreativeTemporalConsistencyIntelligenceRuntime";
import {
  CreativeShotGenerationStrategyRuntime,
} from "@/lib/creative/director/runtime/CreativeShotGenerationStrategyRuntime";
import {
  CreativeShotFeasibilityForecastRuntime,
} from "@/lib/creative/quality/runtime/CreativeShotFeasibilityForecastRuntime";

const MAXIMUM_CONTRACT_REPAIR_ATTEMPTS = 5;
const MAXIMUM_CONSECUTIVE_NO_PROGRESS_REPAIRS = 2;
const TEMPORAL_REASONING_SETTLEMENT_MAX_POLLS = 180;
const TEMPORAL_REASONING_SETTLEMENT_INTERVAL_MS = 2000;
const TEMPORAL_REASONING_SETTLEMENT_DEADLINE_MS = 8 * 60 * 1000;

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

function compactTemporalRepairShot(shot = {}) {
  return {
    id: text(shot.id) || null,
    title: text(shot.title) || null,
    purpose: text(shot.purpose) || null,
    first_pass_intent: object(shot.first_pass_intent),
    subject: text(shot.subject) || null,
    action: text(shot.action) || null,
    performance: text(shot.performance) || null,
    duration_seconds: finite(shot.duration_seconds),
    tempo_role: text(shot.tempo_role) || null,
    energy_level: finite(shot.energy_level),
    camera: object(shot.camera),
    lighting: object(shot.lighting),
    production_design: object(shot.production_design),
    cinematic_beauty_intent: object(shot.cinematic_beauty_intent),
    signature_frame_design: object(shot.signature_frame_design),
    source_reinterpretation: object(shot.source_reinterpretation),
    subject_truth: object(shot.subject_truth),
    reference_evidence: list(shot.reference_evidence),
    continuity: object(shot.continuity),
    frame_plan: object(shot.frame_plan),
    opening_frame: object(shot.opening_frame),
    progression_frames: list(shot.progression_frames),
    closing_frame: object(shot.closing_frame),
    transition_in: text(shot.transition_in) || null,
    transition_out: text(shot.transition_out) || null,
    negative_constraints: list(shot.negative_constraints),
    known_failure_modes: list(shot.known_failure_modes),
    repair_instructions: list(shot.repair_instructions),
    generation: {
      required: shot.generation?.required === true,
      service: text(shot.generation?.service) || null,
      capability: text(shot.generation?.capability) || null,
      output_spec: object(shot.generation?.output_spec),
    },
    primary_source_asset_id: text(shot.primary_source_asset_id) || null,
    reference_assets: list(shot.reference_assets).map((entry) => ({
      asset_id: text(entry?.asset_id || entry?.id) || null,
      role: text(entry?.role) || null,
      semantic_claim: text(entry?.semantic_claim) || null,
    })),
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
        shots: [...shotIndexes]
          .map((shotIndex) => list(scene.shots)[shotIndex])
          .filter(Boolean)
          .map(compactTemporalRepairShot),
      };
    }),
  };
}
const MAXIMUM_SCENE_ARCHITECTURE_ATTEMPTS = 4;
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

function compactTemporalProject(project = {}) {
  const metadata = object(project.metadata);
  const compactMetadata = Object.fromEntries([
    "workflow_kind",
    "target_duration",
    "temporal_contract",
    "one_minute_pilot",
    "quality_floor",
    "creative_requirements",
    "story_requirements",
    "reference_strategy",
    "creative_learning",
  ].filter((key) => metadata[key] !== undefined).map((key) => [key, metadata[key]]));
  return {
    id: project.id || null,
    name: project.name || null,
    description: project.description || null,
    production_type: project.production_type || null,
    objective: project.objective || null,
    target_duration: project.target_duration || null,
    target_channels: list(project.target_channels),
    target_languages: list(project.target_languages),
    quality_profile: project.quality_profile || null,
    budget_profile: project.budget_profile || null,
    metadata: compactMetadata,
  };
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

function firstCompleteShotFromTruncatedJson(value) {
  const source = text(value);
  if (!source || !/"shots"\s*:\s*\[/.test(source)) return null;
  const shotsIndex = source.search(/"shots"\s*:\s*\[/);
  const start = source.indexOf("{", shotsIndex);
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
      try {
        const shot = JSON.parse(source.slice(start, index + 1));
        return shot && typeof shot === "object" && !Array.isArray(shot)
          ? { shots: [shot], recovered_truncated_first_shot: true }
          : null;
      } catch {
        return null;
      }
    }
    if (depth < 0) return null;
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

    if (current && typeof current === "object" && !Array.isArray(current)) {
      // Recovered direction results may already carry completed scenes/shots alongside
      // a serialized text copy. Prefer the structured arrays so a stale or lossy text
      // envelope can never erase valid Studio-authored direction.
      if (list(current.scenes).length || list(current.shots).length) return current;
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
    const recoveredShot = candidate ? firstCompleteShotFromTruncatedJson(candidate) : null;
    if (recoveredShot) return recoveredShot;

    if (current && typeof current === "object" && !Array.isArray(current)) {
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
      chapter_one_target_seconds: metadata.chapter_one_target_seconds ?? null,
      chapter_one_direction: metadata.chapter_one_direction || null,
      defer_product_explanation_until_later_chapters: metadata.defer_product_explanation_until_later_chapters === true,
      first_generation_stop_required: metadata.first_generation_stop_required === true,
      old_investor_script_authority: metadata.old_investor_script_authority === true,
    },
  };
}

function creativeBriefPromptSnapshot(brief = {}) {
  const metadata = object(brief.metadata);
  const grounding = object(metadata.creative_grounding);
  return {
    id: brief.id || null,
    title: brief.title || null,
    business_goal: brief.business_goal || null,
    creative_objective: brief.creative_objective || null,
    desired_outcome: brief.desired_outcome || null,
    communication_goal: brief.communication_goal || null,
    target_audience: object(brief.target_audience),
    markets: list(brief.markets),
    languages: list(brief.languages),
    channels: list(brief.channels),
    duration_seconds: brief.duration_seconds ?? brief.target_duration ?? null,
    tone: brief.tone || null,
    emotion: brief.emotion || null,
    requested_action: brief.requested_action || null,
    metadata: {
      creative_constraints: list(metadata.creative_constraints),
      chapter_one_target_seconds: metadata.chapter_one_target_seconds ?? null,
      first_generation_stop_required: metadata.first_generation_stop_required === true,
      user_preapproved_pre_generation_planning: metadata.user_preapproved_pre_generation_planning === true,
      creative_solution_source: metadata.creative_solution_source || null,
      investor_film_director_charter: object(metadata.investor_film_director_charter),
      investor_film_director_charter_digest: metadata.investor_film_director_charter_digest || null,
      investor_film_market_research_contract: metadata.investor_film_market_research_contract || null,
      investor_film_market_research_digest: metadata.investor_film_market_research_digest || null,
      canonical_product_evidence_digest: metadata.canonical_product_evidence_digest || null,
      existing_asset_authority: list(metadata.existing_asset_authority),
      grounding_reference_authority: object(metadata.grounding_reference_authority),
      creative_grounding: {
        benchmark_lab: object(grounding.benchmark_lab),
        grounding_reference_authority: object(grounding.grounding_reference_authority),
      },
      narration_required: metadata.narration_required === true,
      original_score_required: metadata.original_score_required === true,
      real_product_proof_required: metadata.real_product_proof_required === true,
      market_differentiation_required: metadata.market_differentiation_required === true,
      visible_causal_operating_mechanism_required: metadata.visible_causal_operating_mechanism_required === true,
      final_master_resolution: metadata.final_master_resolution || null,
      old_investor_script_authority: metadata.old_investor_script_authority === true,
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
      chapter_one_target_seconds: metadata.chapter_one_target_seconds ?? null,
      first_generation_stop_required: metadata.first_generation_stop_required === true,
      old_investor_script_authority: metadata.old_investor_script_authority === true,
    },
  };
}

function protectedOpeningAuthority({ mission = {}, project = {}, brief = {} } = {}) {
  const projectMetadata = object(project.metadata);
  const missionMetadata = object(mission.metadata);
  const briefMetadata = object(brief.metadata);
  const protectedSeconds = finite(
    briefMetadata.chapter_one_target_seconds ??
    projectMetadata.chapter_one_target_seconds ??
    missionMetadata.chapter_one_target_seconds,
  );
  const deferred = projectMetadata.defer_product_explanation_until_later_chapters === true;
  if (!protectedSeconds || protectedSeconds <= 0) return null;
  return {
    contract: "CREATIVE_PROTECTED_OPENING_AUTHORITY_V1",
    protected_seconds: protectedSeconds,
    opening_direction: text(projectMetadata.chapter_one_direction) || "MISSION_DEFINED_OPENING",
    product_explanation_deferred: deferred,
    product_explanation_allowed_before_seconds: deferred ? null : 0,
    product_explanation_allowed_from_seconds: deferred ? protectedSeconds : 0,
    creative_constraints: list(briefMetadata.creative_constraints),
    mission_objective: text(mission.objective),
    project_objective: text(project.objective),
    release_blocking: true,
  };
}

function protectedOpeningSceneFailures(scenes = [], authority = null) {
  if (!authority?.release_blocking || !authority?.protected_seconds) return [];
  const failures = [];
  const forbidden = authority.product_explanation_deferred === true
    ? /\b(avantiqo|dashboard|interface|approval|approve|approved|financial impact|supplier risk|product proof|business context|causal operating mechanism)\b/i
    : null;
  let elapsed = 0;
  const protectedScenes = [];
  for (const scene of list(scenes)) {
    const duration = Math.max(0, Number(scene?.duration_seconds || 0));
    const startsInside = elapsed < Number(authority.protected_seconds);
    if (startsInside) {
      protectedScenes.push(scene);
      if (scene?.mission_authority?.protected_opening !== true) failures.push(`scene ${text(scene?.id) || "UNKNOWN"} must be marked protected_opening`);
      if (scene?.mission_authority?.product_explanation_allowed !== false) failures.push(`scene ${text(scene?.id) || "UNKNOWN"} allows product explanation inside protected opening`);
      if (list(scene?.products).length) failures.push(`scene ${text(scene?.id) || "UNKNOWN"} assigns products inside protected opening`);
      const narrative = JSON.stringify({ title: scene?.title, objective: scene?.objective, state_change: scene?.state_change, story_state_after: scene?.story_state_after });
      if (forbidden?.test(narrative)) failures.push(`scene ${text(scene?.id) || "UNKNOWN"} contains product/business exposition inside protected opening`);
    }
    elapsed += duration;
  }
  if (elapsed < Number(authority.protected_seconds)) failures.push("scene architecture does not cover the protected opening duration");
  if (/GLOBAL/i.test(text(authority.opening_direction))) {
    const locations = new Set(protectedScenes.map((scene) => text(scene?.location?.name || scene?.location?.city || scene?.location?.country || scene?.location)).filter(Boolean));
    if (locations.size < 2) failures.push("global protected opening requires multiple materially distinct locations");
    const corpus = JSON.stringify(protectedScenes).toLowerCase();
    for (const signal of ["infrastructure", "technology", "people"]) {
      if (!corpus.includes(signal)) failures.push(`global protected opening missing ${signal} story signal`);
    }
  }
  return failures;
}

function deterministicSceneArchitectureFallback({ basePlan = {}, duration = 60 } = {}) {
  const total = Math.max(1, Number(duration) || 60);
  const story = object(basePlan.story);
  const concept = object(basePlan.concept);
  const authority = object(basePlan.mission_authority);
  const causal = text(story.causal_story) || text(concept.narrative) || text(concept.hook) || text(story.hook);
  const arrowBeats = causal
    .split(/\s*(?:→|->|=>|⟶|⇢)\s*/u)
    .map((beat) => text(beat))
    .filter(Boolean);
  const approvedTurns = list(concept.irreversible_turns)
    .map((beat) => text(beat))
    .filter(Boolean);
  const fallbackBeats = [
    text(story.hook) || text(concept.hook),
    text(story.escalation),
    text(story.turn),
    text(story.resolution) || text(story.payoff) || text(concept.message),
  ].filter(Boolean);
  const beats = (
    approvedTurns.length >= 3
      ? approvedTurns
      : arrowBeats.length >= 4
        ? arrowBeats
        : fallbackBeats
  ).slice(0, 7);
  if (beats.length < 3) {
    throw new Error("CREATIVE_TEMPORAL_APPROVED_STORY_BEATS_REQUIRED");
  }

  const sceneSeeds = beats.map((beat, index) => ({
    id: `scene-${String(index + 1).padStart(2, "0")}`,
    title: beat,
    duration_seconds: total / beats.length,
  }));
  const durations = allocateDurations(sceneSeeds, total, 0.5).map((scene) => Number(scene.duration_seconds));
  const humanDesire = text(story.human_desire) || "A human presence must remain the causal authority of the film.";
  const emotionalArc = text(story.emotional_arc) || text(concept.emotional_promise) || "stillness -> recognition -> emergence -> release";
  const payoff = text(story.emotional_payoff) || text(story.payoff) || text(story.resolution) || text(concept.message);
  let elapsed = 0;

  return beats.map((beat, index) => {
    const previousBeat = index > 0 ? beats[index - 1] : text(story.hook) || "The approved world begins in its opening state.";
    const nextBeat = index < beats.length - 1 ? beats[index + 1] : payoff || "The earned Avantiqo reveal resolves the chain.";
    const isFinal = index === beats.length - 1;
    const startsProtected = Boolean(authority.release_blocking && authority.protected_seconds && elapsed < Number(authority.protected_seconds));
    const pressureBefore = Math.round(10 + (index / Math.max(1, beats.length - 1)) * 62);
    const pressureAfter = isFinal ? 18 : Math.min(86, pressureBefore + 14);
    const scene = {
      id: `scene-${String(index + 1).padStart(2, "0")}`,
      title: beat,
      objective: `Make the approved causal beat visible exactly as authored, without substituting a new protagonist, location, device or mechanism: ${beat}.`,
      emotion: isFinal ? "Recognition and release." : `Advance the approved emotional arc without leaving it: ${emotionalArc}.`,
      emotional_job: `Move from ${previousBeat} to ${beat} while preserving the approved story causality.`,
      human_stake: humanDesire,
      story_state_before: previousBeat,
      state_change: beat,
      story_state_after: nextBeat,
      transition_logic: isFinal
        ? "Hold the earned reveal and finish without adding a new story mechanism."
        : `The physical consequence of ${beat} must lead directly into ${nextBeat}.`,
      tension: {
        pressure_before: pressureBefore,
        pressure_after: pressureAfter,
        audience_question: isFinal ? "What does the completed chain mean?" : `How does ${beat} cause ${nextBeat}?`,
        withheld_information: isFinal ? "Nothing essential remains withheld." : "The next approved causal beat remains withheld until this beat lands.",
        reveal_state: isFinal ? "RELEASE" : index >= beats.length - 2 ? "PAYOFF" : index === 0 ? "WITHHELD" : "ESCALATING",
        visual_density: Math.max(18, Math.min(72, 24 + index * 8)),
        sonic_pressure: index === 0 ? 0 : Math.max(10, Math.min(70, 14 + index * 9)),
        release_reason: isFinal ? "The approved causal chain has completed and the brand reveal has room to land." : "NOT_A_RELEASE",
        payoff: isFinal ? payoff || beat : "NOT_YET",
      },
      duration_seconds: durations[index],
      mission_authority: {
        protected_opening: startsProtected,
        product_explanation_allowed: !startsProtected,
        authority_jobs: ["Preserve the approved story beat literally; no substitute story, character, room, sensor, dashboard or corporate scenario is allowed."],
      },
      location: { name: beat, type: "approved story environment", story_signals: ["approved causal beat"] },
      actors: /child/i.test(beat)
        ? [{ role: "child", continuity: "the child belongs only to the approved child/well beat unless the approved story explicitly carries them forward" }]
        : [],
      products: [],
      brand_rules: isFinal
        ? ["Reveal Avantiqo only as the earned final consequence of the approved causal chain."]
        : ["Do not reveal or explain Avantiqo before the approved final beat."],
      visual_style: {
        principle: text(concept.creative_system) || "patient cinematic observation, physical causality, natural materials and restrained emergence",
        avoid: ["generic AI montage", "corporate office substitution", "dashboard or UI explanation", "sensor/device substitution", "unmotivated spectacle"],
      },
      camera_style: { principle: "camera behavior follows the exact approved beat; stillness and movement are motivated by physical causality" },
      audio_style: { principle: "sound begins and evolves only where the approved story says the world begins to respond" },
      reference_asset_ids: [],
    };
    elapsed += durations[index];
    return scene;
  });
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

function normalizeApprovedStoryContract(plan = {}) {
  const story = object(plan.story);
  const hook = text(story.hook) || text(plan.concept?.hook) || "A human begins to notice that a system designed to optimize decisions is reflecting something more personal than work.";
  const causal = text(story.causal_story) || text(plan.concept?.narrative) || "A manager moves from routine approval through hesitation and refusal to a new relationship with the system.";
  const payoff = text(story.payoff) || text(story.emotional_payoff) || text(plan.concept?.message) || "The human rediscovers agency and presence before the Avantiqo identity is finally revealed.";
  return {
    ...plan,
    story: {
      ...story,
      hook,
      audience_tension: text(story.audience_tension) || "The audience keeps asking whether the system is predicting the manager, controlling her, or simply revealing the choice she has stopped making for herself.",
      human_desire: text(story.human_desire) || "The manager wants enough space to make a genuinely human choice because constant optimization has made even her private desires feel pre-decided.",
      emotional_contradiction: text(story.emotional_contradiction) || "She depends on the system to make work effortless, yet the more perfectly it anticipates her, the less certain she feels that the next decision is actually hers.",
      vulnerability_or_risk: text(story.vulnerability_or_risk) || "When she stops approving the expected action, she risks disrupting the role and certainty that have protected her while exposing how disconnected she has become from her own intent.",
      empathy_path: text(story.empathy_path) || "We first observe her competence, then notice the hesitation she hides, and finally stay with her when silence becomes the only honest response because another automatic approval would betray what she feels.",
      escalation: text(story.escalation) || "Each system response becomes more personally accurate until the manager can no longer dismiss the pattern as convenience; after she refuses the routine approval, the room itself seems to wait with her.",
      observable_proof: text(story.observable_proof) || "The change is visible when her hand leaves the approval control, her breathing slows, and subsequent system behavior follows her human rhythm instead of presenting another optimized command.",
      turn: text(story.turn) || "The decisive turn occurs when she deliberately withholds the expected approval; because she stops feeding the control loop, the system shifts from directing action to observing her presence.",
      resolution: text(story.resolution) || "After the refusal, the system becomes quieter and responsive rather than directive, allowing the manager to occupy the moment as a person before Avantiqo is named.",
      call_to_action: text(story.call_to_action) || "Leave the audience with a restrained invitation to reconsider what a business operating system can make possible when technology creates room for human agency instead of replacing it.",
      emotional_arc: (() => {
        const current = text(story.emotional_arc);
        const states = current.split(/(?:→|->|=>|;|\bthen\b|\bto\b)/i).map(text).filter((entry) => entry.length >= 3);
        return states.length >= 4
          ? current
          : "controlled distance -> private unease because the system feels too accurate -> exposed tension when she refuses the expected action -> suspended stillness as control gives way -> recognition and relief when agency returns";
      })(),
      emotional_payoff: text(story.emotional_payoff) || payoff,
      anti_cliche_strategy: text(story.anti_cliche_strategy) || "Avoid holographic AI spectacle, random global montage and explanatory interface glamour; make the transformation legible through restrained behavior, causal silence, physical detail and an earned final brand reveal.",
      causal_story: causal,
      payoff,
    },
  };
}

function executableText(value, fallback, minimum = 20) {
  const current = text(value);
  if (current.length >= minimum) return current;
  return fallback;
}

function normalizeSignatureFrameDesign(shot = {}, scene = {}, context = {}) {
  const existing = object(shot.signature_frame_design);
  const subject = executableText(context.subject || shot.subject, "The authored primary subject and its immediate physical environment", 8);
  const action = executableText(context.action || shot.action, "A specific visible action changes the state of the frame", 12);
  const performance = executableText(context.performance || shot.performance, "Micro-behavior remains physically specific and causally tied to the action", 12);
  const purpose = executableText(context.purpose || shot.purpose, "Advance the approved causal story with one unmistakable visual change", 12);
  const camera = object(context.camera || shot.camera);
  const lighting = object(context.lighting || shot.lighting);
  const productionDesign = object(context.productionDesign || shot.production_design);
  const sceneObjective = executableText(scene.objective || scene.state_change, purpose, 12);

  return {
    ...existing,
    required: true,
    hero_frame: executableText(
      existing.hero_frame,
      `${subject}. ${action} Compose the release-grade hero image as ${text(camera.framing) || "a deliberate cinematic frame"} so the decisive visual proof of "${purpose}" is legible in a single still.`,
      36,
    ),
    graphic_silhouette: executableText(
      existing.graphic_silhouette,
      `Shape ${subject} into a clear large-form silhouette against ${text(productionDesign.environment) || "the authored environment"}, preserving readable negative space and preventing clutter from weakening the story beat.`,
      28,
    ),
    foreground_midground_background: executableText(
      existing.foreground_midground_background,
      `Foreground uses ${text(productionDesign.props) || "story-relevant physical detail"}; midground carries ${subject} and the action; background preserves ${text(productionDesign.environment) || "the established world"} so depth supports the scene objective "${sceneObjective}".`,
      28,
    ),
    material_light_event: executableText(
      existing.material_light_event,
      `${text(lighting.source) || "Motivated environmental light"} from ${text(lighting.direction) || "the established direction"} reveals ${text(productionDesign.materials) || "the authored materials"} exactly as ${action}, making the light/material response part of the story event rather than decorative polish.`,
      28,
    ),
    controlled_palette: executableText(
      existing.controlled_palette,
      `Keep a restrained ${text(lighting.colour) || "naturalistic"} palette with ${text(lighting.contrast) || "controlled contrast"}; reserve the strongest local contrast for the causal action and emotional focal point, not background decoration.`,
      24,
    ),
    natural_irregularity: executableText(
      existing.natural_irregularity,
      `Preserve physically uneven detail through ${text(productionDesign.texture_detail) || "surface wear, texture variation and imperfect edges"} plus the timing irregularity of ${performance}; reject showroom-perfect or procedurally uniform surfaces.`,
      28,
    ),
    atmosphere_physics: executableText(
      existing.atmosphere_physics,
      `Atmosphere must obey the established environment and motivated light: depth falloff, haze, particulate, moisture or air density remain spatially consistent while ${action}; no pasted fog or detached volumetrics.`,
      28,
    ),
    optical_character: executableText(
      existing.optical_character,
      `Use ${text(camera.lens_intent) || "a natural cinematic lens perspective"} with focus held on ${text(camera.focus_target) || subject}; ${text(camera.focus_transition) || "focus changes only when story attention changes"}, and any halation, flare or distortion must arise from the motivated light and lens.`,
      28,
    ),
    performance_microtruth: executableText(
      existing.performance_microtruth,
      `${performance} Preserve exact eyeline, breath, hand position, weight shift, environmental response or equivalent micro-detail so the moment reads as observed cause-and-effect rather than a posed generated frame.`,
      28,
    ),
    fear_or_desire_focus: executableText(
      existing.fear_or_desire_focus,
      `The emotional focal tension is the scene objective "${sceneObjective}": make the viewer feel the desire, uncertainty or consequence inside ${purpose} through the subject's behavior or the environment's physically visible response.`,
      24,
    ),
    anti_game_camera_rule: executableText(
      existing.anti_game_camera_rule,
      `Do not use centered third-person chase framing, follow-behind game-camera geometry, synthetic orbiting, or unmotivated tracking. Preserve the authored ${text(camera.framing) || "composition"} and ${text(camera.movement_path) || "restrained camera path"} only when the story event motivates movement.`,
      28,
    ),
    board_comparison_test: executableText(
      existing.board_comparison_test,
      `Freeze this shot as a premium agency storyboard frame: the subject hierarchy, causal action, depth, material truth, optical intent and emotional focal point must remain immediately readable without motion, UI labels, explanation or generic cinematic adjectives.`,
      28,
    ),
  };
}

function temporalShotFramingFallback(shot = {}, scene = {}, shotIndex = 0) {
  const semantic = [
    shot.title,
    shot.subject,
    shot.action,
    shot.purpose,
    scene.title,
    scene.objective,
    scene.state_change,
  ].map(text).join(" ").toLowerCase();
  const beat = Math.max(0, Number(shotIndex) || 0);

  if (/satellite|city|grid|global|world|landscape|horizon|aerial|orbital/.test(semantic)) {
    return [
      "wide establishing framing that makes the world-scale geography immediately legible",
      "context framing that isolates the active district or system inside the wider world",
      "close detail framing that reveals the decisive local signal inside the larger system",
      "wide payoff framing that restores world scale after the detail has earned meaning",
    ][beat % 4];
  }
  if (/leaf|crack|fracture|detail|surface|tool|hand|eye|ripple/.test(semantic)) {
    return [
      "macro detail framing that makes the first physical change unmistakable",
      "close intimate framing that connects the detail to its immediate consequence",
      "context framing that reveals how the local change affects the surrounding space",
      "medium human-scale framing that carries the consequence into the next causal beat",
    ][beat % 4];
  }
  if (/child|manager|person|human|worker|guest|artist|performer|decision/.test(semantic)) {
    return [
      "context framing that establishes the person inside the decision environment",
      "medium human-scale framing that preserves face, hands and decision context",
      "close intimate framing that prioritizes micro-performance and consequence",
      "detail insert framing that isolates the physical action causing the state change",
      "medium human-scale framing that reconnects action to reaction",
      "close intimate framing that lands the emotional consequence without posing",
    ][beat % 6];
  }
  return [
    "wide context framing that establishes geography and causal relationships",
    "medium human-scale framing that makes the active decision readable",
    "close intimate framing that isolates the key consequence",
    "context framing that reconnects the detail to the wider story state",
  ][beat % 4];
}

function normalizeShotExecutionContract(shot = {}, scene = {}, shotIndex = 0) {
  const title = executableText(shot.title, `Camera beat ${shotIndex + 1}: ${text(scene.title) || "human decision"}`, 8);
  const subject = executableText(shot.subject, "The same principal manager and the immediate physical evidence of her decision", 8);
  const action = executableText(shot.action, `The manager performs a distinct visible beat that advances the scene from "${text(scene.story_state_before) || "the prior state"}" toward "${text(scene.story_state_after) || "the changed state"}".`);
  const performance = executableText(shot.performance, "Performance stays restrained but observable: eye focus, breath, hand position and timing change in response to the previous beat rather than posing for the camera.");
  const purpose = executableText(shot.purpose, `Advance the approved causal story by making this camera beat prove the scene change: ${text(scene.state_change) || text(scene.objective) || "human agency becomes visible"}.`);
  const device = executableText(shot.device, "Keep the governing visual device deliberately restrained here so the human behavioral change, not decorative technology, carries the story.");
  const framePlan = object(shot.frame_plan);
  const asFrameText = (value, fallback, minimum) => {
    if (typeof value === "string" && value.trim().length >= minimum) return value.trim();
    if (value && typeof value === "object") {
      const compact = Object.values(value).map(text).filter(Boolean).join("; ");
      if (compact.length >= minimum) return compact;
    }
    return fallback;
  };
  const duration = Math.max(0.5, Number(shot.duration_seconds) || 0.5);
  const audio = object(shot.audio);
  const validSyncEvents = list(audio.sync_events).filter((entry) =>
    Number.isFinite(Number(entry?.at_seconds)) && Number(entry.at_seconds) >= 0 && text(entry?.event),
  );
  const camera = object(shot.camera);
  const lighting = object(shot.lighting);
  const productionDesign = object(shot.production_design);
  const continuity = object(shot.continuity);
  return normalizeShotCompatibility({
    ...shot,
    title,
    subject,
    action,
    performance,
    purpose,
    device,
    frame_plan: {
      ...framePlan,
      opening_frame: asFrameText(framePlan.opening_frame || shot.opening_frame, `Open on ${subject}; composition makes the current story state immediately legible before any movement begins.`, 30),
      progression: asFrameText(framePlan.progression || shot.progression_frames, `During the shot, ${action} The composition and focus change only when the performance creates a new piece of story information.`, 40),
      closing_frame: asFrameText(framePlan.closing_frame || shot.closing_frame, `End on the physical consequence of the action so the next shot inherits a changed state rather than repeating the same narrative beat.`, 30),
    },
    camera: {
      ...camera,
      framing: executableText(
        camera.framing,
        temporalShotFramingFallback(shot, scene, shotIndex),
        5,
      ),
      angle: executableText(camera.angle, "restrained eye-level angle with a slight observational offset", 5),
      camera_distance: executableText(camera.camera_distance, "human-scale distance close enough to read micro-performance", 5),
      lens_intent: executableText(camera.lens_intent, "natural perspective with selective depth to isolate the decision without glamorizing the interface", 5),
      movement_path: executableText(camera.movement_path, "locked composition or a minimal motivated drift that follows the actor only after the state changes", 5),
      movement_speed: executableText(camera.movement_speed, "very slow and subordinate to performance timing", 5),
      stabilization: executableText(camera.stabilization, "stable physical support with no synthetic floating motion", 5),
      movement_motivation: executableText(camera.movement_motivation, "movement exists only to reveal a new emotional fact created by the actor's behavior", 5),
      focus_target: executableText(camera.focus_target, "eyes", 3),
      focus_transition: executableText(camera.focus_transition, "shift focus only when attention moves from system evidence back to the human response", 5),
    },
    lighting: {
      ...lighting,
      source: executableText(lighting.source, "motivated practical and soft environmental key", 5),
      direction: executableText(lighting.direction, "side-biased direction that preserves facial shape and screen separation", 5),
      contrast: executableText(lighting.contrast, "controlled contrast with readable shadow detail", 5),
      colour: executableText(lighting.colour, "restrained neutral-warm skin against cooler operational ambience", 5),
      exposure_intent: executableText(lighting.exposure_intent, "protect skin and practical highlights while allowing the environment to fall gently away", 5),
    },
    production_design: {
      ...productionDesign,
      environment: executableText(productionDesign.environment, "credible contemporary operations environment designed around real work rather than science-fiction spectacle", 5),
      wardrobe: executableText(productionDesign.wardrobe, "consistent understated professional wardrobe with no costume change across the causal sequence", 5),
      props: executableText(productionDesign.props, "only task-relevant desk, device and work objects that support the visible decision", 5),
      materials: executableText(productionDesign.materials, "matte glass, metal, fabric and lived work surfaces with physically plausible response", 5),
      texture_detail: executableText(productionDesign.texture_detail, "subtle fingerprints, fabric weave and surface wear prevent synthetic showroom perfection", 5),
    },
    continuity: {
      ...continuity,
      identity: executableText(continuity.identity, "same principal manager identity, face, hair and physical proportions", 5),
      product: executableText(continuity.product, "same system and device context whenever visible", 5),
      location: executableText(continuity.location, "same established operational environment unless the scene explicitly changes location", 5),
      wardrobe: executableText(continuity.wardrobe, "same wardrobe state and accessories across adjacent shots", 5),
      screen_direction: executableText(continuity.screen_direction, "preserve established eyeline and left-right screen orientation", 5),
      spatial_geography: executableText(continuity.spatial_geography, "maintain desk, actor, screen and practical-light geography across coverage", 5),
    },
    signature_frame_design: normalizeSignatureFrameDesign(
      shot,
      scene,
      { subject, action, performance, purpose, camera, lighting, productionDesign },
    ),
    audio: {
      ...audio,
      source_sound: executableText(audio.source_sound, "physically motivated room tone, breath, cloth and subtle device sounds", 5),
      mix_intent: executableText(audio.mix_intent, "prioritize human-scale detail and pressure changes over decorative cinematic noise", 10),
      sync_events: validSyncEvents,
    },
    transition_in: executableText(shot.transition_in, "Enter from the previous causal beat on matched attention or motivated sound.", 8),
    transition_out: executableText(shot.transition_out, "Leave only after the visible state change creates the next question.", 8),
    negative_constraints: list(shot.negative_constraints).length ? shot.negative_constraints : ["No generic AI holograms, identity drift, impossible camera motion or decorative interface spectacle."],
    known_failure_modes: list(shot.known_failure_modes).length ? shot.known_failure_modes : ["Performance may read as posing instead of a causal reaction; preserve micro-behavior and eyeline continuity."],
    repair_instructions: list(shot.repair_instructions).length ? shot.repair_instructions : ["If the beat is unclear, strengthen the visible cause-and-effect action without changing the approved story."],
    energy_level: Number.isFinite(Number(shot.energy_level)) ? Math.max(0, Math.min(100, Number(shot.energy_level))) : 40,
    tempo_role: ["HOLD","BUILD","ACCELERATE","PEAK","RELEASE","SILENCE"].includes(text(shot.tempo_role).toUpperCase()) ? text(shot.tempo_role).toUpperCase() : "BUILD",
    duration_seconds: duration,
  }, scene, { validate_premium_contracts: false });
}

function ensureTemporalCadenceCoverage(plan = {}) {
  const duration = Number(plan.temporal_contract?.duration_seconds) || list(plan.scenes).reduce((sum, scene) => sum + (Number(scene.duration_seconds) || 0), 0);
  const target = duration >= 45 ? Math.max(10, Math.ceil(duration / 6)) : Math.max(1, Math.ceil(duration / 7.5));
  const scenes = list(plan.scenes).map((scene, sceneIndex) => ({
    ...scene,
    shots: list(scene.shots).map((shot, shotIndex) => normalizeShotExecutionContract(shot, scene, shotIndex)),
  }));
  let count = scenes.reduce((sum, scene) => sum + scene.shots.length, 0);
  while (count < target) {
    let bestScene = -1;
    let bestShot = -1;
    let bestDuration = 0;
    scenes.forEach((scene, sceneIndex) => scene.shots.forEach((shot, shotIndex) => {
      const value = Number(shot.duration_seconds) || 0;
      if (value > bestDuration && value >= 1.25) {
        bestDuration = value;
        bestScene = sceneIndex;
        bestShot = shotIndex;
      }
    }));
    if (bestScene < 0) break;
    const scene = scenes[bestScene];
    const original = scene.shots[bestShot];
    const firstDuration = Number((bestDuration * 0.52).toFixed(3));
    const secondDuration = Number((bestDuration - firstDuration).toFixed(3));
    const first = normalizeShotExecutionContract({
      ...original,
      id: `${text(original.id) || `scene-${bestScene + 1}-shot-${bestShot + 1}`}-a`,
      title: `${text(original.title) || "Directed beat"} — cause`,
      purpose: `Establish the immediate cause of this beat before the consequence lands; ${text(original.purpose)}`,
      first_pass_intent: {
        ...object(original.first_pass_intent),
        story_delta: `Isolate the causal setup from the original beat so the audience understands what creates the consequence before it arrives.`,
        visible_event: `The opening state resolves into the decisive physical cause while preserving the original subject and geography.`,
        edit_reason: `This cause-side angle gives the following consequence shot a motivated cut point instead of forcing one long generated take.`,
      },
      action: `Begin the existing action and isolate the decisive physical cause: ${text(original.action)}`,
      duration_seconds: firstDuration,
      generation: {
        ...object(original.generation),
        output_spec: { ...object(original.generation?.output_spec), duration_seconds: firstDuration },
      },
    }, scene, bestShot);
    const second = normalizeShotExecutionContract({
      ...original,
      id: `${text(original.id) || `scene-${bestScene + 1}-shot-${bestShot + 1}`}-b`,
      title: `${text(original.title) || "Directed beat"} — consequence`,
      purpose: `Show the observable consequence created by the preceding cause so the scene changes state rather than repeating itself; ${text(original.purpose)}`,
      first_pass_intent: {
        ...object(original.first_pass_intent),
        story_delta: `Land the consequence of the immediately preceding cause and leave the scene in a materially changed state.`,
        visible_event: `The established action produces a visible reaction, displacement, reveal or environmental response that was absent at the cut-in.`,
        edit_reason: `This consequence-side angle completes the causal edit pair and creates a clean changed state for the next shot.`,
      },
      action: `Continue from the established action into its visible consequence, changing eyeline, hand position, distance or environmental response: ${text(original.action)}`,
      duration_seconds: secondDuration,
      transition_in: "Cut on the completed cause from the preceding camera beat, preserving exact spatial continuity.",
      generation: {
        ...object(original.generation),
        output_spec: { ...object(original.generation?.output_spec), duration_seconds: secondDuration },
      },
    }, scene, bestShot + 1);
    scene.shots.splice(bestShot, 1, first, second);
    count += 1;
  }
  return { ...plan, scenes };
}

function normalizeTemporalQualityContract(plan = {}) {
  plan = normalizeApprovedStoryContract(plan);
  plan = ensureTemporalCadenceCoverage(plan);
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

function repairFailureSignatures(error) {
  const failures = Array.isArray(error?.validation?.failures) ? error.validation.failures : [];
  return new Set(failures.map((entry) => `${text(entry?.code)}@${text(entry?.path)}`));
}

function introducedRepairFailures(beforeError, afterError) {
  const before = repairFailureSignatures(beforeError);
  return [...repairFailureSignatures(afterError)].filter((signature) => !before.has(signature));
}

function preserveTemporalStructuralIds(basePlan = {}, candidatePlan = {}) {
  const baseScenes = list(basePlan.scenes);
  const candidateScenes = list(candidatePlan.scenes);
  const nextScenes = candidateScenes.map((scene, sceneIndex) => {
    const baseScene = baseScenes.find((entry) => text(entry?.id) === text(scene?.id)) || baseScenes[sceneIndex] || {};
    const sceneId = text(scene?.id) || text(baseScene?.id) || `scene-${String(sceneIndex + 1).padStart(2, "0")}`;
    const baseShots = list(baseScene.shots);
    const knownShotIds = new Set(baseShots.map((entry) => text(entry?.id)).filter(Boolean));
    const shots = list(scene?.shots).map((shot, shotIndex) => {
      const authoredId = text(shot?.id);
      const baseShot = (authoredId && knownShotIds.has(authoredId)
        ? baseShots.find((entry) => text(entry?.id) === authoredId)
        : baseShots[shotIndex]) || {};
      return {
        ...shot,
        id: authoredId || text(baseShot?.id) || `${sceneId}-shot-${String(shotIndex + 1).padStart(2, "0")}`,
      };
    });
    return { ...scene, id: sceneId, shots };
  });
  return { ...candidatePlan, scenes: nextScenes };
}

function scrubUnknownTemporalAssetReferences(plan = {}, assets = []) {
  const allowed = new Set(list(assets).map((asset) => text(asset?.id || asset?.asset_id)).filter(Boolean));
  if (!allowed.size) return plan;
  const keep = (value) => allowed.has(text(value));
  const scrubShot = (shot = {}) => {
    const referenceAssets = list(shot.reference_assets).filter((entry) => keep(entry?.asset_id));
    const referenceAssetIds = list(shot.reference_asset_ids).map(text).filter((id) => allowed.has(id));
    const assetIds = list(shot.assets).map(text).filter((id) => allowed.has(id));
    const primary = keep(shot.primary_source_asset_id) ? text(shot.primary_source_asset_id) : null;
    const generation = object(shot.generation);
    const generationPrimary = keep(generation.primary_source_asset_id)
      ? text(generation.primary_source_asset_id)
      : null;
    return {
      ...shot,
      primary_source_asset_id: primary,
      assets: assetIds,
      reference_assets: referenceAssets,
      reference_asset_ids: referenceAssetIds,
      generation: { ...generation, primary_source_asset_id: generationPrimary },
    };
  };
  const scenes = list(plan.scenes).map((scene) => ({
    ...scene,
    reference_asset_ids: list(scene.reference_asset_ids).map(text).filter((id) => allowed.has(id)),
    shots: list(scene.shots).map(scrubShot),
  }));
  return { ...plan, scenes };
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

function shotCountRange(duration, { scene = {}, plan = {} } = {}) {
  const language = [
    scene.title,
    scene.objective,
    scene.emotion,
    scene.transition_logic,
    scene.tension?.audience_question,
    plan.concept?.creative_thesis,
    plan.concept?.hook,
    plan.story?.audience_tension,
    plan.story?.escalation,
    plan.story?.emotional_arc,
  ].map(text).join(" ").toLowerCase();
  const patient = /patient|meditative|contemplative|slow burn|stillness|restrained|linger|quiet/.test(language);
  const tensionDriven = /mystery|mystic|tension|suspense|withhold|reveal|anticipat|unease|pressure/.test(language);
  const kinetic = /kinetic|rapid|fast[- ]paced|accelera|urgent|frenetic|high energy/.test(language);
  const deliberateLongTake = Boolean(
    scene.long_take_strategy?.intentional === true ||
    /single[- ]take|one[- ]take|long[- ]take|continuous[- ]take|unbroken shot/.test(language)
  );
  let maxAverageSeconds = 7.5;
  if (patient) maxAverageSeconds = 8.5;
  if (tensionDriven) maxAverageSeconds = Math.min(maxAverageSeconds, 6);
  if (kinetic) maxAverageSeconds = Math.min(maxAverageSeconds, 4.5);
  if (deliberateLongTake) maxAverageSeconds = Math.max(maxAverageSeconds, duration);
  const minimum = deliberateLongTake ? 1 : Math.max(2, Math.ceil(duration / maxAverageSeconds));
  const referenceAverage = kinetic ? 3.5 : tensionDriven ? 4.75 : patient ? 7 : 5.5;
  const reference = Math.max(minimum, Math.round(duration / referenceAverage));
  return {
    minimum,
    reference,
    preferred: reference,
    maximum: Math.min(40, Math.max(minimum + 4, Math.round(duration / 0.75))),
    cadence_basis: {
      duration_seconds: duration,
      maximum_average_shot_seconds: maxAverageSeconds,
      patient,
      tension_driven: tensionDriven,
      kinetic,
      deliberate_long_take: deliberateLongTake,
      narrative_movements_are_not_shots: true,
    },
  };
}


const VISUAL_WORLD_DIRECTORS = Object.freeze([
  { id: "ART", operation: "TEMPORAL_VISUAL_WORLD_ART_V1", role: "Art Director + Production Designer", bias: "invent architecture, materials, objects, typography, graphic hierarchy, spatial design and a physically specific luxury world" },
  { id: "CINEMATOGRAPHY", operation: "TEMPORAL_VISUAL_WORLD_CINEMATOGRAPHY_V1", role: "Director of Photography + Previsualization Director", bias: "invent optical character, scale, camera position, lens behavior, reveal geometry, light behavior and impossible-but-executable camera experiences" },
  { id: "VFX_MOTION", operation: "TEMPORAL_VISUAL_WORLD_VFX_MOTION_V1", role: "VFX + Motion Design Director", bias: "invent transformation physics, simulation, compositing, graphic motion, transitions and images that cannot be achieved by ordinary coverage" },
]);

function visualWorldDirectorPrompt({ director, basePlan, project, brief, assets }) {
  return `You are Avantiqo's ${director.role}. Create ONE complete visual world for this film before scene or shot engineering begins.
Your creative bias: ${director.bias}.
Do not imitate or recreate any named benchmark campaign. Benchmarks are craft floors only.
Do not solve this with generic cinematic adjectives, a normal office, a person at a laptop, floating UI, glowing network lines, random particles, generic AI brains, slow zooms, generic drone beauty, or chaos-becomes-calm unless the mission itself makes one indispensable and you can prove an original execution.
The world must make the concept more powerful through authored art, design, layout, graphics, technology, physical materials, scale, light and motion. When the mission calls for luxury, elegance, brutality, warmth, restraint, documentary truth or another aesthetic mode, express that through specific materials and spatial decisions rather than generic adjectives.
Invent before you engineer. Prefer surprising but executable ideas over safe coverage.
Return strict JSON only:
{"director_id":"${director.id}","world":{"name":"","visual_thesis":"","governing_image_idea":"","spatial_logic":"","architecture":"","materials_and_surface_behavior":"","palette_logic":"","light_behavior":"","atmosphere":"","human_scale_logic":"","object_and_technology_design":"","graphic_and_typography_system":"","optical_language":"","camera_experience":"","transformation_physics":"","vfx_and_motion_language":"","sound_picture_relationship":"","signature_images":["","","","",""],"impossible_but_executable_images":["","",""],"novelty_rules":["","",""],"forbidden_defaults":["","","","",""],"production_implications":["","",""]}}
CONCEPT/STORY\n${JSON.stringify({concept:basePlan.concept,story:basePlan.story})}
ADVISORY TASTE MEMORY\n${JSON.stringify(basePlan.taste_memory || {})}
PROJECT\n${JSON.stringify(compactTemporalProject(project))}
BRIEF/RESEARCH\n${JSON.stringify(brief)}
ASSETS\n${JSON.stringify(assets)}`;
}

function visualWorldSelectionPrompt({ worlds, basePlan, project, brief }) {
  return `You are Avantiqo's Executive Creative Director and Taste Director. Select ONE visual world. Do not average the three into a safe hybrid.
Choose the world with the strongest ownable imagination, beauty, aesthetic fit, material authority, technological sophistication, graphic/design authority, cinematic potential and mission fidelity. A technically feasible but ordinary world must lose.
Reject any world whose central experience could be summarized as ordinary coverage plus polish.
Do not copy any benchmark campaign. The selected world must belong to this mission.
The selected_world contract is strict: return at least 4 distinct signature_images, at least 3 anti_flatness_rules, and at least 4 forbidden_defaults. Do not set taste_gate.passed=true unless those structural requirements are satisfied as well as the numeric taste thresholds.
Return strict JSON only:
{"selected_director_id":"ART|CINEMATOGRAPHY|VFX_MOTION","selected_world":{"name":"","visual_thesis":"","governing_image_idea":"","spatial_logic":"","architecture":"","materials_and_surface_behavior":"","palette_logic":"","light_behavior":"","atmosphere":"","human_scale_logic":"","object_and_technology_design":"","graphic_and_typography_system":"","optical_language":"","camera_experience":"","transformation_physics":"","vfx_and_motion_language":"","sound_picture_relationship":"","signature_images":["","","",""],"impossible_but_executable_images":[""],"novelty_rules":[""],"anti_flatness_rules":["","",""],"forbidden_defaults":["","","",""],"production_implications":[""]},"selection_reason":"","rejected_worlds":[{"director_id":"","reason":""}],"taste_gate":{"passed":true,"originality":0,"art_direction":0,"cinematic_invention":0,"graphic_design":0,"material_authority":0,"aesthetic_fit":0,"technology_imagination":0,"overall":0,"weakest_link":""}}
MASTER CONCEPT\n${JSON.stringify({concept:basePlan.concept,story:basePlan.story})}
ADVISORY TASTE MEMORY\n${JSON.stringify(basePlan.taste_memory || {})}
PROJECT\n${JSON.stringify(compactTemporalProject(project))}
BRIEF/RESEARCH\n${JSON.stringify(brief)}
CANDIDATE WORLDS\n${JSON.stringify(worlds)}`;
}

async function recoverChallengerSettledDirection({ organization_id, projectId, missionId, operation, prompt = "" }) {
  const project = await CreativeProjectRuntime.get(projectId);
  const checkpoint = object(project?.metadata?.creative_challenger_selection_checkpoint);
  if (checkpoint.contract !== "CREATIVE_CHALLENGER_SELECTION_CHECKPOINT_V1") return null;
  if (text(checkpoint.organization_id) !== text(organization_id)) return null;
  if (text(checkpoint.creative_project_id) !== text(projectId)) return null;
  if (text(checkpoint.creative_mission_id) !== text(missionId)) return null;
  const normalizedOperation = text(operation).toUpperCase();
  let usageId = text(object(checkpoint.settled_operation_usage_ids)[normalizedOperation]);
  if (!usageId && normalizedOperation === "TEMPORAL_SCENE_SHOT_DIRECTION_V1") {
    const sceneMatch = text(prompt).match(/SCENE INDEX:\s*(\d+)/i);
    const sceneIndex = sceneMatch ? Number(sceneMatch[1]) : null;
    const entry = list(checkpoint.settled_scene_direction_usage_ids).find((item) =>
      Number(item?.scene_index) === sceneIndex,
    );
    usageId = text(entry?.id);
  }
  if (!usageId && normalizedOperation === "TEMPORAL_MASTER_PLAN_CONTRACT_REPAIR_V1") {
    const repairMatch = text(prompt).match(/repair attempt\s+(\d+)\s+of/i);
    const repairIndex = repairMatch ? Number(repairMatch[1]) : null;
    const entry = list(checkpoint.settled_temporal_repair_usage_ids).find((item) =>
      Number(item?.repair_index) === repairIndex,
    );
    usageId = text(entry?.id);
  }
  if (!usageId) return null;
  const rows = await UsageRuntime.creativeDirectionRecoveryCandidates({
    organization_id,
    creative_project_id: projectId,
    operation: normalizedOperation,
    limit: 50,
  });
  const usage = rows.find((row) => text(row.id) === usageId);
  if (!usage || text(usage.status).toUpperCase() !== "SUCCESS") {
    throw new Error(`CREATIVE_CHALLENGER_SETTLED_USAGE_INVALID:${operation}:${usageId}`);
  }
  if (text(usage.metadata?.creative_mission_id) !== text(missionId)) {
    throw new Error(`CREATIVE_CHALLENGER_SETTLED_USAGE_SCOPE_MISMATCH:${operation}:${usageId}`);
  }
  const providerResult = object(usage.metadata?.provider_result || usage.metadata?.result);
  if (!Object.keys(providerResult).length) {
    throw new Error(`CREATIVE_CHALLENGER_SETTLED_USAGE_RESULT_REQUIRED:${operation}:${usageId}`);
  }
  console.log(`CREATIVE_CHALLENGER_SETTLED_REPLAY=${operation}:${usageId}`);
  return {
    success: true, pending: false, provider: usage.provider || providerResult.provider || null,
    usage, billing: { id: usage.billing_invoice_line_id || usage.invoice_id || null, usage },
    settlement: "CHARGED", challenger_lineage_replay: true, output: providerResult,
  };
}

function temporalReasoningUsageId({
  projectId,
  operation,
  prompt,
  maxOutputTokens,
  serviceId,
} = {}) {
  const requestFingerprint = createHash("sha256")
    .update(JSON.stringify({
      contract: "TEMPORAL_REASONING_USAGE_ID_V2",
      prompt: String(prompt ?? ""),
      max_output_tokens: Math.min(Number(maxOutputTokens) || 1024, 6000),
      service_id: text(serviceId),
      execution_lane: "deep",
      response_format: "json_object",
    }))
    .digest("hex")
    .slice(0, 24);
  return `creative-temporal:${projectId}:${operation}:${requestFingerprint}`;
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
  const localOnly = ["1", "true", "yes", "on"].includes(
    String(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED || "").trim().toLowerCase(),
  );
  let completed;
  if (localOnly) {
    const localInput = {
      capability: serviceId,
      execution_lane: "deep",
      local_compute_required: true,
      infrastructure_policy: "local_only",
      context: {
        organization_id,
        usage_id: temporalReasoningUsageId({ projectId, operation, prompt, maxOutputTokens, serviceId }),
      },
      prompt,
      max_output_tokens: Math.min(Number(maxOutputTokens) || 1024, 6000),
      response_format: { type: "json_object" },
      metadata: {
        module: "CREATIVE",
        operation,
        creative_mission_id: missionId || null,
        creative_project_id: projectId,
        media_generation_allowed: false,
        supplier_billing_required: false,
      },
    };
    completed = shouldUseHierarchicalLocalIntelligence(localInput)
      ? await executeHierarchicalLocalIntelligence(localInput)
      : await executeIntelligenceLocalQueueAndWait(localInput, {
          timeout_ms: 600000,
          poll_ms: 500,
        });
  } else {
    completed = await ServiceExecutionRuntime.execute({
      organization_id,
      service_id: serviceId,
      provider_id: null,
      category: "CREATIVE_DIRECTION",
      input: {
        prompt,
        quantity: 1,
        max_output_tokens: maxOutputTokens,
        response_format: { type: "json_object" },
      },
      metadata: {
        module: "CREATIVE",
        operation,
        creative_mission_id: missionId || null,
        creative_project_id: projectId,
      },
    });
  }

  const result = completed;
  if (completed?.pending === true) {
    const providerJobId = text(completed.provider_job_id);
    const usageId = text(completed.usage?.id);
    if (!providerJobId || !usageId) {
      throw new Error(`${operation}_PENDING_SETTLEMENT_BINDING_REQUIRED`);
    }
    const deadlineAt = Date.now() + TEMPORAL_REASONING_SETTLEMENT_DEADLINE_MS;
    for (let poll = 1; poll <= TEMPORAL_REASONING_SETTLEMENT_MAX_POLLS; poll += 1) {
      if (Date.now() >= deadlineAt) break;
      const settled = await ServiceExecutionRuntime.settle({
        organization_id,
        provider: completed.provider,
        provider_job_id: providerJobId,
        usage_id: usageId,
        pricing: object(completed.pricing),
        quantity: completed.usage?.quantity ?? 1,
        unit: completed.usage?.unit || completed.pricing?.unit || "request",
        metadata: {
          module: "CREATIVE",
          operation: `${operation}_SETTLEMENT`,
          creative_mission_id: missionId || null,
          creative_project_id: projectId,
          provider_job_reused: true,
          duplicate_provider_job_submitted: false,
          pending_settlement_poll: poll,
          pending_settlement_deadline_ms: TEMPORAL_REASONING_SETTLEMENT_DEADLINE_MS,
        },
        provider_status_input: { capability: serviceId, execution_lane: "deep" },
        credential_id: completed.credential_id || null,
        started_at: completed.started_at || null,
      });
      if (settled?.pending === true) {
        await new Promise((resolve) => setTimeout(resolve, TEMPORAL_REASONING_SETTLEMENT_INTERVAL_MS));
        continue;
      }
      if (settled?.failed === true || settled?.success !== true) {
        throw new Error(`${operation}_PENDING_SETTLEMENT_FAILED:${text(settled?.error) || "UNKNOWN"}`);
      }
      completed = settled;
      break;
    }
    if (completed?.pending === true) {
      throw new Error(`${operation}_PENDING_SETTLEMENT_TIMEOUT`);
    }
  }

  const output = normalizedOutput(completed);
  if (!output) throw new Error(`${operation}_JSON_REQUIRED`);
  return { output, result: completed };
}

async function developVisualWorld({ organization_id, missionId, projectId, basePlan, project, brief, assets }) {
  const calls = VISUAL_WORLD_DIRECTORS.map(async (director) => {
    const execution = await executeReasoning({
      organization_id,
      operation: director.operation,
      missionId,
      projectId,
      prompt: visualWorldDirectorPrompt({ director, basePlan, project, brief, assets }),
      maxOutputTokens: 7000,
    });
    const world = object(execution.output.world || execution.output);
    if (!text(world.name) || !text(world.visual_thesis) || list(world.signature_images).length < 3) {
      throw new Error(`${director.operation}_WORLD_INCOMPLETE`);
    }
    return { director_id: director.id, world, result: execution.result };
  });
  const candidates = await Promise.all(calls);
  const selection = await executeReasoning({
    organization_id,
    operation: "TEMPORAL_VISUAL_WORLD_SELECTION_V1",
    missionId,
    projectId,
    prompt: visualWorldSelectionPrompt({ worlds: candidates.map(({director_id,world})=>({director_id,world})), basePlan, project, brief }),
    maxOutputTokens: 8000,
  });
  const selectedWorld = object(selection.output.selected_world);
  const taste = object(selection.output.taste_gate);
  const tasteScores = {
    originality: finite(taste.originality) ?? 0,
    art_direction: finite(taste.art_direction) ?? 0,
    cinematic_invention: finite(taste.cinematic_invention) ?? 0,
    graphic_design: finite(taste.graphic_design) ?? 0,
    material_authority: finite(taste.material_authority) ?? 0,
    aesthetic_fit: finite(taste.aesthetic_fit) ?? 0,
    technology_imagination: finite(taste.technology_imagination) ?? 0,
    overall: finite(taste.overall) ?? 0,
  };
  const tastePassed =
    taste.passed === true &&
    tasteScores.overall >= 88 &&
    tasteScores.originality >= 86 &&
    tasteScores.art_direction >= 88 &&
    tasteScores.cinematic_invention >= 88 &&
    tasteScores.graphic_design >= 80 &&
    tasteScores.material_authority >= 84 &&
    tasteScores.aesthetic_fit >= 88 &&
    tasteScores.technology_imagination >= 84 &&
    list(selectedWorld.signature_images).length >= 4 &&
    list(selectedWorld.anti_flatness_rules).length >= 3 &&
    list(selectedWorld.forbidden_defaults).length >= 4;
  if (!text(selectedWorld.name) || !tastePassed) {
    throw new Error(`TEMPORAL_VISUAL_WORLD_TASTE_GATE_FAILED:${JSON.stringify(tasteScores)}`);
  }
  return {
    world: {
      ...selectedWorld,
      contract: "AVANTIQO_VISUAL_WORLD_DEVELOPMENT_V1",
      selected_director_id: text(selection.output.selected_director_id),
      selection_reason: text(selection.output.selection_reason),
      taste_gate: taste,
      rejected_worlds: list(selection.output.rejected_worlds),
    },
    results: [...candidates.map((entry)=>entry.result), selection.result],
  };
}

function shotInventionPrompt({ basePlan, scenes, project, brief }) {
  return `You are Avantiqo's Shot Invention Director, working after visual-world selection but before technical shot engineering.
Invent the film's visual experiences. Do not fill camera paperwork. Do not write vendor prompts. Do not merely say push in, pan, orbit, drone or close-up.
For every scene, decide what the audience experiences that could not come from ordinary coverage. Use art direction, spatial design, optical behavior, scale changes, macro/detail, reflections, occlusion, transitions, graphics, VFX, simulation, sound-picture events, impossible-but-executable transformations and deliberate stillness when they earn meaning.
The selected visual world is binding. Preserve its design logic. Reject safe camera coverage that dilutes it.
Use ADVISORY TASTE MEMORY only to avoid evidenced repeated failure patterns and calibrate the quality floor. Never copy prior accepted work or let memory replace fresh invention.
REQUIRED SCENE IDS (return every one exactly, with the same spelling and hyphens; do not substitute underscores, renumber, omit, merge or invent ids): ${JSON.stringify(scenes.map((scene) => text(scene.id)))}
Return strict JSON only as {"scenes":[...]} with exactly one entry for each required scene id:
{"scenes":[{"scene_id":"","invention_thesis":"","opening_image":"","progression_images":[""],"closing_image":"","shot_ideas":[{"purpose":"","visual_invention":"","hero_frame":"","graphic_silhouette":"","depth_design":"","material_light_event":"","emotional_focal_detail":"","camera_concept":"","anti_game_camera_rule":"","optical_behavior":"","production_design":"","vfx_motion":"","graphic_behavior":"","sound_picture_event":"","transition_logic":"","why_not_generic":""}],"contrast_strategy":"","forbidden_defaults":[""]}]}
MASTER CONCEPT/STORY\n${JSON.stringify({concept:basePlan.concept,story:basePlan.story})}
SELECTED VISUAL WORLD\n${JSON.stringify(basePlan.visual_world)}
SCENES\n${JSON.stringify(scenes)}
PROJECT\n${JSON.stringify(compactTemporalProject(project))}
BRIEF/RESEARCH\n${JSON.stringify(brief)}`;
}

function canonicalShotInventionSceneId(value, sceneIds = []) {
  const candidate = text(value);
  const exact = sceneIds.find((sceneId) => sceneId === candidate);
  if (exact) return exact;
  const normalized = candidate.replace(/_/g, "-").toLowerCase();
  const matches = sceneIds.filter((sceneId) =>
    text(sceneId).replace(/_/g, "-").toLowerCase() === normalized,
  );
  return matches.length === 1 ? matches[0] : candidate;
}

async function createShotInventionMap({ organization_id, missionId, projectId, basePlan, scenes, project, brief }) {
  const sceneIds = scenes.map((scene) => text(scene.id)).filter(Boolean);
  const executions = [];
  const entries = [];
  for (const scene of scenes) {
    const execution = await executeReasoning({
      organization_id,
      operation: "TEMPORAL_SHOT_INVENTION_MAP_V1",
      missionId,
      projectId,
      prompt: shotInventionPrompt({ basePlan, scenes: [scene], project, brief }),
      maxOutputTokens: 4000,
    });
    executions.push(execution.result);
    for (const entry of list(execution.output.scenes)) {
      entries.push({
        ...entry,
        scene_id: canonicalShotInventionSceneId(entry?.scene_id, sceneIds),
      });
    }
  }
  const byId = new Map(entries.map((entry)=>[text(entry.scene_id), entry]));
  for (const scene of scenes) {
    const invention = byId.get(text(scene.id));
    if (!invention || !text(invention.invention_thesis) || !list(invention.shot_ideas).length) {
      throw new Error(`TEMPORAL_SHOT_INVENTION_REQUIRED:${text(scene.id)}`);
    }
    for (const [index, idea] of list(invention.shot_ideas).entries()) {
      const requiredFields = [
        "visual_invention", "hero_frame", "graphic_silhouette", "depth_design",
        "material_light_event", "emotional_focal_detail", "camera_concept",
        "anti_game_camera_rule", "why_not_generic",
      ];
      for (const field of requiredFields) {
        if (text(idea?.[field]).length < 20) {
          throw new Error(`TEMPORAL_SHOT_INVENTION_${field.toUpperCase()}_REQUIRED:${text(scene.id)}:${index + 1}`);
        }
      }
    }
  }
  return { map: entries, results: executions };
}

function sceneInvention(inventionMap = [], sceneId = "") {
  return list(inventionMap).find((entry) => text(entry.scene_id) === text(sceneId)) || {};
}

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
      "signature_frame_design": {
        "required": true,
        "hero_frame": "specific release-grade hero image design with subject, composition and decisive visual event",
        "graphic_silhouette": "specific silhouette and large-shape readability design",
        "foreground_midground_background": "specific foreground, midground and background spatial architecture",
        "material_light_event": "specific material behavior and motivated light event",
        "controlled_palette": "specific restrained palette logic and where contrast is permitted",
        "natural_irregularity": "specific physical irregularity that prevents synthetic perfection",
        "atmosphere_physics": "specific atmospheric depth, particulate, humidity, haze or environmental physics",
        "optical_character": "specific lens, focus, halation, flare, distortion or optical behavior",
        "performance_microtruth": "specific human or environmental micro-behavior that makes the frame feel observed rather than posed",
        "fear_or_desire_focus": "specific emotional focal tension, desire or vulnerability carried by the frame",
        "anti_game_camera_rule": "specific rule preventing third-person/game-camera composition and synthetic tracking defaults",
        "board_comparison_test": "specific reason this frame would hold up as a premium agency storyboard frame against a world-class commercial reference"
      },
      "source_reinterpretation": {
        "source_role": "specific source/reference authority",
        "preserve": ["exact truth that must remain"],
        "transform": ["specific authored reinterpretation"],
        "forbid": ["specific source-copying or generic substitution"]
      },
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
- When a failure path ends in signature_frame_design, return a complete signature_frame_design object for that exact existing shot with required=true and every canonical validator field: hero_frame, graphic_silhouette, foreground_midground_background, material_light_event, controlled_palette, natural_irregularity, atmosphere_physics, optical_character, performance_microtruth, fear_or_desire_focus, anti_game_camera_rule and board_comparison_test. Each field must be specific and substantial enough to satisfy the premium shot contract; generic cinematic adjectives are invalid.
- When a failure path ends in source_reinterpretation, return a complete source_reinterpretation object for that exact existing shot, preserving supplied truth while explicitly forbidding literal source-background copying and generic substitution.
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
  "mission_authority": {
    "contract": "CREATIVE_PROTECTED_OPENING_AUTHORITY_V1",
    "protected_seconds": 0,
    "opening_direction": "copy exactly from INPUT.protected_opening_authority when present",
    "product_explanation_deferred": false,
    "product_explanation_allowed_from_seconds": 0,
    "creative_constraints": ["copy supplied constraints without weakening them"]
  },
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
    "human_desire": "what a person in this story wants badly enough that the audience can feel it",
    "emotional_contradiction": "two feelings or needs that cannot both be comfortably true",
    "vulnerability_or_risk": "what can be lost, exposed, disappointed or left unresolved on a human level",
    "empathy_path": "how the audience moves from observing the situation to emotionally identifying with it",
    "escalation": "how stakes increase",
    "observable_proof": "what visibly proves the message",
    "turn": "surprise, revelation or consequence",
    "resolution": "earned resolution",
    "call_to_action": "action integrated into resolution, and the form it takes",
    "emotional_arc": "precise emotional progression with at least four distinct felt states and the cause of each transition",
    "emotional_payoff": "the earned feeling at the resolution and why it could not land at the beginning",
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

CREATIVE AUTHORITY ORDER
- Explicit user, mission and brief constraints are immutable and outrank all generated creative choices.
- Preserve any chapter-specific instruction, deferred reveal, geography requirement, mystery/tension requirement, pacing instruction, or explicit prohibition exactly. A generated concept may elaborate these constraints but may never replace, weaken, reorder or explain away them.
- Product-proof strategy is subordinate to chapter/opening authority. If product explanation is explicitly deferred, keep the opening cinematic and non-explanatory for the specified duration and move causal/product proof to later movements.

MANDATORY RULES
- Copy the supplied quality policy exactly.
- creative_review is your own accountable judgement of this direction and is required. dimensions must score every listed review dimension from 0 to 100. rejected_patterns, craft_risks and finishing_requirements each need four or more entries substantial enough to stand alone -- three is the floor below which the plan is invalid, not the standard. weakest_link names the weakest remaining aspect precisely instead of defending it.
- asset_manifest must contain exactly one entry for each id in SUPPLIED ASSET IDS, and no other entries. Copy those ids character for character.
- Every manifest entry except EXCLUDE must list in assignments the id of each deliverable it serves. A REFERENCE asset names the deliverable it informs, not nothing -- an empty assignments array is only valid for EXCLUDE.
- Never invent, guess, reformat or substitute an asset id. An id that is not in SUPPLIED ASSET IDS does not exist.
- Use evidence from asset analysis, rights, consent and restrictions.
- When BRIEF AND RESEARCH contains creative_grounding.benchmark_lab, treat it as mandatory craft intelligence before choosing the governing concept. Apply its transferable principles across narrative, cinematography, editing, sound, humanity, place and production craft, while preserving an original Avantiqo-specific execution. Never copy benchmark shots, scripts, music, branded compositions, characters, logos or distinctive protected expression.
- A premium temporal plan must pass a greatness test in addition to correctness: it needs iconic-frame potential, meaningful scale contrast, human consequence, causal use of place, non-metronomic editorial structure, evolving sound architecture and an earned reveal that does not collapse into generic glowing globes, connected dots, holograms or particles forming a logo.
- If BRIEF AND RESEARCH contains metadata.grounding_reference_authority with subject_claim_authority true, only ids listed there may serve as SUBJECT_REFERENCE, LOCATION_REFERENCE or other real-world subject/geography evidence for that grounded mission. Other project assets are not subject authority merely because they belong to the organization; EXCLUDE them from the grounded subject when irrelevant, or use them only for an independently evidenced role such as BRAND_REFERENCE or AUDIO_REFERENCE.
- Keep role_decisions empty in this base pass; final governed repair owns evidence-backed applicable role decisions after the directed work exists.
- Build a causal story with a beginning, escalation, turn and earned resolution.
- Emotion is causal structure, not an adjective layer. Give the story a concrete human desire, an emotional contradiction, something vulnerable or at risk, a path into empathy, and an earned emotional payoff.
- The emotional arc must contain distinct felt states caused by events in the story. Do not write generic sequences such as curiosity -> awe -> confidence unless each transition names what the audience sees/hears that causes it.
- Do not manufacture melodrama. For business, technology, industrial or investor films, human stakes may be responsibility, uncertainty, pressure, pride, trust, loss of control, relief, belonging, ambition or the consequence of a decision -- but they must be grounded in the mission and evidence.
- If the story can be understood intellectually while leaving the audience emotionally unchanged, it is not finished. Repair it before returning.
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

IMMUTABLE MISSION AUTHORITY
- The supplied mission and brief constraints outrank the generated base-plan concept wherever there is any tension between them.
- Preserve chapter boundaries, deferred reveals, geography/world-scale requirements, mystery/tension requirements, pacing instructions and explicit prohibitions exactly.
- If the opening chapter is explicitly non-explanatory, do not introduce product proof, business-case explanation, UI demonstration or causal operating-mechanism exposition inside that protected opening window. Design scenes that satisfy the mission first; later scenes may carry the proof strategy.
- CUMULATIVE-TIME RULE: compute scene start time as the sum of every prior scene duration. Every scene with start_time < mission_authority.protected_seconds MUST set mission_authority.protected_opening=true and mission_authority.product_explanation_allowed=false. The first scene allowed to set protected_opening=false MUST start at or after mission_authority.protected_seconds. Do not infer protection from scene number.
- The protected block itself must cumulatively cover at least mission_authority.protected_seconds before the first unprotected scene begins. If a protected scene crosses the boundary, keep that entire scene protected rather than revealing early.
- During the protected block, visible business mechanics may create mystery or consequence but may not explain the mechanism. No approval flow, financial-impact explanation, supplier-risk explanation, product UI, Avantiqo naming, or business-context exposition is allowed before the protected window has elapsed.
- The protected block must still feel worldwide: use materially distinct real locations and show infrastructure, technology and people as cinematic story elements rather than generic office coverage.

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
  "emotion": "specific audience emotion and why the scene earns it",
  "emotional_job": "what this scene must make the audience feel differently by the end, and what causes that change",
  "human_stake": "the desire, vulnerability, responsibility, relationship or consequence made tangible in this scene",
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
  "mission_authority": {
    "protected_opening": false,
    "product_explanation_allowed": true,
    "authority_jobs": ["which immutable mission constraints this scene satisfies"]
  },
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
- Every scene must change both story information and, where emotionally relevant, the audience's felt state. A scene that only supplies information or beauty without changing feeling needs a stronger emotional job.
- emotional_job must inherit the master story's human_desire, emotional_contradiction, vulnerability_or_risk, empathy_path and emotional_payoff rather than invent unrelated drama.
- human_stake must be observable through behaviour, consequence, environment, choice, sound or withheld information; never use generic labels such as "humanity", "emotion" or "connection" as substitutes for a stake.
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
${JSON.stringify({ concept: basePlan.concept, story: basePlan.story, visual_world: basePlan.visual_world, deliverables: basePlan.deliverables })}

PROJECT
${JSON.stringify(compactTemporalProject(project))}

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
  visualWorld = {},
  sceneInventionBrief = {},
  sceneIntelligence = {},
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

APPROVED SCENE AUTHORITY
- This SCENE is immutable story authority. Expand it into camera direction; do not rewrite, reinterpret, replace or "improve" its protagonist, location, causal mechanism or world.
- Every shot must visibly remain inside this scene's title, state_change, story_state_after and transition_logic.
- Do not invent an office, manager, dashboard, sensor, hologram, corporate environment, device-driven signal, new protagonist or substitute causal mechanism unless that exact element already exists in SCENE.
- If the approved scene is natural, keep it natural. If it names a leaf, stone/water, child/well, infrastructure awakening or Avantiqo reveal, that exact subject must remain the visible causal anchor.
- A technically complete shot package that changes the story is invalid.

SHOT COUNT: choose it from this scene's action. Permitted ${range.minimum} to ${range.maximum}, reference ${range.preferred}. The reference is not a ceiling. Premium/high-budget work may require many more purposeful shots, inserts, cutaways, VFX plates, reaction beats, macro details and editorial bridges when the story earns them. Never stretch a scene into a few long generations merely to reduce shot count.
${range.maximum === 1 ? "APPROVED RESUME MASTER-BEAT MODE: return exactly ONE complete, richly directed camera beat for this scene. Keep every field concise and executable. Do not add explanatory prose, alternate takes, duplicate evidence, or extra nested detail beyond the required schema. This one master beat will be deterministically expanded into additional camera beats downstream without changing the approved story." : ""}
CADENCE BASIS: ${JSON.stringify(range.cadence_basis || {})}
EXACT SHOT DURATION SUM: ${scene.duration_seconds} seconds
MASTER CONCEPT AND STORY: ${JSON.stringify({ concept: basePlan.concept, story: basePlan.story })}
SELECTED VISUAL WORLD (binding creative authority): ${JSON.stringify(visualWorld)}
ADVISORY TASTE MEMORY (learn from evidence; never copy prior work): ${JSON.stringify(basePlan.taste_memory || {})}
SCENE SHOT-INVENTION BRIEF (preserve the inventions; engineer them, do not flatten them): ${JSON.stringify(sceneInventionBrief)}
SCENE CINEMATIC INTELLIGENCE (binding coverage/edit grammar): ${JSON.stringify(sceneIntelligence)}
MASTER OUTPUT SPEC: ${JSON.stringify(outputSpec)}
PRODUCTION CAPABILITIES YOU MAY PLAN AGAINST: ${JSON.stringify(capabilityPairs)}
AVAILABLE ASSETS: ${JSON.stringify(assets)}
SUPPLIED ASSET IDS (the only ids that exist -- ${assets.length} assets):
${assets.map((asset) => asset.asset_id).join("\n")}

FIRST-PASS QUALITY FLOOR — DESIGN IT RIGHT BEFORE REVIEW
- Do not rely on downstream reviewers to discover weak direction. Before returning this scene, internally reject and rewrite any shot that is generic, redundant, visually static without purpose, weakly connected to the previous/next edit, physically implausible, continuity-ambiguous, emotionally empty, or dependent on the renderer to invent direction.
- Every shot must have a distinct story delta, a visible event/change, an edit reason, explicit continuity anchors, and a sound-picture event or deliberate justified silence.
- Coverage must be editorially useful: establish geography when needed; earn close-ups/inserts; create contrast in size, angle, lens, motion and duration; preserve screen direction/eyelines; provide bridges where an edit would otherwise jump.
- A beautiful isolated image is not enough. The shot must make the sequence stronger before generation begins.
- If a scene needs more coverage to meet this floor, add purposeful shots now. Do not wait for review to tell you coverage is missing.

Every shot must contain:
{
  "id": "stable unique shot id",
  "title": "specific shot title",
  "purpose": "new story information delivered by this shot",
  "first_pass_intent": {
    "story_delta": "the exact new information, feeling or causal change this shot contributes",
    "visible_event": "the observable change between opening and closing frame",
    "edit_reason": "why this shot must exist between the neighboring shots",
    "continuity_anchor": "the exact spatial/identity/product/world fact that may not drift",
    "sound_picture_event": "the exact audible/visual synchronization event or justified silence",
    "predicted_failure": "the most likely way generation would make this shot look generic, synthetic or disconnected and how the direction prevents it"
  },
  "coverage_role": "one exact purposeful coverage role from SCENE CINEMATIC INTELLIGENCE when applicable",
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
  "signature_frame_design": {
    "required": true,
    "hero_frame": "the single frame from this shot that could live in an elite campaign board and still communicate the beat without explanation",
    "graphic_silhouette": "large-shape read at thumbnail distance: subject/environment masses, negative space, horizon/vertical logic and dominant directional energy",
    "foreground_midground_background": "three-layer depth design with explicit occlusion, scale separation and atmospheric hierarchy",
    "material_light_event": "specific physical interaction of light with rain, skin, cloth, bark, metal, glass, water, smoke or another real material that gives the frame tactile authority",
    "controlled_palette": "small intentional palette and where warm/cool, black level, saturation and highlight colour are allowed to live",
    "natural_irregularity": "specific non-repeating imperfections in geometry, spacing, wear, vegetation, weather, surfaces or debris that keep the world from reading as procedurally clean CGI",
    "atmosphere_physics": "how rain, mist, spray, smoke, dust, breath or volumetrics respond to light, distance, motion and occlusion instead of behaving as a decorative overlay",
    "optical_character": "lens perspective, focus falloff, highlight rolloff, motion/shutter character, flare/aberration restraint and exposure behaviour that make the image feel photographed rather than generically rendered",
    "performance_microtruth": "for visible humans, precise involuntary or pressure-driven detail such as breath, eye moisture, jaw tension, wet fabric, asymmetrical posture or fatigue; otherwise state the equivalent physical truth for the hero subject",
    "fear_or_desire_focus": "the exact visible detail the audience reads first and the emotional reason it matters",
    "anti_game_camera_rule": "what prevents third-person videogame framing, generic centered chase coverage or an avatar-running-down-a-path look",
    "board_comparison_test": "why this frame belongs beside the selected visual-world signature images rather than looking like ordinary generated footage"
  },
  "source_reinterpretation": {
    "required": false,
    "mode": "CINEMATIC_REINTERPRETATION|EXACT_ARCHIVAL|SOURCE_FREE",
    "identity_truth": "what exact venue/product/person/world truth must be preserved from source evidence",
    "production_value_transformation": "how lighting, atmosphere, camera, material response, VFX/CGI, depth, motion and finishing elevate the source beyond its capture quality",
    "new_viewpoint_logic": "how a new camera viewpoint is justified by available geometry/continuity evidence, or why the original viewpoint is deliberately retained",
    "vfx_cgi_integration": "what high-end CGI/VFX is physically integrated with the real source world and why it belongs there",
    "consumer_ai_failure_test": "what would make this look like ordinary image-to-video animation and therefore fail",
    "source_frame_is_not_final_frame": true
  },
  "continuity": {
    "identity": "identity anchors",
    "product": "product anchors",
    "location": "location anchors",
    "wardrobe": "wardrobe anchors",
    "screen_direction": "movement and eyeline direction",
    "spatial_geography": "where subjects are in the space"
  },
  "pursuit_spatial_choreography": {
    "target_position": "where the hunted subject is in world space relative to stable landmarks/trees/path",
    "threat_position": "where the drone/pursuer is relative to target and environment",
    "camera_position": "where camera is relative to both target and threat",
    "line_of_action": "dominant movement axis joining target and threat and how this shot sits relative to it",
    "target_heading": "target travel direction through world space",
    "threat_heading": "pursuer travel direction through world space",
    "threat_target_distance": "approximate proximity and whether the gap is opening, closing or held",
    "occlusion_state": "what physically blocks target/threat visibility and how that changes",
    "search_or_attack_vector": "beam/search/attack direction and its relation to target",
    "entry_exit_logic": "which screen edge subject/threat enter and exit and why continuity remains legible",
    "obstacles_and_clearance": ["tree, terrain, branch, wall, vehicle or other obstacle with exact clearance consequence"],
    "axis_break": false,
    "axis_break_motivation": "only if intentionally crossing the action axis: why disorientation helps and how spatial clarity is recovered",
    "cut_spatial_handoff": "what exact spatial relationship the next shot inherits at the cut"
  },
  "pursuit_performance_choreography": {
    "fear_state_before": "observable emotional/physiological state entering the shot, not a generic adjective",
    "trigger_or_threat_read": "what exact sound, beam, drone motion, branch movement or spatial cue the performer perceives",
    "involuntary_reaction": "the reflex before conscious action: eye flick, breath catch, flinch, jaw lock, shoulder recoil, hand tension or freeze",
    "decision_and_intent": "the deliberate choice made after the reflex and what the performer is trying to do next",
    "body_mechanics": "weight transfer, stride, posture, balance, torso/arm behavior and how terrain/obstacles change movement",
    "breath_state": "breathing cadence, interruption, recovery and exertion level",
    "gaze_and_head_behavior": "where eyes/head move, what information they seek and how this affects action",
    "contact_or_obstacle_response": "exact reaction to mud, branches, slope, impact, stumble, duck, grab or near miss",
    "fatigue_state": "current physical load and how it differs from prior shot",
    "micro_behavior_cues": ["specific visible involuntary details that make the performance human and pressured"],
    "fear_state_after": "observable changed state at the end of the shot",
    "next_action_impulse": "what unfinished physical/emotional impulse carries through the cut",
    "physical_carryover": ["breath, mud, wetness, limp, hand pain, torn cloth, posture or other consequence that must persist next shot"]
  },
  "environmental_continuity_state": {
    "wind_direction": "direction and strength inherited from the previous approved state or exact authored change",
    "precipitation_state": "rain/snow intensity, direction, droplet/spray character and any authored change",
    "wetness_state": "surface wetness progression on ground, bark, vehicles, props and architecture",
    "ground_deformation_state": "mud, splash, displaced leaves, broken branches, debris and contact deformation that must persist",
    "footprint_track_state": "visible footprints/tire tracks/disturbance accumulated so far and where they continue",
    "wardrobe_wetness_state": "fabric wetness, dirt, tears, cling and water loading accumulated on performers",
    "atmosphere_density": "fog/mist/smoke density, depth distribution and light-scattering state",
    "practical_light_state": "which practical/search lights are on, their direction and spatial position",
    "lightning_state": "storm phase, last flash/strike consequence and persistent aftereffects",
    "moving_threat_state": "drone/vehicle/pursuer count, position, heading, altitude/distance, search pattern and relation to target",
    "causal_change_from_previous_shot": "what physically changed since the prior shot and why",
    "must_persist_into_next_shot": ["physical state that cannot reset at the cut"]
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
    "render_text_outside_generated_pixels": true,
    "cinematic_motion_events": [{
      "type": "WORLD_SPACE_TYPOGRAPHY|PROCEDURAL_ASSEMBLY|MATERIAL_TRANSFORMATION|LOGO_TRANSFORMATION|PARTICLE_MORPH|TECHNICAL_REVEAL|TRANSITION_PHYSICS|WORLD_SPACE_GRAPHIC",
      "governing_idea": "specific visual proposition that makes this event worth watching",
      "physical_medium": "metal, glass, carbon, cloth, particles, architecture or other concrete medium",
      "camera_relationship": "how camera, parallax, occlusion, scale and focus relate to the event",
      "material_behavior": "observable material state change or physical surface response",
      "transition_causality": "what physically/narratively causes the transformation and what image it creates next",
      "story_function": "why the event exists beyond decoration",
      "primary_mechanic": "non-template physical or procedural mechanism",
      "sound_events": [{"frame": 1, "role": "IMPACT|MECHANICAL_LOCK|MATERIAL_SHIFT|REVEAL|TRANSITION", "physical_source": "exact visual cause", "intensity": 0.8}]
    }]
  },
  "vfx": {
    "effects": [],
    "cleanup": [],
    "compositing": [],
    "intent": "INVISIBLE_CREDIBILITY or THE_IDEA_ITSELF, and what the effect is for"
  },
  "editorial_causality": {
    "cut_motivation": "THREAT|GAZE|IMPACT|MOTION|SOUND|CONCEALMENT|REVEAL|REACTION|MATCH_ACTION|SPATIAL_REORIENTATION|RHYTHM_BREAK|SILENCE",
    "cut_trigger": "the exact visible or audible event that earns the cut out of this shot",
    "information_handoff": "what action, threat, gaze, sound, geometry or emotional information crosses the cut",
    "sound_bridge": "J-cut/L-cut/physical sound lead or why no sound bridge is used",
    "visual_match_or_contrast": "what shape, movement, scale, light, direction or deliberate contrast links the two frames",
    "what_is_withheld": "what the edit deliberately does not reveal yet",
    "what_changes_after_cut": "what audience knowledge, pressure, proximity, emotion, scale or rhythm changes in the next shot"
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
  "generation_strategy": {
    "mode": "CONTROLLED_SINGLE_PASS|SHARED_KEYFRAME_SEQUENCE|MULTIPASS_COMPLEX",
    "shot_independence": "INDEPENDENT|CONTINUITY_LINKED",
    "shared_state_group_id": "scene continuity group or null",
    "keyframe_policy": {},
    "pass_policy": {},
    "candidate_policy": {},
    "provider_policy": {}
  },
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
- Narrative movements, acts and scenes are NOT camera shots. A scene may need several distinct shots to create withholding, contrast, escalation, interruption and payoff; never map one high-level story beat to one stretched generated clip by default.
- SCENE CINEMATIC INTELLIGENCE is binding. For PURSUIT_HUNT or THREAT_SUSPENSE, build a real coverage sequence: atmosphere/geography, emotional face or eyes, body detail such as feet/hands, threat proximity, lateral/oblique action, obstructed/layered viewpoints, silhouettes and impact/reveal inserts as the scene earns them. Do not satisfy a hunt scene with one master running shot plus one reaction close-up.
- ADVISORY TASTE MEMORY is evidence, not a template. Repeated rejection patterns must be explicitly avoided unless the current scene has new evidence that changes the result. Approved examples may calibrate quality but may not be copied in composition, edit, VFX, sound or style.
- Coverage roles are editorial jobs, not a checklist for random inserts. Each role must change audience knowledge, pressure, proximity or emotion and must connect causally to adjacent shots.
- environmental_continuity_state is mandatory for physical shots whenever weather, atmosphere, wetness, ground interaction, practical/search light, lightning or moving threats are visible. Treat cuts as a change of viewpoint, not a reset of physics. Wind cannot flip, rain cannot restart at a different density, mud cannot become clean, footprints cannot vanish, clothing cannot dry, fog cannot randomly respawn, drone search beams cannot teleport and lightning consequences cannot disappear unless an explicit causal change or story-time jump explains it.
- For pursuit scenes, moving_threat_state must preserve the pursuer's spatial lineage across coverage. A drone seen close left of the target cannot become a distant centered drone in the next angle without an authored movement path or elapsed-time explanation.
- pursuit_spatial_choreography is mandatory for every pursuit/hunt shot. Preserve a readable predator-target-camera triangle, a stable line of action, causal proximity change, obstacle/clearance logic and a precise cut handoff. Aggressive cutting is allowed only when spatial geography remains understandable.
- The camera must not accidentally cross the line of action. An intentional axis break is allowed only when axis_break=true, axis_break_motivation explains the dramatic reason, and the sequence includes a recovery cue that re-orients the audience.
- Threat choreography must be predatory rather than decorative. Drones/searchlights should probe, flank, close distance, lose/reacquire, or force the target into choices; they may not merely hover symmetrically around the actor for visual effect.
- pursuit_performance_choreography is mandatory for every human pursuit/hunt shot. Build performance as stimulus -> involuntary reaction -> conscious decision -> physical action -> changed body/emotional state. Do not direct "scared running" as one continuous generic behavior.
- Fear must evolve through observable micro-behavior: breath catches, delayed exhale, eye flicks toward threat, jaw/neck tension, hands protecting face, shoulder compression, hesitation, stumble recovery, altered stride, protective posture, panic suppression or false relief. Choose only details motivated by the exact threat and framing.
- Physical effort accumulates. Breath, fatigue, mud, wet clothing, pain, imbalance, torn fabric and impact consequences may not reset at the cut. If the performer ducks a branch, stumbles, slips or collides, the next shot must inherit the changed gait/posture/attention until recovery is visibly earned.
- Performance inserts must change story pressure. A face close-up must reveal new threat information or a changed internal state; a feet/hands insert must reveal effort, contact, injury, hesitation or survival behavior. Generic reaction shots are forbidden.
- Wetness, dirt, mud, damage, footprints and environmental disturbance accumulate monotonically unless the story explicitly removes them. Use causal_change_from_previous_shot and must_persist_into_next_shot to make this visible to downstream continuity review.
- Build tension through contrast: long/short duration bands, scale changes, angle changes, withheld information, acceleration clusters and at least one hold/release/silence beat where appropriate.
- Every cut must be causally earned. editorial_causality is mandatory for every shot except the final shot in a scene. Name one primary cut motivation and one exact trigger. A new angle by itself is never a reason to cut.
- Use cuts to transfer information: threat movement, gaze, impact, body action, sound, concealment, reveal, reaction, spatial reorientation, rhythm break or silence. The next shot must answer, intensify or deliberately withhold something established by the previous one.
- Aggressive editing is allowed only when the viewer can still reconstruct cause/effect and geography. Fast cutting without a visible/audible handoff is random montage and must be rejected.
- J-cuts and L-cuts are story tools, not decoration. Let rotor tone, breath, thunder, branch impact, footsteps, search-beam hum or sudden silence lead/lag picture only when they pull attention into the next causal beat.
- Prefer hard cuts when they are stronger. Dissolves, morphs, glow/flash transitions and zoom transitions are forbidden unless the story state itself motivates them.
- REVEAL_TRANSFORMATION scenes must be causal, not a chain of unrelated effects. Build visible beats in this order when applicable: CAUSE -> PHYSICAL_CONSEQUENCE -> TRANSFORMATION_PROGRESS -> FORM_SIMPLIFICATION -> BRAND_RESOLUTION. Lightning may trigger the world, but the brand may not simply appear after a flash. Matter, energy, geometry and meaning must transform continuously enough that the final mark feels earned.
- Transformation graphics must have material and spatial continuity. Reject generic electric-brain imagery, floating neural clip-art, random particles, neon-network overlays, arbitrary glow and logo pop-ins. The transformation needs one governing physical mechanism, one controlled palette and one legible silhouette evolution.
- Choose how many shots this scene's story needs within the permitted range, and choose a number you can direct completely. Every shot requires its framing, lens intent, movement, lighting, production design, continuity, opening and closing frames and sound. A shot missing those is not a shot, and more half-specified shots are weaker work than fewer fully directed ones.
- Every shot must add new information and visibly advance this scene's state change.
- CINEMATIC FORM MUST BE DERIVED FROM STORY FUNCTION. Naming or showing the requested noun is never enough. For each shot, choose the spatial form, reveal pattern, camera relationship, depth change, human activation and end-state that best produces the intended emotion and narrative transition. If a stronger approach, reveal, occlusion, parallax move, scale change, entry into a living environment or other physically credible cinematic form would materially improve the story effect, use it or state a specific reason not to.
- LITERAL COVERAGE FAILS PREMIUM DIRECTION. A frame that merely proves “sea”, “office”, “club”, “factory”, “hotel” or another category without creating the intended feeling, transition or payoff is invalid even when technically correct. “Shows the noun but not the feeling” is a planning failure.
- DISTINCTIVENESS IS PART OF STORY TRUTH. If a place, industry or environment could visually be anywhere, the shot may not claim that specific place or industry unless distinctive visible evidence appears. Generic water is not Phuket; a posed team photo is not active accounting; a lounge-like room is not a functioning nightclub.
- REVEAL OVER DESCRIPTION WHEN THE STORY CALLS FOR ARRIVAL, DISCOVERY OR ESCALATION. Prefer an earned change of information over a static establishing view: approach from outside toward inside, shadow toward light, occluded toward revealed, distant scale toward human detail, empty preparation toward populated activity, or another justified progression.
- PREMIUM VALUE TEST: before accepting a planned shot, ask whether the same subject could be filmed in a more emotionally effective and visually expensive way without violating truth. If yes, the weaker form is rejected at planning time rather than left for rendering to rescue.
- Describe opening frame, temporal progression and closing frame precisely.
- Specify camera, lighting, design, performance, continuity, sound, graphics, VFX and transitions.
- The SELECTED VISUAL WORLD and SCENE SHOT-INVENTION BRIEF are upstream creative authority. Technical completeness may refine execution but may not collapse an invented image into ordinary coverage. If the invention names a transformation, designed graphic behavior, impossible-but-executable spatial move, material event, optical behavior or sound-picture event, preserve it visibly and audibly in the executable shot plan.
- A shot is invalid when its strongest description is merely a camera verb (push, pan, orbit, zoom, track, drone) applied to an otherwise ordinary image. The image/design/event is primary; camera behavior serves it.
- Every physical shot must choose an explicit camera.platform and platform_motivation. Use the full professional camera language when story and geography earn it: locked tripod/head, shoulder, handheld, dolly, slider, Steadicam, gimbal, crane/jib, vehicle mount, macro/inspection rig, cable/suspended system, drone, FPV, helicopter/chase platform or another physically plausible platform. Never default a sequence to one camera platform.
- Camera variety is not random spectacle. Change platform, height, distance, optics or movement when the story state, scale, physical action, reveal or emotional proximity changes. Deliberate stillness may be the strongest contrast after kinetic movement.
- Aerial is not synonymous with drone. Choose stabilized aerial, FPV, helicopter/chase or grounded crane/telephoto according to the physical geography and shot purpose.
- Avoid repeated slow push-ins, repeated digital zoom language, repeated eye-level gimbal tracking and repeated orbit moves. If two adjacent shots use similar camera grammar, the second must state why continuity is stronger than contrast.
- If RESEARCH creative_grounding.spatial_path.required is true, preserve its ordered_nodes and directed_edges in the physical camera geography. Aerial/drone shots must populate aerial_cinematography using the existing Studio aerial contract and must move consistently toward the evidence-backed next node/destination; a beautiful view that travels against the grounded route is invalid. Do not create aerial_cinematography for non-aerial shots.
- If a shot makes an audience-facing claim about a named real-world machine, vehicle, product, place, building or other fidelity-sensitive subject, subject_truth.required must be true. Populate exact_subject, exact variant/model/version, at least three defining_visual_features, research source_ids, continuity_constraints and reference_evidence from RESEARCH creative_grounding/reference_candidates. If research does not support those fields, block the shot rather than inventing a generic category lookalike.
- cinematic_beauty_intent.required is true for every physical premium film shot. Composition, lighting, atmosphere, camera placement and emotional charge must be specific to the shot. Beauty is not decoration: it must amplify scale, tension, intimacy, awe or reveal while preserving semantic truth. Flat, merely legible or generic AI coverage is invalid.
- signature_frame_design.required is true for every physical premium film shot. Before camera movement is considered, design one campaign-grade hero frame with a readable graphic silhouette, explicit foreground/midground/background separation, one tactile material-light event, controlled palette, an exact emotional focal detail and a board-comparison test against the selected visual-world signature images.
- Reject third-person videogame language. When a human runs or moves through space, the default may NOT be a centered back view with the camera following directly behind at body height. Earn rear views through obstruction, compression, scale, danger or spatial revelation; otherwise use lateral pursuit, partial profile, low/long-lens compression, foreground wipes, environmental POV, cutaways to feet/hands/face, or another authored angle that changes the audience's knowledge.
- A premium shot must survive as a still frame. If its quality depends entirely on motion, blur, a push-in or an eventual transition, redesign the composition before production.
- SOURCE REINTERPRETATION IS A PREMIUM FILM RULE. When a still image, venue photo, product photo or other real source visually anchors a shot, treat it as identity/world truth, not as the final production value. source_reinterpretation.required must be true and mode must normally be CINEMATIC_REINTERPRETATION. Preserve evidence-backed geometry, layout, identity, materials, signage and distinctive features while redesigning cinematography, motivated light, atmosphere, lensing, depth, motion, material response, VFX/CGI integration, grade and sound-picture energy to reach flagship-film quality. Merely animating the supplied frame with a zoom, parallax, face motion, generic camera drift or stock particles is invalid.
- EXACT_ARCHIVAL is allowed only when the story explicitly needs the original captured frame as documentary evidence. SOURCE_FREE is used only when no visual source anchors the shot.
- A source-conditioned premium shot must state a consumer_ai_failure_test: describe the ordinary one-click/image-to-video result that would be unacceptable. If the intended shot could still be described as that result, redesign it before production.
- High-end CGI/VFX must grow from the physical truth of the subject: glass, metal, liquid, fire, cloth, architecture, machinery, weather, practical light, reflections, particles, impact, scale or another evidence-compatible material/physical behavior. Decorative sci-fi overlays that ignore the real world are not premium reinterpretation.
- The concept declares a signature device. Decide each shot's part in it. "device" states what this shot does that coverage could not, or states that it is deliberately plain and what the plainness sets up. Do not restate the camera movement in "device" -- a push-in is camera behaviour, not a device. Most shots in a good film are plain; the device has to stay legible.
- Graphics and VFX are creative instruments here, not a caption layer and a cleanup pass. If type appears, decide what it does beyond naming things. If an effect appears, say whether it is invisible repair or the idea itself. Both may be empty for a shot that needs neither.
- When graphics are the cinematic event rather than an informational overlay, populate graphics.cinematic_motion_events. Flagship cinematic motion must be world-space and physically authored: procedural geometry, material transformation, technical reveal, particle/mesh morph, exact-logo transformation or transition physics. Generic fade, slide, zoom, glow, light sweep or stock-particle behavior is forbidden as the primary mechanic. Every cinematic motion event must state camera relationship, material behavior, causal transition logic and at least one exact sound-picture event.
- Do not use the devices the concept lists as refused.
- Use only the ids in SUPPLIED ASSET IDS, copied character for character. An asset's payload also carries hashes, file names and technical values; none of those is its id, and a 64-character hash is never an asset id.
- generation_strategy is deterministically finalized by Studio after direction. Do not invent provider/model choices. Think in execution structure only: independent shot, continuity-linked shared-keyframe sequence, or multi-pass complex shot.
- For continuity-linked human/threat sequences, neighboring shots must share approved identity/world state and use closing-to-next-opening handoff rather than independently reinventing the person, forest, pursuer or lighting.
- Complex shots must decompose responsibilities. Do not ask one video generation to solve actor performance + drone choreography + rain/fog + lightning + contact physics + transformation graphics + final optical finishing at once. Use base plate, threat/hero layer, atmosphere, physical interaction, VFX/transformation, composite and QC passes as required.
- Candidate generation is evidence-driven, not shotgun. Generate one candidate first; create alternates only after review failure. Prefer surgical repair when the failure is localized and full regeneration only when the failure is structural.
- Provider/model choice is forbidden in creative direction. The certified service runtime owns provider/model selection and must fail closed when required controls are unsupported.
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

function validateSignatureFrameDesign(shot = {}) {
  const design = object(shot.signature_frame_design);
  const shotId = text(shot.id) || "UNKNOWN";
  if (design.required !== true) {
    throw new Error(`SHOT_SIGNATURE_FRAME_DESIGN_REQUIRED:${shotId}`);
  }
  const required = [
    ["hero_frame", 36],
    ["graphic_silhouette", 28],
    ["foreground_midground_background", 28],
    ["material_light_event", 28],
    ["controlled_palette", 24],
    ["natural_irregularity", 28],
    ["atmosphere_physics", 28],
    ["optical_character", 28],
    ["performance_microtruth", 28],
    ["fear_or_desire_focus", 24],
    ["anti_game_camera_rule", 28],
    ["board_comparison_test", 28],
  ];
  for (const [field, minimum] of required) {
    if (text(design[field]).length < minimum) {
      throw new Error(`SHOT_SIGNATURE_FRAME_${field.toUpperCase()}_REQUIRED:${shotId}`);
    }
  }
  const cameraText = `${text(shot.camera?.framing)} ${text(shot.camera?.movement_path)} ${text(shot.camera?.platform)} ${text(design.hero_frame)}`.toLowerCase();
  const antiGame = text(design.anti_game_camera_rule).toLowerCase();
  if (
    /(?:follow|tracking)\s+(?:directly\s+)?behind|centered\s+(?:rear|back)|third[- ]person/.test(cameraText) &&
    antiGame.length < 40
  ) {
    throw new Error(`SHOT_THIRD_PERSON_GAME_CAMERA_NOT_JUSTIFIED:${shotId}`);
  }
}

function validateSourceReinterpretation(shot = {}) {
  const contract = object(shot.source_reinterpretation);
  if (contract.required !== true) return;
  const shotId = text(shot.id) || "UNKNOWN";
  const mode = text(contract.mode).toUpperCase();
  if (!new Set(["CINEMATIC_REINTERPRETATION", "EXACT_ARCHIVAL", "SOURCE_FREE"]).has(mode)) {
    throw new Error(`SHOT_SOURCE_REINTERPRETATION_MODE_REQUIRED:${shotId}`);
  }
  if (mode === "CINEMATIC_REINTERPRETATION") {
    const required = [
      ["identity_truth", contract.identity_truth],
      ["production_value_transformation", contract.production_value_transformation],
      ["new_viewpoint_logic", contract.new_viewpoint_logic],
      ["vfx_cgi_integration", contract.vfx_cgi_integration],
      ["consumer_ai_failure_test", contract.consumer_ai_failure_test],
    ];
    for (const [field, value] of required) {
      if (text(value).length < 24) {
        throw new Error(`SHOT_SOURCE_REINTERPRETATION_${field.toUpperCase()}_REQUIRED:${shotId}`);
      }
    }
    if (contract.source_frame_is_not_final_frame !== true) {
      throw new Error(`SHOT_SOURCE_REINTERPRETATION_FINAL_FRAME_RULE_REQUIRED:${shotId}`);
    }
    const lazy = `${text(contract.production_value_transformation)} ${text(contract.vfx_cgi_integration)}`.toLowerCase();
    if (/^(?:slow )?(?:zoom|parallax|camera drift)|generic (?:particles|fog|glow)|simple (?:zoom|parallax|relight)/.test(lazy)) {
      throw new Error(`SHOT_SOURCE_REINTERPRETATION_CONSUMER_AI_LEVEL:${shotId}`);
    }
  }
  if (mode === "SOURCE_FREE" && text(shot.primary_source_asset_id)) {
    throw new Error(`SHOT_SOURCE_REINTERPRETATION_SOURCE_FREE_CONFLICT:${shotId}`);
  }
}

function premiumShotContractFailures(shots = [], sceneIndex = 0) {
  const failures = [];
  list(shots).forEach((shot, shotIndex) => {
    for (const [validator, path] of [
      [validateSignatureFrameDesign, "signature_frame_design"],
      [validateSourceReinterpretation, "source_reinterpretation"],
    ]) {
      try {
        validator(shot);
      } catch (error) {
        const message = String(error?.message || error);
        failures.push({
          code: message.split(":")[0] || "TEMPORAL_PREMIUM_SHOT_CONTRACT_INVALID",
          path: `scenes.${sceneIndex}.shots.${shotIndex}.${path}`,
          message,
        });
      }
    }
  });
  return failures;
}

function temporalPremiumContractFailures(plan = {}) {
  return list(plan.scenes).flatMap((scene, sceneIndex) =>
    premiumShotContractFailures(list(scene.shots), sceneIndex),
  );
}

function assertTemporalPremiumContracts(plan = {}) {
  const failures = temporalPremiumContractFailures(plan);
  if (!failures.length) return true;
  const error = new Error(
    `CREATIVE_TEMPORAL_PREMIUM_SHOT_CONTRACT_INVALID:${failures.map((item) => item.code).join(",")}`,
  );
  error.validation = { passed: false, failures };
  throw error;
}

function normalizeShotCompatibility(
  shot = {},
  scene = {},
  { validate_premium_contracts = true } = {},
) {
  const normalizedSignatureFrameDesign = normalizeSignatureFrameDesign(
    shot,
    scene,
    {
      subject: shot.subject,
      action: shot.action,
      performance: shot.performance,
      purpose: shot.purpose,
      camera: object(shot.camera),
      lighting: object(shot.lighting),
      productionDesign: object(shot.production_design),
    },
  );
  const premiumNormalizedShot = {
    ...shot,
    signature_frame_design: normalizedSignatureFrameDesign,
  };
  if (validate_premium_contracts) {
    validateSignatureFrameDesign(premiumNormalizedShot);
    validateSourceReinterpretation(premiumNormalizedShot);
  }
  shot = premiumNormalizedShot;
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
  const generationStrategy = CreativeShotGenerationStrategyRuntime.build({ shot, scene });
  const feasibilityForecast = CreativeShotFeasibilityForecastRuntime.forecast({
    shot: { ...shot, generation_strategy: generationStrategy },
    scene,
  });

  return {
    ...shot,
    generation_strategy: generationStrategy,
    feasibility_forecast: feasibilityForecast,
    generation: {
      ...synchronisedGeneration,
      generation_strategy: generationStrategy,
      provider: null,
      model: null,
      feasibility_forecast: feasibilityForecast,
    },
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
    cinematic_motion_design: {
      flagship: true,
      events: list(graphics.cinematic_motion_events),
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
    let studioLearning = null;
    try {
      studioLearning = await CreativeStudioLearningRuntime.resolve({
        organization_id,
        creative_project_id: project.id,
        brand_id: project.brand_id || null,
        campaign_id: project.campaign_id || null,
      });
    } catch {
      studioLearning = null;
    }
    const tasteMemory = CreativeTemporalTasteMemoryRuntime.build({
      learning: studioLearning || {},
    });
    const finishingIntelligence = CreativeFinishingIntelligenceRuntime.build({
      taste_memory: tasteMemory,
    });
    const temporalConsistencyIntelligence = CreativeTemporalConsistencyIntelligenceRuntime.build({
      taste_memory: tasteMemory,
    });

    const promptMission = creativeMissionPromptSnapshot(mission);
    const promptProject = creativeProjectPromptSnapshot(project);
    const promptBrief = creativeBriefPromptSnapshot(brief);
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
      approvedPlan = normalizeTemporalQualityContract(
        normalizeTemporalMechanicalContract(approvedPlan, {
          duration_seconds: duration,
          assets: normalizedAssets,
        }),
      );
      const validation = assertCreativeMasterPlan({
        plan: approvedPlan,
        assets: normalizedAssets,
      });
      return {
        plan: {
          ...approvedPlan,
          taste_memory: tasteMemory,
          finishing_intelligence: finishingIntelligence,
          temporal_consistency_intelligence: temporalConsistencyIntelligence,
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
        taste_memory: tasteMemory,
      };
    } else {
      const baseInput = {
        mission: promptMission,
        project: promptProject,
        brief: promptBrief,
        protected_opening_authority: protectedOpeningAuthority({ mission, project, brief }),
        assets: normalizedAssets.map(temporalBaseAssetEvidence),
        duration,
        duration_mode: audioContract.mode,
        exact_duration_required: true,
        audio_contract: audioContract,
        quality_policy: qualityPolicy,
        taste_memory: tasteMemory,
        finishing_intelligence: finishingIntelligence,
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
        mission_authority: baseInput.protected_opening_authority,
        scenes: [],
        quality: qualityPolicy,
        taste_memory: tasteMemory,
      };
    }

    if (!text(basePlan.visual_world?.name)) {
      const visualDevelopment = await developVisualWorld({
        organization_id,
        missionId,
        projectId: project.id,
        basePlan,
        project: promptProject,
        brief,
        assets: normalizedAssets.map(temporalBaseAssetEvidence),
      });
      executions.push(...visualDevelopment.results);
      basePlan = {
        ...basePlan,
        visual_world: visualDevelopment.world,
      };
    }

    let scenes = tribunalSeeded
      ? deterministicSceneArchitectureFallback({ basePlan, duration })
      : [];
    let architectureFailure = "";
    for (
      let attempt = 1;
      !tribunalSeeded && attempt <= MAXIMUM_SCENE_ARCHITECTURE_ATTEMPTS;
      attempt += 1
    ) {
      let architectureExecution;
      try {
        architectureExecution = await executeReasoning({
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
            brief: promptBrief,
            audioContract,
            retryReason: architectureFailure,
          }),
          maxOutputTokens: 7000,
          serviceId: "ai.text.generate",
        });
      } catch (error) {
        architectureFailure = `architecture execution failed on attempt ${attempt}: ${text(error?.message) || "UNKNOWN"}`;
        scenes = [];
        continue;
      }
      executions.push(architectureExecution.result);
      scenes = ensureStableIds(architectureExecution.output.scenes, "scene");
      if (!scenes.length) {
        architectureFailure = "the response did not contain a non-empty scenes array";
        continue;
      }
      const authoredDuration = scenes.reduce(
        (sum, scene) => sum + Math.max(0, Number(scene?.duration_seconds || 0)),
        0,
      );
      const authorityCandidate = Math.abs(authoredDuration - duration) <= 0.001
        ? scenes
        : allocateDurations(scenes, duration, 0.5);
      const authorityFailures = protectedOpeningSceneFailures(
        authorityCandidate,
        basePlan.mission_authority,
      );
      if (authorityFailures.length) {
        architectureFailure = `protected opening authority failed: ${authorityFailures.join("; ")}`;
        scenes = [];
        continue;
      }
      scenes = authorityCandidate;
      break;
    }
    if (!scenes.length) {
      scenes = deterministicSceneArchitectureFallback({ basePlan, duration });
      const fallbackFailures = protectedOpeningSceneFailures(
        scenes,
        basePlan.mission_authority,
      );
      if (fallbackFailures.length) {
        throw new Error(
          `CREATIVE_TEMPORAL_SCENE_ARCHITECTURE_REQUIRED:${MAXIMUM_SCENE_ARCHITECTURE_ATTEMPTS}_ATTEMPTS:${fallbackFailures.join(";")}`,
        );
      }
      basePlan = {
        ...basePlan,
        scene_architecture_fallback: {
          contract: "CREATIVE_TEMPORAL_SCENE_ARCHITECTURE_FALLBACK_V1",
          activated_after_attempts: MAXIMUM_SCENE_ARCHITECTURE_ATTEMPTS,
          prior_failure: architectureFailure || null,
          deterministic: true,
          approved_story_preserved: true,
        },
      };
    }
    const authoredSceneDuration = scenes.reduce(
      (sum, scene) => sum + Math.max(0, Number(scene?.duration_seconds || 0)),
      0,
    );
    scenes = Math.abs(authoredSceneDuration - duration) <= 0.001
      ? scenes
      : allocateDurations(scenes, duration, 0.5);

    const shotInvention = await createShotInventionMap({
      organization_id,
      missionId,
      projectId: project.id,
      basePlan,
      scenes,
      project: promptProject,
      brief,
    });
    executions.push(...shotInvention.results);
    const shotInventionMap = shotInvention.map;

    const outputSpec = object(list(basePlan.deliverables)[0]?.output_spec);

    function deterministicApprovedMasterBeat(scene, sceneIndex) {
      const durationSeconds = Math.max(0.5, Number(scene.duration_seconds) || 0.5);
      const videoPair =
        capabilityPairs.find((pair) => pair.capability === "ai.video.generate") ||
        capabilityPairs.find((pair) => pair.capability === "ai.video.image_to_video") ||
        capabilityPairs.find((pair) => String(pair.capability || "").includes("video")) ||
        capabilityPairs[0];
      const isFinalScene = sceneIndex === scenes.length - 1;
      const tension = object(scene.tension);
      return normalizeShotExecutionContract({
        id: `${scene.id || `scene-${sceneIndex + 1}`}-master`,
        title: `${scene.title || `Scene ${sceneIndex + 1}`} — master camera beat`,
        purpose: `Execute the approved scene objective as one coherent master beat before cadence expansion: ${text(scene.objective) || text(scene.state_change) || "advance the approved story"}.`,
        first_pass_intent: {
          story_delta: `Make the approved scene state change visible before any cadence expansion: ${text(scene.state_change) || text(scene.story_state_after) || "the human-system relationship changes"}.`,
          visible_event: `The subject begins in ${text(scene.story_state_before) || "the prior state"} and ends in ${text(scene.story_state_after) || "a visibly changed state"} through one observable causal action.`,
          edit_reason: `This master beat establishes the scene's complete causal spine so deterministic coverage expansion can split cause, reaction and consequence without inventing a new story.`,
          continuity_anchor: `Preserve the same principal identity, wardrobe, established location geography, eyeline and physical object positions throughout this scene.`,
          sound_picture_event: `Tie the decisive visible state change to a motivated breath, cloth, room, object or system sound; use silence only when withholding increases the scene pressure.`,
          predicted_failure: `Reject generic office montage, posed performance, floating camera, identity drift, decorative interface spectacle and any shot that fails to show the approved causal change.`,
        },
        device: `Carry the approved visual idea through restrained physical behavior and environmental response; ${isFinalScene ? "the Avantiqo reveal is earned only after the human state change is legible." : "withhold full brand explanation until the story earns it."}`,
        subject: "The same principal manager inside the established Avantiqo operations environment.",
        action: `The manager performs the scene's approved causal change: ${text(scene.state_change) || text(scene.story_state_after) || "her behavior visibly changes the relationship between human and system"}.`,
        performance: `Performance moves from ${text(scene.story_state_before) || "the prior emotional state"} to ${text(scene.story_state_after) || "a changed human state"} through eye focus, breath, hand position and timing rather than exaggerated acting.`,
        duration_seconds: durationSeconds,
        medium: "generated-video",
        frame_plan: {
          opening_frame: `Open with the manager and environment clearly anchored in the scene's starting state: ${text(scene.story_state_before) || "controlled routine before the causal change"}.`,
          progression: `Over the full beat, the approved action unfolds visibly and causally: ${text(scene.state_change) || text(scene.objective) || "human agency changes the situation"}. Camera and focus react only when new story information appears.`,
          closing_frame: `End on a materially changed visual state that proves the scene consequence: ${text(scene.story_state_after) || "the next scene now has a different truth to inherit"}.`,
        },
        camera: {
          platform: "tripod with optional short dolly adjustment",
          platform_motivation: "A physically stable observational platform keeps the human performance credible while allowing one motivated spatial adjustment when the scene state changes.",
          framing: "human-scale medium coverage that preserves face, hands, device context and negative space",
          angle: "restrained eye-level observational angle with slight three-quarter offset",
          camera_distance: "close enough to read micro-performance while retaining environmental context",
          lens_intent: "natural perspective with selective depth so attention can move between system evidence and the manager",
          movement_path: "begin locked, then permit one short motivated drift or dolly only after the causal turn",
          movement_speed: "very slow acceleration and stop, subordinate to performance timing",
          stabilization: "physically stable support with no synthetic floating or impossible motion",
          movement_motivation: "camera movement occurs only when the human decision changes what the audience needs to notice",
          focus_target: "eyes",
          focus_transition: "shift from operational evidence back to the manager only when her reaction becomes the new story information",
        },
        lighting: {
          source: "motivated practical office sources plus soft environmental key",
          direction: "side-biased light preserving facial shape, desk geometry and separation from the background",
          contrast: "controlled cinematic contrast with readable shadow detail",
          colour: "restrained neutral-warm skin against cooler operational ambience",
          exposure_intent: "protect skin and practical highlights while allowing nonessential background detail to fall away",
        },
        production_design: {
          environment: "credible contemporary operations space with real work surfaces, restrained technology and no science-fiction spectacle",
          wardrobe: "consistent understated professional wardrobe maintained across every scene",
          props: "only task-relevant desk, device, document and work objects that support the visible decision",
          materials: "matte glass, metal, fabric and lived work surfaces with physically plausible reflections",
          texture_detail: "fingerprints, fabric weave, subtle wear and surface variation prevent synthetic showroom perfection",
        },
        subject_truth: {
          required: false,
          exact_subject: "fictional principal manager",
          variant: "same fictional manager across the complete film",
          defining_visual_features: ["consistent face", "consistent professional wardrobe", "consistent human-scale performance"],
          source_ids: [],
          continuity_constraints: ["identity does not drift", "wardrobe remains consistent", "age and proportions remain stable"],
        },
        reference_evidence: [],
        cinematic_beauty_intent: {
          required: true,
          composition: "Use controlled negative space and layered foreground/background geometry so human presence remains the strongest visual anchor.",
          lighting: "Motivated practical light shapes the face and work surfaces without glossy advertising over-lighting.",
          atmosphere: "Subtle air depth and real material response create tactile realism without decorative particles.",
          camera_placement: "Place the camera at human eye level and working distance so scale feels inhabited rather than staged.",
          emotional_charge: `The image should make the audience feel ${text(scene.emotion) || "the scene's changing tension"} through behavior and spatial restraint rather than visual excess.`,
        },
        continuity: {
          identity: "same principal manager identity, face, hair and physical proportions",
          product: "same Avantiqo system context whenever technology is visible",
          location: "preserve established room geography and material palette across adjacent coverage",
          wardrobe: "same wardrobe state and accessories unless the approved story explicitly changes them",
          screen_direction: "preserve established eyeline and left-right orientation",
          spatial_geography: "desk, manager, screens and practical lights retain consistent relative positions",
        },
        dialogue: [],
        narration: {},
        audio: {
          source_sound: "physically motivated room tone, breath, cloth movement and subtle device sounds",
          sound_effects: [],
          music: {},
          silence: "use deliberate reductions in sound pressure whenever the human decision needs space",
          mix_intent: "prioritize human-scale detail and causal pressure changes over decorative cinematic noise",
          sync_events: [{
            at_seconds: Number(Math.min(Math.max(durationSeconds * 0.45, 0), Math.max(durationSeconds - 0.05, 0)).toFixed(3)),
            event: "one subtle physically motivated sound marks the scene's causal turn",
            priority: "FOREGROUND",
          }],
          spatial_field: "human detail remains center-focused while the operational room tone carries restrained stereo width and depth",
        },
        music: {},
        sound_effects: [],
        sound_design: {},
        graphics: {
          titles: isFinalScene ? [{ content: "Avantiqo" }] : [],
          subtitles: [],
          logo: isFinalScene ? { content: "Avantiqo", final_composite_only: true } : {},
          overlays: [],
          type_behaviour: isFinalScene
            ? "The Avantiqo identity appears only after the human payoff is legible, held simply with no generated-pixel typography."
            : "No explanatory type; preserve story withholding.",
          render_text_outside_generated_pixels: true,
        },
        vfx: {
          effects: [],
          cleanup: [],
          compositing: [],
          intent: "INVISIBLE_CREDIBILITY",
        },
        transition_in: sceneIndex === 0
          ? "Begin from black with sound arriving only when the first physical detail becomes legible."
          : "Enter on a matched causal detail or motivated sound inherited from the previous scene.",
        transition_out: isFinalScene
          ? "Hold the earned Avantiqo reveal briefly, then finish without an additional sales message."
          : "Leave only after the state change creates the next unresolved question.",
        primary_source_asset_id: null,
        reference_assets: [],
        reference_asset_ids: [],
        negative_constraints: [
          "No generic AI holograms, random global montage, identity drift, impossible camera movement or decorative interface spectacle.",
        ],
        known_failure_modes: [
          "The human decision may read as posing rather than causally changing the scene; preserve micro-behavior, timing and eyeline continuity.",
        ],
        repair_instructions: [
          "If the beat is unclear, strengthen the visible cause-and-effect action without changing the approved story or adding explanatory UI.",
        ],
        energy_level: Number.isFinite(Number(tension.pressure_after))
          ? Math.max(0, Math.min(100, Number(tension.pressure_after)))
          : 40,
        tempo_role: isFinalScene ? "RELEASE" : sceneIndex === 2 ? "PEAK" : sceneIndex === 0 ? "HOLD" : "BUILD",
        tension: {
          pressure_before: Number(tension.pressure_before || 20),
          pressure_after: Number(tension.pressure_after || 40),
          audience_question: text(tension.audience_question) || "What changes when the human stops behaving as the system expects?",
          withheld_information: text(tension.withheld_information) || "The full meaning and identity of the system remain withheld until the human consequence is understood.",
          reveal_state: text(tension.reveal_state) || (isFinalScene ? "RELEASE" : "WITHHELD"),
          visual_density: Number(tension.visual_density || 35),
          sonic_pressure: Number(tension.sonic_pressure || 35),
          micro_payoff: text(tension.payoff) || text(scene.story_state_after) || "The scene ends in a visibly changed human-system relationship.",
          next_pressure_hook: isFinalScene
            ? "The film ends on recognition rather than another escalation."
            : text(scene.transition_logic) || "The changed state creates the question the next scene must answer.",
        },
        generation: {
          required: true,
          service: videoPair.service,
          capability: videoPair.capability,
          output_spec: {
            duration_seconds: durationSeconds,
            aspect_ratio: text(outputSpec.aspect_ratio) || "16:9",
            resolution: text(outputSpec.resolution) || "1920x1080",
            frame_rate: Number(outputSpec.frame_rate) || 24,
          },
        },
      }, scene, 0);
    }

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
      const shotRange = shotCountRange(scene.duration_seconds, { scene, plan: basePlan });
      const sceneIntelligence = CreativeTemporalCinematicIntelligenceRuntime.buildCoverageIntelligence({
        scene,
        plan: basePlan,
      });
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
              visualWorld: object(basePlan.visual_world),
              sceneInventionBrief: sceneInvention(shotInventionMap, scene.id),
              sceneIntelligence,
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
            .map((shot) => normalizeShotCompatibility(
              shot,
              scene,
              { validate_premium_contracts: false },
            ));
          outstandingFailures = creativeTemporalSceneShotFailures({
            shots: candidate,
            sceneIndex,
            quality: qualityPolicy,
            assets: normalizedAssets,
            approved_scene: tribunalSeeded ? scene : null,
          });
          outstandingFailures.push(
            ...premiumShotContractFailures(candidate, sceneIndex),
          );
          const sequenceIntelligence = CreativeTemporalCinematicIntelligenceRuntime.evaluateSequence({
            scene,
            shots: candidate,
            plan: basePlan,
          });
          outstandingFailures.push(...sequenceIntelligence.failures.map((failure) => ({
            ...failure,
            path: `scenes.${sceneIndex}.${failure.path}`,
          })));
          candidate.forEach((shot, shotIndex) => {
            const forecast = object(shot.feasibility_forecast);
            if (forecast.readiness === "REDESIGN_REQUIRED") {
              outstandingFailures.push({
                code: "SHOT_FEASIBILITY_REDESIGN_REQUIRED",
                path: `scenes.${sceneIndex}.shots.${shotIndex}.feasibility_forecast`,
                message: forecast.required_action || "Shot must be redesigned or split before paid generation.",
              });
            }
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
          cinematic_intelligence: sceneIntelligence,
          audio_dramaturgy: CreativeTemporalCinematicIntelligenceRuntime.buildAudioDramaturgy({
            scene,
            shots,
            plan: basePlan,
          }),
          shots,
        },
      };
    }

    const planned = [];
    const sceneShotConcurrency = ["1", "true", "yes", "on"].includes(
      String(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED || "").trim().toLowerCase(),
    ) ? 1 : SCENE_SHOT_CONCURRENCY;
    for (let offset = 0; offset < scenes.length; offset += sceneShotConcurrency) {
      const wave = scenes
        .slice(offset, offset + sceneShotConcurrency)
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
      visual_world: object(basePlan.visual_world),
      shot_invention_map: shotInventionMap,
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
        assertTemporalPremiumContracts(plan);
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
        const mergedRepair = preserveTemporalStructuralIds(
          plan,
          mergeCreativeRepairedPlan(plan, normalizedRepair),
        );
        const candidate = scrubUnknownTemporalAssetReferences(
          normalizeTemporalQualityContract(
            normalizeTemporalMechanicalContract(
              mergedRepair,
              { duration_seconds: duration, assets: normalizedAssets },
            ),
          ),
          normalizedAssets,
        );
        try {
          assertTemporalPremiumContracts(candidate);
          assertCreativeMasterPlan({ plan: candidate, assets: normalizedAssets });
          plan = candidate;
        } catch (candidateError) {
          const beforeFailures = repairFailureCount(validationError);
          const afterFailures = repairFailureCount(candidateError);
          const introducedFailures = introducedRepairFailures(validationError, candidateError);
          if (afterFailures < beforeFailures && introducedFailures.length === 0) {
            plan = candidate;
            consecutiveNoProgressRepairs = 0;
            rejectedRepairs.push({
              attempt: plannedRepairs,
              partial_repair_accepted: true,
              failures_before: beforeFailures,
              failures_after: afterFailures,
              introduced_failures: [],
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
