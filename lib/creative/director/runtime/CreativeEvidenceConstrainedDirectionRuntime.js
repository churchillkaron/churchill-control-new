import crypto from "node:crypto";

import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  sanitizeCreativePromptlessDirectionSpec,
} from "./CreativePromptlessDirectionSpecRuntime";
import {
  evaluateCreativeSourceShotEvidence,
} from "@/lib/creative/assets/intelligence/runtime/CreativeSourceShotEvidenceRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.evidence-constrained-direction.v2",
);
const MINIMUM_CONFIDENCE = 60;

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

function unique(values = []) {
  const output = [];
  const seen = new Set();
  for (const value of list(values).flat(Infinity)) {
    const rendered = text(value);
    const key = rendered.toLowerCase();
    if (!rendered || seen.has(key)) continue;
    seen.add(key);
    output.push(rendered);
  }
  return output;
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

function assetId(value) {
  if (typeof value === "string" || typeof value === "number") {
    return text(value);
  }
  return text(
    value?.asset_id ||
      value?.assetId ||
      value?.creative_asset_id ||
      value?.creativeAssetId ||
      value?.id,
  );
}

function primarySourceId(shot = {}) {
  return text(
    shot.primary_source_asset_id ||
      shot.primarySourceAssetId ||
      shot.generation?.primary_source_asset_id ||
      shot.generation?.primarySourceAssetId ||
      shot.metadata?.primary_source_asset_id ||
      shot.metadata?.primarySourceAssetId,
  );
}

function sourceAssetIds(plan = {}) {
  const ids = [];
  for (const scene of list(plan.scenes)) {
    for (const shot of list(scene.shots)) {
      ids.push(
        primarySourceId(shot),
        list(shot.reference_asset_ids),
        list(shot.referenceAssetIds),
        list(shot.identity_requirements?.reference_asset_ids),
        list(shot.identity_requirements?.referenceAssetIds),
      );
    }
  }
  return [...new Set(ids.flat(Infinity).map(assetId).filter(Boolean))];
}

function sourceBinding(shot = {}, sourceId) {
  const references = list(shot.reference_assets);
  const hasPrimary = references.some((reference) =>
    text(reference?.role).toUpperCase() === "PRIMARY_SOURCE" &&
      assetId(reference) === sourceId);
  return hasPrimary
    ? references
    : [
        {
          asset_id: sourceId,
          role: "PRIMARY_SOURCE",
          required: true,
          source_binding_contract: "VERIFIED_SOURCE_EVIDENCE_V2",
        },
        ...references.filter((reference) => assetId(reference) !== sourceId),
      ];
}

function storyAuthoritySnapshot(plan = {}) {
  return {
    concept: object(plan.concept),
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
        opening_frame: shot.opening_frame || null,
        closing_frame: shot.closing_frame || null,
        frame_plan: shot.frame_plan || null,
        transition_in: shot.transition_in || null,
        transition_out: shot.transition_out || null,
      })),
    })),
  };
}

function sourceBoundGeneration(shot = {}, sourceId) {
  const generation = object(shot.generation);
  return {
    ...generation,
    primary_source_asset_id: sourceId,
    source_binding_contract: "VERIFIED_SOURCE_EVIDENCE_V2",
    instruction: undefined,
    instructions: undefined,
    prompt: undefined,
    provider_prompt: undefined,
    visual_prompt: undefined,
    video_prompt: undefined,
    negative_prompt: undefined,
    change_constraints: {
      ...object(generation.change_constraints),
      preserve_source_geometry: true,
      preserve_visible_identity: true,
      preserve_visible_objects: true,
      introduce_new_physical_content: false,
    },
  };
}

function constrainShot(shot = {}) {
  const sourceId = primarySourceId(shot);
  if (!sourceId) {
    throw new Error(
      `EVIDENCE_CONSTRAINED_DIRECTION_PRIMARY_SOURCE_REQUIRED:${text(shot.id)}`,
    );
  }
  return {
    ...object(shot),
    primary_source_asset_id: sourceId,
    reference_asset_ids: unique([
      sourceId,
      list(shot.reference_asset_ids).map(assetId),
      list(shot.referenceAssetIds).map(assetId),
    ]),
    reference_assets: sourceBinding(shot, sourceId),
    generation: sourceBoundGeneration(shot, sourceId),
    metadata: {
      ...object(shot.metadata),
      primary_source_asset_id: sourceId,
      source_binding_contract: "VERIFIED_SOURCE_EVIDENCE_V2",
      evidence_constrained_execution: true,
      story_fields_preserved: true,
    },
    source_evidence_contract: undefined,
  };
}

