import crypto from "node:crypto";

export const CREATIVE_WORLD_CLASS_BENCHMARK_CONTRACT =
  "CREATIVE_WORLD_CLASS_BENCHMARK_V1";
export const CREATIVE_WORLD_CLASS_BENCHMARK_THRESHOLDS = Object.freeze({
  minimum_cases: 5,
  minimum_case_score: 82,
  minimum_overall_score: 88,
  maximum_pairwise_direction_similarity: 0.72,
});

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

function structuredText(value) {
  if (value == null) return "";
  if (["string", "number", "boolean"].includes(typeof value)) {
    return text(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function words(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function setSimilarity(left, right) {
  const a = new Set(words(left));
  const b = new Set(words(right));
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function bounded(value, minimum = 0, maximum = 100) {
  const number = finite(value);
  if (number === null) return minimum;
  return Math.max(minimum, Math.min(maximum, number));
}

function scoreText(value, ideal, minimum) {
  const length = text(value).length;
  if (length < minimum) return 0;
  return Math.min(
    100,
    70 +
      ((Math.min(length, ideal) - minimum) /
        Math.max(1, ideal - minimum)) *
        30,
  );
}

function substantive(values, minimum = 20) {
  return list(values)
    .map(text)
    .filter((value) => value.length >= minimum);
}

function concept(plan = {}) {
  return object(plan.concept);
}

function creativeReview(plan = {}) {
  return object(plan.creative_review);
}

function tribunal(plan = {}) {
  return object(plan.creative_tribunal);
}

function temporalProductionSteps(plan = {}) {
  return list(plan.scenes).flatMap((scene, sceneIndex) =>
    list(scene.shots).map((shot, shotIndex) => {
      const generation = object(shot.generation);
      return {
        id: shot.id || `scene-${sceneIndex + 1}-shot-${shotIndex + 1}`,
        title: shot.title || shot.name || `Directed shot ${shotIndex + 1}`,
        purpose:
          shot.purpose ||
          shot.action ||
          shot.description ||
          object(shot.intent).purpose ||
          object(shot.intent).action ||
          scene.objective ||
          scene.purpose ||
          scene.description ||
          "",
        service: generation.service || null,
        capability: generation.capability || null,
        output_spec: generation.output_spec || shot.output_spec || {},
        requirements: [
          shot.subject,
          shot.action,
          shot.performance,
          shot.medium,
          shot.frame_plan,
          shot.camera,
          shot.lighting,
          shot.production_design,
          shot.continuity,
          shot.dialogue,
          shot.narration,
          shot.audio,
          shot.graphics,
          shot.vfx,
          shot.transition_in,
          shot.transition_out,
          shot.primary_source_asset_id,
          shot.reference_assets,
          shot.negative_constraints,
          shot.known_failure_modes,
          shot.repair_instructions,
        ].filter(Boolean),
      };
    }),
  );
}

function productionSteps(plan = {}) {
  return [
    ...list(plan.deliverables).flatMap((deliverable) =>
      list(deliverable.production_steps),
    ),
    ...list(object(plan.production).cross_deliverable_steps),
    ...temporalProductionSteps(plan),
  ];
}

function compactDirection(plan = {}) {
  const direction = concept(plan);
  const deliverables = list(plan.deliverables);
  const steps = productionSteps(plan);
  const story = object(plan.story);
  const scenes = list(plan.scenes);

  return [
    direction.title,
    direction.creative_thesis,
    direction.hook,
    direction.message,
    direction.narrative,
    direction.creative_system,
    direction.emotional_promise,
    direction.call_to_action,
    direction.target_audience,
    story.hook,
    story.audience_tension,
    story.escalation,
    story.observable_proof,
    story.turn,
    story.resolution,
    story.call_to_action,
    story.emotional_arc,
    story.anti_cliche_strategy,
    ...deliverables.flatMap((item) => [
      item.type,
      item.purpose,
      ...list(item.channels),
      ...list(item.languages),
      structuredText(item.output_spec),
    ]),
    ...scenes.flatMap((scene) => [
      scene.title,
      scene.objective,
      scene.emotion,
      scene.story_state_before,
      scene.state_change,
      scene.story_state_after,
      scene.transition_logic,
      structuredText(scene.location),
      structuredText(scene.actors),
      structuredText(scene.products),
      structuredText(scene.brand_rules),
      structuredText(scene.visual_style),
      structuredText(scene.camera_style),
      structuredText(scene.audio_style),
    ]),
    ...steps.flatMap((step) => [
      step.title,
      step.purpose,
      step.service,
      step.capability,
      structuredText(step.output_spec),
      ...list(step.requirements).map(structuredText),
    ]),
  ]
    .map(structuredText)
    .filter(Boolean)
    .join("\n");
}

function sourceSpecificity(plan = {}, benchmark = {}) {
  const direction = compactDirection(plan).toLowerCase();
  const anchors = unique(
    [
      ...list(benchmark.required_anchors),
      text(benchmark.organization_name),
      ...list(benchmark.product_names),
      ...list(benchmark.audience_terms),
      ...list(benchmark.market_terms),
    ]
      .map(text)
      .filter((value) => value.length >= 3),
  );
  if (!anchors.length) return 70;
  const matched = anchors.filter((anchor) =>
    direction.includes(anchor.toLowerCase()),
  );
  return Math.round((matched.length / anchors.length) * 100);
}

function genericLanguagePenalty(plan = {}) {
  const direction = compactDirection(plan).toLowerCase();
  const patterns = [
    /\belevate your\b/g,
    /\bunforgettable experience\b/g,
    /\bwhere .* meets .*\b/g,
    /\bmore than just\b/g,
    /\bdiscover the difference\b/g,
    /\bunlock .* potential\b/g,
    /\bredefine(?:d|s|ing)?\b/g,
    /\bjourney\b/g,
    /\bpremium experience\b/g,
    /\bseamless(?:ly)?\b/g,
    /\binnovative solutions?\b/g,
    /\bcutting[- ]edge\b/g,
    /\bgame[- ]changer\b/g,
    /\btransform your\b/g,
  ];
  let hits = 0;
  for (const pattern of patterns) {
    hits += (direction.match(pattern) || []).length;
  }
  return Math.min(35, hits * 7);
}

export function scoreCreativeWorldClassBenchmarkCase(entry = {}) {
  const thresholds = CREATIVE_WORLD_CLASS_BENCHMARK_THRESHOLDS;
  const benchmark = object(entry.benchmark);
  const envelope = object(entry.master_plan || entry.master || entry.result);
  const plan = object(envelope.plan || envelope);
  const review = creativeReview(plan);
  const dimensions = object(review.dimensions);
  const dynamicTribunal = tribunal(plan);
  const tribunalVerdict = object(dynamicTribunal.verdict);
  const steps = productionSteps(plan);

  const reviewScores = [
    "strategic_specificity",
    "originality",
    "ownability",
    "audience_truth",
    "brand_truth",
    "medium_fitness",
    "craft_specificity",
    "factual_discipline",
    "language_specificity",
    "production_feasibility",
    "finishing_readiness",
  ].map((key) => bounded(dimensions[key]));

  const declaredReview = reviewScores.length
    ? reviewScores.reduce((sum, value) => sum + value, 0) /
      reviewScores.length
    : 0;
  const specificity = sourceSpecificity(plan, benchmark);
  const thesis = scoreText(concept(plan).creative_thesis, 500, 80);
  const rejected = Math.min(
    100,
    substantive(review.rejected_patterns, 20).length * 25,
  );
  const craft = Math.min(
    100,
    substantive(review.craft_risks, 20).length * 25,
  );
  const finishing = Math.min(
    100,
    substantive(review.finishing_requirements, 20).length * 25,
  );
  const production = steps.length
    ? Math.min(100, 65 + Math.min(35, steps.length * 5))
    : 0;
  const tribunalScore = bounded(tribunalVerdict.weighted_score);
  const genericPenalty = genericLanguagePenalty(plan);

  const raw =
    declaredReview * 0.28 +
    specificity * 0.18 +
    thesis * 0.1 +
    rejected * 0.08 +
    craft * 0.08 +
    finishing * 0.08 +
    production * 0.08 +
    tribunalScore * 0.12;

  const score = Number(Math.max(0, raw - genericPenalty).toFixed(2));
  const failures = [];
  if (!text(plan.workflow_kind)) failures.push("WORKFLOW_KIND_REQUIRED");
  if (review.passed !== true) failures.push("CREATIVE_REVIEW_NOT_PASSED");
  if (dynamicTribunal.passed !== true) {
    failures.push("DYNAMIC_TRIBUNAL_NOT_PASSED");
  }
  if (specificity < 55) {
    failures.push("DIRECTION_NOT_SUFFICIENTLY_CONTEXT_SPECIFIC");
  }
  if (substantive(review.rejected_patterns, 20).length < 3) {
    failures.push("WEAK_DIRECTION_REJECTION_EVIDENCE");
  }
  if (substantive(review.craft_risks, 20).length < 2) {
    failures.push("CRAFT_RISK_DEPTH_INSUFFICIENT");
  }
  if (substantive(review.finishing_requirements, 20).length < 2) {
    failures.push("FINISHING_DEPTH_INSUFFICIENT");
  }
  if (!steps.length) failures.push("PRODUCTION_PLAN_EMPTY");
  if (genericPenalty >= 14) failures.push("GENERIC_AI_LANGUAGE_PATTERN");
  if (score < thresholds.minimum_case_score) {
    failures.push("CASE_SCORE_BELOW_WORLD_CLASS_FLOOR");
  }

  return {
    id: text(entry.id || benchmark.id),
    label: text(entry.label || benchmark.label),
    workflow_kind: text(plan.workflow_kind),
    score,
    passed: failures.length === 0,
    metrics: {
      declared_review_score: Number(declaredReview.toFixed(2)),
      contextual_specificity_score: specificity,
      thesis_depth_score: Number(thesis.toFixed(2)),
      rejected_pattern_score: rejected,
      craft_risk_score: craft,
      finishing_score: finishing,
      production_plan_score: production,
      tribunal_score: tribunalScore,
      generic_language_penalty: genericPenalty,
      production_step_count: steps.length,
      temporal_scene_count: list(plan.scenes).length,
      temporal_shot_count: temporalProductionSteps(plan).length,
    },
    failures,
    direction_hash: hash(compactDirection(plan)),
    direction_text: compactDirection(plan),
  };
}

function crossCaseChecks(cases = []) {
  const thresholds = CREATIVE_WORLD_CLASS_BENCHMARK_THRESHOLDS;
  const failures = [];
  const similarities = [];

  // A case that produced no direction has no direction to compare. Measuring two
  // empty strings scores them as identical and reports DIRECTIONS_TOO_SIMILAR at
  // 1.000, which buried the real failures under an artefact of the comparison --
  // the cases had already failed for having no plan at all.
  const comparable = cases.filter((entry) => String(entry.direction_text ?? "").trim());

  for (let left = 0; left < comparable.length; left += 1) {
    for (let right = left + 1; right < comparable.length; right += 1) {
      const similarity = setSimilarity(
        comparable[left].direction_text,
        comparable[right].direction_text,
      );
      similarities.push({
        left: comparable[left].id,
        right: comparable[right].id,
        similarity: Number(similarity.toFixed(3)),
      });
      if (similarity > thresholds.maximum_pairwise_direction_similarity) {
        failures.push(
          `DIRECTIONS_TOO_SIMILAR:${comparable[left].id}:${comparable[right].id}:${similarity.toFixed(3)}`,
        );
      }
    }
  }

  const workflowKinds = unique(cases.map((entry) => entry.workflow_kind));
  if (workflowKinds.length < 2) {
    failures.push("BENCHMARK_WORKFLOW_DIVERSITY_INSUFFICIENT");
  }

  return {
    passed: failures.length === 0,
    workflow_kinds: workflowKinds,
    pairwise_direction_similarity: similarities,
    failures,
  };
}

export function evaluateCreativeWorldClassBenchmark({
  cases: inputCases = [],
  evaluated_at = new Date().toISOString(),
} = {}) {
  const thresholds = CREATIVE_WORLD_CLASS_BENCHMARK_THRESHOLDS;
  if (inputCases.length < thresholds.minimum_cases) {
    throw new Error(
      `CREATIVE_WORLD_CLASS_BENCHMARK_REQUIRES_${thresholds.minimum_cases}_CASES`,
    );
  }

  const cases = inputCases.map(scoreCreativeWorldClassBenchmarkCase);
  const crossCase = crossCaseChecks(cases);
  const average =
    cases.reduce((sum, entry) => sum + entry.score, 0) / cases.length;
  const failures = [
    ...cases.flatMap((entry) =>
      entry.failures.map((failure) => `${entry.id}:${failure}`),
    ),
    ...crossCase.failures,
  ];
  if (average < thresholds.minimum_overall_score) {
    failures.push(
      `AVERAGE_SCORE_BELOW_WORLD_CLASS_FLOOR:${average.toFixed(2)}`,
    );
  }

  return {
    contract: CREATIVE_WORLD_CLASS_BENCHMARK_CONTRACT,
    passed: failures.length === 0,
    evaluated_at,
    thresholds,
    score: Number(average.toFixed(2)),
    cases: cases.map(({ direction_text, ...entry }) => entry),
    cross_case: crossCase,
    failures,
    benchmark_provider_calls_executed: false,
    benchmark_provider_spend_approved: false,
    publication_executed: false,
  };
}

export const CreativeWorldClassBenchmarkRuntime = Object.freeze({
  contract: CREATIVE_WORLD_CLASS_BENCHMARK_CONTRACT,
  thresholds: CREATIVE_WORLD_CLASS_BENCHMARK_THRESHOLDS,
  scoreCase: scoreCreativeWorldClassBenchmarkCase,
  evaluate: evaluateCreativeWorldClassBenchmark,
});
