import {
  CreativeMasterPlanRuntime,
} from "./CreativeMasterPlanRuntime";
import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";
import {
  WORLD_CLASS_CONCEPT_POLICY,
} from "./CreativeWorldClassConceptPolicy";
import {
  applyWorldClassConceptPolicy,
} from "./CreativeWorldClassConceptPolicyResolver";

const MASTER_PLAN_FLAG = Symbol.for(
  "avantiqo.creative.world-class-concept.master-plan.v1",
);
const TEMPORAL_FLAG = Symbol.for(
  "avantiqo.creative.world-class-concept.temporal.v1",
);

const GENERIC_PATTERNS = Object.freeze([
  /\bpremium\s+and\s+authentic\b/i,
  /\bmodern\s+and\s+elegant\b/i,
  /\bclean\s+and\s+professional\b/i,
  /\bengaging\s+and\s+memorable\b/i,
  /\bhigh[- ]quality\s+content\b/i,
  /\bvisually\s+stunning\b/i,
  /\bcinematic\s+experience\b/i,
  /\bseamless\s+experience\b/i,
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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique(values = []) {
  return [...new Set(list(values).map(text).filter(Boolean))];
}

function shallowOrGeneric(value, minimum = 20) {
  const source = text(value);
  if (source.length < minimum) return true;
  return GENERIC_PATTERNS.some((pattern) => pattern.test(source));
}

function universalConceptGate(plan = {}, policy = WORLD_CLASS_CONCEPT_POLICY) {
  const concept = object(plan.concept);
  const story = object(plan.story);
  const failures = [];
  const requireSpecific = (value, path, minimum) => {
    if (shallowOrGeneric(value, minimum)) failures.push(path);
  };

  requireSpecific(concept.title, "concept.title", 8);
  requireSpecific(
    concept.creative_thesis || concept.central_proposition,
    "concept.creative_thesis",
    45,
  );
  requireSpecific(concept.hook, "concept.hook", 24);
  requireSpecific(concept.message, "concept.message", 24);
  requireSpecific(
    concept.narrative || concept.causal_story,
    "concept.narrative",
    80,
  );
  requireSpecific(story.hook, "story.hook", 24);
  requireSpecific(story.audience_tension, "story.audience_tension", 24);
  requireSpecific(story.escalation, "story.escalation", 24);
  requireSpecific(story.observable_proof, "story.observable_proof", 24);
  requireSpecific(story.turn, "story.turn", 24);
  requireSpecific(story.resolution, "story.resolution", 24);
  requireSpecific(story.anti_cliche_strategy, "story.anti_cliche_strategy", 32);

  if (!list(plan.deliverables).length) failures.push("deliverables");
  if (plan.degraded === true || plan.release_blocked === true) {
    failures.push("release_blocked");
  }

  if (failures.length) {
    throw new Error(
      `CREATIVE_WORLD_CLASS_CONCEPT_BASELINE_FAILED:${unique(failures).join(",")}`,
    );
  }

  return {
    contract: policy.contract,
    passed: true,
    workflow_kind: text(plan.workflow_kind).toUpperCase() || null,
    baseline_specificity_passed: true,
    generic_direction_rejected: true,
    b_grade_concept_forbidden: true,
    policy,
  };
}

function councilFrom(result = {}) {
  const plan = object(result.plan);
  return object(
    result.independent_concept_council ||
    plan.concept_council,
  );
}

function councilGate(result = {}, policy = WORLD_CLASS_CONCEPT_POLICY) {
  const council = councilFrom(result);
  if (!Object.keys(council).length) return null;

  const selection = object(council.selection);
  const selected = object(selection.selected_concept);
  const selectedId = text(
    selection.selected_concept_id ||
    selected.id ||
    result.plan?.selected_concept_id,
  );
  const scorecards = list(council.scorecards);
  const card = scorecards.find((item) => text(item.concept_id) === selectedId);
  if (!selectedId || !card) {
    throw new Error("CREATIVE_WORLD_CLASS_CONCEPT_SELECTION_REQUIRED");
  }

  const criticScores = object(card.critic_scores);
  const failedCritics = Object.entries(policy.critic_minimums)
    .filter(([id, minimum]) => {
      const score = finite(criticScores[id]);
      return score === null || score < minimum;
    })
    .map(([id]) => id);

  const weightedScore = finite(card.weighted_score);
  if (
    failedCritics.length ||
    weightedScore === null ||
    weightedScore < policy.minimum_weighted_score
  ) {
    throw new Error(
      `CREATIVE_WORLD_CLASS_CONCEPT_SCORE_FAILED:${[
        ...failedCritics,
        weightedScore === null || weightedScore < policy.minimum_weighted_score
          ? "weighted_score"
          : null,
      ].filter(Boolean).join(",")}`,
    );
  }

  const confidence = finite(selection.confidence);
  if (
    confidence === null ||
    confidence < policy.minimum_selector_confidence
  ) {
    throw new Error("CREATIVE_WORLD_CLASS_CONCEPT_CONFIDENCE_FAILED");
  }

  const pairwise = list(council.distinctness?.pairwise_similarity);
  const excessiveSimilarity = pairwise.find((item) =>
    finite(item.similarity) !== null &&
    finite(item.similarity) > policy.maximum_pairwise_similarity,
  );
  if (excessiveSimilarity) {
    throw new Error(
      `CREATIVE_WORLD_CLASS_CONCEPT_DISTINCTNESS_FAILED:${text(excessiveSimilarity.left)}:${text(excessiveSimilarity.right)}`,
    );
  }

  const selectedFailures = [];
  if (list(selected.signature_images).length < policy.minimum_signature_images) {
    selectedFailures.push("signature_images");
  }
  if (list(selected.campaign_extensions).length < policy.minimum_campaign_extensions) {
    selectedFailures.push("campaign_extensions");
  }
  if (list(selected.anti_cliche_rules).length < policy.minimum_anti_cliche_rules) {
    selectedFailures.push("anti_cliche_rules");
  }
  if (shallowOrGeneric(selected.central_proposition, 45)) {
    selectedFailures.push("central_proposition");
  }
  if (shallowOrGeneric(selected.original_world, 60)) {
    selectedFailures.push("original_world");
  }
  if (shallowOrGeneric(selected.causal_story, 80)) {
    selectedFailures.push("causal_story");
  }
  if (shallowOrGeneric(selected.brand_fit, 35)) {
    selectedFailures.push("brand_fit");
  }
  if (shallowOrGeneric(selection.selection_reason, 50)) {
    selectedFailures.push("selection_reason");
  }

  if (selectedFailures.length) {
    throw new Error(
      `CREATIVE_WORLD_CLASS_SELECTED_CONCEPT_INCOMPLETE:${selectedFailures.join(",")}`,
    );
  }

  return {
    contract: policy.contract,
    passed: true,
    selected_concept_id: selectedId,
    weighted_score: weightedScore,
    selector_confidence: confidence,
    critic_scores: criticScores,
    critic_minimums: policy.critic_minimums,
    maximum_pairwise_similarity: policy.maximum_pairwise_similarity,
    minimum_signature_images: policy.minimum_signature_images,
    minimum_campaign_extensions: policy.minimum_campaign_extensions,
    minimum_anti_cliche_rules: policy.minimum_anti_cliche_rules,
    b_grade_concept_forbidden: true,
  };
}

function enforceResult(result = {}, policy = WORLD_CLASS_CONCEPT_POLICY) {
  if (!result?.plan) return result;
  const baseline = universalConceptGate(result.plan, policy);
  const council = councilGate(result, policy);
  const gate = {
    ...baseline,
    temporal_council_enforced: Boolean(council),
    council,
    policy,
  };

  return {
    ...result,
    plan: {
      ...result.plan,
      creative_intelligence_policy: policy,
      world_class_concept_intelligence: gate,
      concept_council: council
        ? {
            ...object(result.plan.concept_council),
            world_class_gate: council,
          }
        : result.plan.concept_council,
      validation_summary: {
        ...object(result.plan.validation_summary),
        world_class_concept_intelligence: gate,
      },
    },
    world_class_concept_intelligence: gate,
  };
}

function installTemporalGate() {
  if (CreativeUniversalTemporalDirectionRuntime[TEMPORAL_FLAG]) return;
  const create = CreativeUniversalTemporalDirectionRuntime.create.bind(
    CreativeUniversalTemporalDirectionRuntime,
  );
  Object.defineProperty(CreativeUniversalTemporalDirectionRuntime, TEMPORAL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  CreativeUniversalTemporalDirectionRuntime.create = async function createWithWorldClassConcept(input = {}) {
    const resolved = applyWorldClassConceptPolicy(input);
    return enforceResult(await create(resolved.input), resolved.policy);
  };
}

function installMasterPlanGate() {
  if (CreativeMasterPlanRuntime[MASTER_PLAN_FLAG]) return;
  const create = CreativeMasterPlanRuntime.create.bind(CreativeMasterPlanRuntime);
  Object.defineProperty(CreativeMasterPlanRuntime, MASTER_PLAN_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  CreativeMasterPlanRuntime.create = async function createWithWorldClassConcept(input = {}) {
    const resolved = applyWorldClassConceptPolicy(input);
    return enforceResult(await create(resolved.input), resolved.policy);
  };
}

installTemporalGate();
installMasterPlanGate();

export const CreativeWorldClassConceptIntelligenceRuntime = Object.freeze({
  installed: true,
  contract: WORLD_CLASS_CONCEPT_POLICY.contract,
  policy: WORLD_CLASS_CONCEPT_POLICY,
});