function propositionContract(result = {}) {
  return {
    contract: "CREATIVE_DIRECTION_SOURCE_EVIDENCE_V2",
    evidence_mode: result.evidence_mode || null,
    source_asset_ids: list(result.source_asset_ids),
    proposition_count: list(result.required_propositions).length,
    propositions: list(result.required_propositions).map((proposition) => ({
      requirement_id: proposition.requirement_id || proposition.anchor || null,
      requirement_source: proposition.requirement_source || null,
      requirement_path: proposition.requirement_path || null,
      requirement_value: proposition.requirement_value || null,
      matched: list(proposition.matched).map((match) => ({
        asset_id: match.asset_id || null,
        path: match.path || null,
        value: match.value || null,
        confidence: match.confidence ?? null,
        match_strength: match.match_strength ?? null,
      })),
    })),
    minimum_confidence: MINIMUM_CONFIDENCE,
    new_physical_content_allowed: false,
  };
}

function attachEvidenceContracts(scenes = [], gate = {}) {
  const resultByShot = new Map(
    list(gate.results).map((result) => [text(result.shot_id), result]),
  );
  return list(scenes).map((scene) => {
    const shots = list(scene.shots).map((shot) => {
      const result = resultByShot.get(text(shot.id));
      if (!result || result.passed !== true) {
        throw new Error(
          `EVIDENCE_CONSTRAINED_DIRECTION_SHOT_RESULT_REQUIRED:${text(shot.id)}`,
        );
      }
      return {
        ...object(shot),
        source_evidence_contract: propositionContract(result),
      };
    });
    return {
      ...object(scene),
      shots,
      metadata: {
        ...object(scene.metadata),
        source_evidence_contract: {
          contract: "CREATIVE_SCENE_SOURCE_EVIDENCE_V2",
          shot_ids: shots.map((shot) => shot.id).filter(Boolean),
          source_asset_ids: unique(
            shots.map((shot) => shot.source_evidence_contract?.source_asset_ids),
          ),
          story_fields_preserved: true,
        },
      },
    };
  });
}

async function loadAssets(organizationId, ids) {
  if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");
  if (!ids.length) {
    throw new Error("EVIDENCE_CONSTRAINED_DIRECTION_SOURCE_ASSETS_REQUIRED");
  }
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("*")
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) throw error;
  const assets = data || [];
  const found = new Set(assets.map((asset) => text(asset.id)));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    throw new Error(
      `EVIDENCE_CONSTRAINED_DIRECTION_ASSETS_MISSING:${missing.join(",")}`,
    );
  }
  return assets;
}

