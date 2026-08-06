import crypto from "node:crypto";

import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.evidence-narrative-craft.v2",
);

const EVIDENCE_DIRECTION_CONTRACTS = new Set([
  "CREATIVE_EVIDENCE_CONSTRAINED_DIRECTION_V1",
  "CREATIVE_EVIDENCE_CONSTRAINED_DIRECTION_V2",
]);

const SOURCE_EVIDENCE_CONTRACTS = new Set([
  "CREATIVE_SOURCE_SHOT_EVIDENCE_V3",
  "CREATIVE_SOURCE_SHOT_EVIDENCE_V4",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function storyAuthoritySnapshot(plan = {}) {
  return {
    concept: object(plan.concept),
    strategy: object(plan.strategy),
    story: object(plan.story),
    story_architecture: object(plan.story_architecture),
    selected_concept_id: plan.selected_concept_id || null,
    concept_council: object(plan.concept_council),
    scenes: list(plan.scenes).map((scene) => ({
      id: scene.id || null,
      title: scene.title || null,
      purpose: scene.purpose || null,
      intent: scene.intent || null,
      objective: scene.objective || null,
      story_function: scene.story_function || null,
      narrative_function: scene.narrative_function || null,
      summary: scene.summary || null,
      description: scene.description || null,
      story_state_before: scene.story_state_before || null,
      state_change: scene.state_change || null,
      story_state_after: scene.story_state_after || null,
      transition_logic: scene.transition_logic || null,
      shots: list(scene.shots).map((shot) => ({
        id: shot.id || null,
        title: shot.title || null,
        purpose: shot.purpose || null,
        intent: shot.intent || null,
        story_function: shot.story_function || null,
        narrative_function: shot.narrative_function || null,
        subject: shot.subject || null,
        action: shot.action || null,
        performance: shot.performance || null,
        description: shot.description || null,
        direction: shot.direction || null,
        visual_direction: shot.visual_direction || null,
        opening_frame: shot.opening_frame || null,
        closing_frame: shot.closing_frame || null,
        frame_plan: shot.frame_plan || null,
        camera: shot.camera || null,
        transition_in: shot.transition_in || null,
        transition_out: shot.transition_out || null,
        primary_source_asset_id:
          shot.primary_source_asset_id ||
          shot.primarySourceAssetId ||
          shot.generation?.primary_source_asset_id ||
          shot.generation?.primarySourceAssetId ||
          null,
      })),
    })),
  };
}

function isEligible(plan = {}) {
  const evidence = object(plan.metadata?.evidence_constrained_direction);
  const sourceGate = object(plan.validation?.source_shot_evidence);
  const evidenceContract = text(evidence.contract).toUpperCase();
  const sourceContract = text(sourceGate.contract).toUpperCase();
  return Boolean(
    EVIDENCE_DIRECTION_CONTRACTS.has(evidenceContract) &&
    SOURCE_EVIDENCE_CONTRACTS.has(sourceContract) &&
    text(sourceGate.readiness).toUpperCase() === "PASS" &&
    Number(sourceGate.shot_count) > 0 &&
    Number(sourceGate.passed_shot_count) === Number(sourceGate.shot_count) &&
    Number(sourceGate.failed_shot_count) === 0
  );
}

function hasNarrativeFunction(value = {}) {
  return Boolean(
    text(value.purpose) ||
    text(value.intent) ||
    text(value.objective) ||
    text(value.story_function) ||
    text(value.narrative_function) ||
    text(value.summary) ||
    text(value.description),
  );
}

function hasFrameProgression(shot = {}) {
  const framePlan = object(shot.frame_plan);
  return Boolean(
    text(shot.opening_frame?.description || shot.opening_frame) &&
    text(shot.closing_frame?.description || shot.closing_frame) &&
    (
      text(framePlan.progression) ||
      list(framePlan.progression_frames).length ||
      text(shot.action)
    ),
  );
}

function cameraSignature(shot = {}) {
  const camera = object(shot.camera);
  const signature = [
    camera.shot_size,
    camera.framing,
    camera.lens,
    camera.movement_path,
    camera.movement,
    camera.focus_target,
  ].map(text).filter(Boolean);
  return signature.length ? signature.join("|").toLowerCase() : null;
}

function titleCount(values = []) {
  return new Set(values.map((value) => text(value).toLowerCase()).filter(Boolean)).size;
}

function evaluateExistingCraft(plan = {}) {
  const scenes = list(plan.scenes);
  const shots = scenes.flatMap((scene) => list(scene.shots));
  const sceneNarrativeCount = scenes.filter(hasNarrativeFunction).length;
  const shotNarrativeCount = shots.filter(hasNarrativeFunction).length;
  const frameProgressionCount = shots.filter(hasFrameProgression).length;
  const cameraSignatures = shots.map(cameraSignature).filter(Boolean);

  return {
    scene_count: scenes.length,
    shot_count: shots.length,
    scene_narrative_function_count: sceneNarrativeCount,
    shot_narrative_function_count: shotNarrativeCount,
    frame_progression_count: frameProgressionCount,
    distinct_scene_title_count: titleCount(scenes.map((scene) => scene.title)),
    distinct_shot_title_count: titleCount(shots.map((shot) => shot.title)),
    distinct_camera_signature_count: new Set(cameraSignatures).size,
    scene_narrative_coverage: scenes.length
      ? Number((sceneNarrativeCount / scenes.length).toFixed(4))
      : 0,
    shot_narrative_coverage: shots.length
      ? Number((shotNarrativeCount / shots.length).toFixed(4))
      : 0,
    frame_progression_coverage: shots.length
      ? Number((frameProgressionCount / shots.length).toFixed(4))
      : 0,
  };
}

export function craftEvidenceConstrainedNarrative(plan = {}) {
  const authorityBefore = digest(storyAuthoritySnapshot(plan));
  const eligible = isEligible(plan);
  const craft = evaluateExistingCraft(plan);
  const authorityAfter = digest(storyAuthoritySnapshot(plan));
  const unchanged = authorityBefore === authorityAfter;

  if (!unchanged) {
    throw new Error(
      `CREATIVE_EVIDENCE_NARRATIVE_CRAFT_STORY_AUTHORITY_CHANGED:${authorityBefore}:${authorityAfter}`,
    );
  }

  return {
    plan,
    evidence: {
      contract: "CREATIVE_EVIDENCE_NARRATIVE_CRAFT_V2",
      applied: eligible,
      mode: eligible
        ? "VALIDATE_APPROVED_EVIDENCE_CONSTRAINED_CRAFT"
        : "PASS_THROUGH_INELIGIBLE_PLAN",
      reason: eligible
        ? null
        : "EVIDENCE_CONSTRAINED_SOURCE_SHOT_GATE_REQUIRED",
      ...craft,
      story_authority_hash_before: authorityBefore,
      story_authority_hash_after: authorityAfter,
      story_authority_unchanged: unchanged,
      transformation_executed: false,
      scene_rewrite_executed: false,
      shot_rewrite_executed: false,
      concept_rewrite_executed: false,
      campaign_copy_injected: false,
      fixed_narrative_template_used: false,
      fixed_business_taxonomy_used: false,
      organization_specific_copy_used: false,
      source_bindings_changed: false,
      timing_changed: false,
      provider_calls_executed: false,
      physical_content_invention_allowed: false,
    },
  };
}

function install() {
  if (CreativeUniversalTemporalDirectionRuntime[INSTALL_FLAG]) return;
  const createWithoutNarrativeCraft =
    CreativeUniversalTemporalDirectionRuntime.create.bind(
      CreativeUniversalTemporalDirectionRuntime,
    );

  Object.defineProperty(
    CreativeUniversalTemporalDirectionRuntime,
    INSTALL_FLAG,
    { value: true, enumerable: false, configurable: false },
  );

  CreativeUniversalTemporalDirectionRuntime.create =
    async function createWithEvidenceNarrativeCraft(input = {}) {
      const result = await createWithoutNarrativeCraft(input);
      if (!result?.plan) return result;
      const crafted = craftEvidenceConstrainedNarrative(result.plan);
      console.log(
        `CREATIVE_EVIDENCE_NARRATIVE_CRAFT=${JSON.stringify(crafted.evidence)}`,
      );
      return {
        ...result,
        plan: crafted.plan,
        evidence_narrative_craft: crafted.evidence,
      };
    };
}

install();

export const CreativeEvidenceNarrativeCraftRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_EVIDENCE_NARRATIVE_CRAFT_V2",
  craft: craftEvidenceConstrainedNarrative,
});