export async function rebuildCreativeDirectionFromEvidence({
  plan,
  organization_id,
} = {}) {
  const approvedPlan = object(plan);
  const sourceIds = sourceAssetIds(approvedPlan);
  const assets = await loadAssets(organization_id, sourceIds);
  const storyAuthorityHashBefore = digest(storyAuthoritySnapshot(approvedPlan));

  const constrainedScenes = list(approvedPlan.scenes).map((scene) => ({
    ...object(scene),
    shots: list(scene.shots).map(constrainShot),
    metadata: {
      ...object(scene.metadata),
      evidence_constrained_execution: true,
      story_fields_preserved: true,
    },
  }));

  const preliminaryGate = evaluateCreativeSourceShotEvidence({
    shots: constrainedScenes.flatMap((scene) => list(scene.shots)),
    assets,
    minimum_confidence: MINIMUM_CONFIDENCE,
  });

  if (preliminaryGate.readiness !== "PASS") {
    const error = new Error(
      `EVIDENCE_CONSTRAINED_DIRECTION_GATE_FAILED:${preliminaryGate.blockers.join(",")}`,
    );
    error.blockers = preliminaryGate.blockers;
    error.results = preliminaryGate.results;
    error.story_authority_hash = storyAuthorityHashBefore;
    error.automatic_story_rewrite_executed = false;
    throw error;
  }

  const evidenceScenes = attachEvidenceContracts(
    constrainedScenes,
    preliminaryGate,
  );
  const evidencePlan = {
    ...approvedPlan,
    scenes: evidenceScenes,
    validation: {
      ...object(approvedPlan.validation),
      evidence_constrained: true,
    },
    metadata: {
      ...object(approvedPlan.metadata),
      evidence_constrained_direction: {
        contract: "CREATIVE_EVIDENCE_CONSTRAINED_DIRECTION_V2",
        source_asset_ids: sourceIds,
        source_asset_count: sourceIds.length,
        minimum_confidence: MINIMUM_CONFIDENCE,
        physical_content_invention_allowed: false,
        automatic_story_rewrite_allowed: false,
        story_authority_hash: storyAuthorityHashBefore,
      },
    },
  };

  const promptless = sanitizeCreativePromptlessDirectionSpec(evidencePlan);
  const storyAuthorityHashAfter = digest(
    storyAuthoritySnapshot(promptless.plan),
  );
  if (storyAuthorityHashAfter !== storyAuthorityHashBefore) {
    throw new Error(
      `EVIDENCE_CONSTRAINED_DIRECTION_STORY_AUTHORITY_CHANGED:${storyAuthorityHashBefore}:${storyAuthorityHashAfter}`,
    );
  }

  const finalGate = evaluateCreativeSourceShotEvidence({
    shots: list(promptless.plan.scenes).flatMap((scene) => list(scene.shots)),
    assets,
    minimum_confidence: MINIMUM_CONFIDENCE,
  });
  if (finalGate.readiness !== "PASS") {
    const error = new Error(
      `EVIDENCE_CONSTRAINED_DIRECTION_FINAL_GATE_FAILED:${finalGate.blockers.join(",")}`,
    );
    error.blockers = finalGate.blockers;
    error.results = finalGate.results;
    throw error;
  }

  return {
    plan: {
      ...promptless.plan,
      validation: {
        ...object(promptless.plan.validation),
        passed: true,
        evidence_constrained: true,
        source_shot_evidence: {
          contract: finalGate.contract,
          readiness: finalGate.readiness,
          shot_count: finalGate.shot_count,
          passed_shot_count: finalGate.passed_shot_count,
          failed_shot_count: finalGate.failed_shot_count,
          story_authority_hash: storyAuthorityHashAfter,
        },
      },
    },
    evidence: {
      contract: "CREATIVE_EVIDENCE_CONSTRAINED_DIRECTION_V2",
      source_asset_ids: sourceIds,
      source_asset_count: sourceIds.length,
      shot_count: finalGate.shot_count,
      passed_shot_count: finalGate.passed_shot_count,
      fallback_shot_count: 0,
      minimum_confidence: MINIMUM_CONFIDENCE,
      story_authority_hash_before: storyAuthorityHashBefore,
      story_authority_hash_after: storyAuthorityHashAfter,
      story_authority_unchanged:
        storyAuthorityHashBefore === storyAuthorityHashAfter,
      automatic_story_rewrite_executed: false,
      promptless_validation: promptless.evidence.validation,
      source_shot_gate: finalGate,
    },
  };
}

function install() {
  if (CreativeUniversalTemporalDirectionRuntime[INSTALL_FLAG]) return;
  const createWithoutEvidenceRebuild =
    CreativeUniversalTemporalDirectionRuntime.create.bind(
      CreativeUniversalTemporalDirectionRuntime,
    );

  Object.defineProperty(
    CreativeUniversalTemporalDirectionRuntime,
    INSTALL_FLAG,
    { value: true, enumerable: false, configurable: false },
  );

  CreativeUniversalTemporalDirectionRuntime.create =
    async function createWithEvidenceConstrainedDirection(input = {}) {
      const result = await createWithoutEvidenceRebuild(input);
      if (!result?.plan) return result;
      const rebuilt = await rebuildCreativeDirectionFromEvidence({
        plan: result.plan,
        organization_id: text(input.organization_id || input.organizationId),
      });
      console.log(
        `CREATIVE_EVIDENCE_CONSTRAINED_DIRECTION=${JSON.stringify({
          contract: rebuilt.evidence.contract,
          source_asset_count: rebuilt.evidence.source_asset_count,
          shot_count: rebuilt.evidence.shot_count,
          passed_shot_count: rebuilt.evidence.passed_shot_count,
          fallback_shot_count: rebuilt.evidence.fallback_shot_count,
          story_authority_unchanged:
            rebuilt.evidence.story_authority_unchanged,
          automatic_story_rewrite_executed:
            rebuilt.evidence.automatic_story_rewrite_executed,
        })}`,
      );
      return {
        ...result,
        plan: rebuilt.plan,
        evidence_constrained_direction: rebuilt.evidence,
      };
    };
}

install();

export const CreativeEvidenceConstrainedDirectionRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_EVIDENCE_CONSTRAINED_DIRECTION_V2",
  rebuild: rebuildCreativeDirectionFromEvidence,
});
