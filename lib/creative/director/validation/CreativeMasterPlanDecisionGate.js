const CONTRACT = "CREATIVE_MASTER_PLAN_DECISION_GATE_V1";

const REVIEW_DIMENSIONS = Object.freeze([
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
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function values(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function push(failures, code, path, message, evidence = null) {
  failures.push({ code, path, message, evidence });
}

// Depth is a measure of substance, and substance in a structured value lives in its
// string leaves. Measuring text(value) alone meant an object was stringified to
// "[object Object]" -- 15 characters -- and any structured answer failed as "too
// shallow" no matter how substantial it was.
//
// This is not a hypothetical. The contract for concept.target_audience asks for "the
// relevant desire, contradiction, obstacle, belief or behavior", which invites
// structure, and the brief supplies target_audience as an object. A plan expressing
// audience as structure was rejected with
// TARGET_AUDIENCE_TRUTH_TOO_SHALLOW@concept.target_audience=[object Object], for a
// reason that had nothing to do with the quality of the work.
//
// The check keeps its teeth: an object holding real prose yields plenty of
// characters, while an empty or token-filled one still yields almost none.
function depthText(value, depth = 0) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (depth > 4) return "";
  if (Array.isArray(value)) {
    return value.map((entry) => depthText(entry, depth + 1)).filter(Boolean).join(" ");
  }
  if (typeof value === "object") {
    return Object.values(value)
      .map((entry) => depthText(entry, depth + 1))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function requireDepth(
  failures,
  value,
  path,
  minimum,
  code,
  message,
) {
  const normalized = depthText(value);
  if (normalized.length >= minimum) return;
  push(
    failures,
    code,
    path,
    message,
    normalized || null,
  );
}

function capabilityIndex(available = []) {
  const index = new Map();
  for (const service of list(available)) {
    const serviceId = text(service.service_id);
    if (!serviceId) continue;
    const capabilities = new Set(
      list(service.capabilities).map(text).filter(Boolean),
    );
    index.set(serviceId, capabilities);
  }
  return index;
}

function validateCapabilityPair(
  service,
  capability,
  path,
  available,
  failures,
) {
  const serviceId = text(service);
  const capabilityId = text(capability);
  if (!serviceId || !capabilityId) return;

  const capabilities = available.get(serviceId);
  if (!capabilities) {
    push(
      failures,
      "PRODUCTION_SERVICE_NOT_ENABLED",
      `${path}.service`,
      `Service ${serviceId} is not enabled for this organization`,
      serviceId,
    );
    return;
  }

  if (!capabilities.has(capabilityId)) {
    push(
      failures,
      "PRODUCTION_CAPABILITY_NOT_ENABLED",
      `${path}.capability`,
      `Capability ${capabilityId} is not enabled for service ${serviceId}`,
      { service: serviceId, capability: capabilityId },
    );
  }
}

function reviewThresholds(plan = {}) {
  const quality = object(plan.quality);
  const configured = finite(
    quality.minimum_direction_score ??
    quality.minimum_release_score ??
    quality.minimum_scene_score,
  );
  const overall = Math.max(90, configured ?? 90);
  const dimension = Math.max(85, Math.min(95, overall - 4));
  return { overall, dimension };
}

function meaningfulList(value, minimumLength = 20) {
  return values(value)
    .map(text)
    .filter((item) => item.length >= minimumLength);
}

function validateConceptDepth(plan, failures) {
  const concept = object(plan.concept);

  requireDepth(
    failures,
    concept.creative_thesis,
    "concept.creative_thesis",
    80,
    "CREATIVE_THESIS_TOO_SHALLOW",
    "The governing creative thesis requires enough strategic depth to express an organization-specific idea, tension and business relevance",
  );

  requireDepth(
    failures,
    concept.target_audience,
    "concept.target_audience",
    60,
    "TARGET_AUDIENCE_TRUTH_TOO_SHALLOW",
    "Target audience must include enough evidence-backed desire, contradiction, obstacle, belief or behavior to guide the creative decision",
  );

  requireDepth(
    failures,
    concept.hook,
    "concept.hook",
    30,
    "CREATIVE_HOOK_TOO_SHALLOW",
    "The audience-facing hook must be a concrete attention mechanism rather than a label or advertising adjective",
  );

  requireDepth(
    failures,
    concept.narrative,
    "concept.narrative",
    80,
    "CREATIVE_NARRATIVE_TOO_SHALLOW",
    "The creative narrative must explain the causal progression of the selected idea in the chosen medium",
  );

  requireDepth(
    failures,
    concept.creative_system,
    "concept.creative_system",
    100,
    "CREATIVE_SYSTEM_TOO_SHALLOW",
    "The creative system must translate the direction into observable medium-specific craft rather than abstract style language",
  );

  requireDepth(
    failures,
    concept.emotional_promise,
    "concept.emotional_promise",
    40,
    "CREATIVE_EMOTIONAL_PROMISE_TOO_SHALLOW",
    "The emotional promise must describe a specific earned audience outcome rather than a generic aspiration",
  );

  if (text(plan.workflow_kind).toUpperCase() === "TEMPORAL") {
    const story = object(plan.story);

    requireDepth(
      failures,
      story.audience_tension,
      "story.audience_tension",
      50,
      "TEMPORAL_AUDIENCE_TENSION_TOO_SHALLOW",
      "Temporal work requires a concrete audience tension strong enough to sustain attention across the story",
    );

    requireDepth(
      failures,
      story.observable_proof,
      "story.observable_proof",
      50,
      "TEMPORAL_OBSERVABLE_PROOF_TOO_SHALLOW",
      "Temporal work must specify what the audience can actually see or hear that proves the message",
    );

    requireDepth(
      failures,
      story.anti_cliche_strategy,
      "story.anti_cliche_strategy",
      60,
      "TEMPORAL_ANTI_CLICHE_STRATEGY_TOO_SHALLOW",
      "Temporal work requires a mission-specific strategy for avoiding predictable advertising, AI-generation, performance, edit and sound language",
    );
  }
}

function validateCreativeReview(plan, failures) {
  const review = object(plan.creative_review);
  const thresholds = reviewThresholds(plan);

  if (review.passed !== true) {
    push(
      failures,
      "CREATIVE_REVIEW_NOT_PASSED",
      "creative_review.passed",
      "Creative direction must pass its accountable review before production planning",
      review.passed,
    );
  }

  const overall = finite(review.overall_score);
  if (overall === null || overall < thresholds.overall || overall > 100) {
    push(
      failures,
      "CREATIVE_REVIEW_SCORE_BELOW_STANDARD",
      "creative_review.overall_score",
      `Creative direction score must be between ${thresholds.overall} and 100`,
      review.overall_score,
    );
  }

  const dimensions = object(review.dimensions);
  for (const dimension of REVIEW_DIMENSIONS) {
    const score = finite(dimensions[dimension]);
    if (score === null || score < thresholds.dimension || score > 100) {
      push(
        failures,
        "CREATIVE_REVIEW_DIMENSION_BELOW_STANDARD",
        `creative_review.dimensions.${dimension}`,
        `${dimension} must be between ${thresholds.dimension} and 100`,
        dimensions[dimension],
      );
    }
  }

  if (text(review.selected_direction_reason).length < 80) {
    push(
      failures,
      "CREATIVE_REVIEW_SELECTION_REASON_SHALLOW",
      "creative_review.selected_direction_reason",
      "The selected direction requires a specific evidence-backed reason of at least 80 characters",
      review.selected_direction_reason,
    );
  }

  if (meaningfulList(review.rejected_patterns, 20).length < 3) {
    push(
      failures,
      "CREATIVE_REVIEW_REJECTED_PATTERNS_REQUIRED",
      "creative_review.rejected_patterns",
      "At least three substantive predictable or derivative approaches must be explicitly rejected",
    );
  }

  if (text(review.weakest_link).length < 40) {
    push(
      failures,
      "CREATIVE_REVIEW_WEAKEST_LINK_REQUIRED",
      "creative_review.weakest_link",
      "The direction must identify its weakest remaining link precisely",
      review.weakest_link,
    );
  }

  if (meaningfulList(review.craft_risks, 20).length < 2) {
    push(
      failures,
      "CREATIVE_REVIEW_CRAFT_RISKS_REQUIRED",
      "creative_review.craft_risks",
      "At least two concrete medium-specific craft risks are required",
    );
  }

  if (meaningfulList(review.finishing_requirements, 20).length < 2) {
    push(
      failures,
      "CREATIVE_REVIEW_FINISHING_REQUIREMENTS_REQUIRED",
      "creative_review.finishing_requirements",
      "At least two concrete finishing requirements are required",
    );
  }

  if (meaningfulList(review.repair_before_production, 1).length) {
    push(
      failures,
      "CREATIVE_REVIEW_REPAIR_REMAINS",
      "creative_review.repair_before_production",
      "A plan cannot pass while direction-level repairs remain unresolved",
      review.repair_before_production,
    );
  }

  return thresholds;
}

function validateProductionCapabilities(plan, available, failures) {
  const index = capabilityIndex(available);
  if (!index.size) {
    push(
      failures,
      "PRODUCTION_CAPABILITY_CONTEXT_REQUIRED",
      "available_production_capabilities",
      "Creative planning requires the organization's enabled Service Runtime capability context",
    );
    return;
  }

  for (const [deliverableIndex, deliverable] of list(plan.deliverables).entries()) {
    for (const [stepIndex, step] of list(deliverable.production_steps).entries()) {
      validateCapabilityPair(
        step.service,
        step.capability,
        `deliverables.${deliverableIndex}.production_steps.${stepIndex}`,
        index,
        failures,
      );
    }
  }

  for (const [stepIndex, step] of list(
    plan.production?.cross_deliverable_steps,
  ).entries()) {
    validateCapabilityPair(
      step.service,
      step.capability,
      `production.cross_deliverable_steps.${stepIndex}`,
      index,
      failures,
    );
  }

  for (const [sceneIndex, scene] of list(plan.scenes).entries()) {
    for (const [shotIndex, shot] of list(scene.shots).entries()) {
      const generation = object(shot.generation);
      if (generation.required !== true) continue;
      validateCapabilityPair(
        generation.service,
        generation.capability,
        `scenes.${sceneIndex}.shots.${shotIndex}.generation`,
        index,
        failures,
      );
    }
  }
}

function validateTemporalCouncil(plan, failures) {
  const council = object(plan.concept_council);
  if (council.contract !== "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1") {
    push(
      failures,
      "TEMPORAL_INDEPENDENT_CONCEPT_COUNCIL_REQUIRED",
      "concept_council",
      "Final temporal direction requires an independent concept council before production",
    );
    return;
  }

  const selection = object(council.selection);
  const card = object(selection.selected_scorecard);
  const weighted = finite(card.weighted_score);
  if (weighted === null || weighted < 90) {
    push(
      failures,
      "TEMPORAL_CONCEPT_COUNCIL_SCORE_BELOW_STANDARD",
      "concept_council.selection.selected_scorecard.weighted_score",
      "Selected temporal concept requires a weighted independent-critic score of at least 90",
      card.weighted_score,
    );
  }

  if (finite(selection.confidence) === null || finite(selection.confidence) < 90) {
    push(
      failures,
      "TEMPORAL_CONCEPT_COUNCIL_CONFIDENCE_BELOW_STANDARD",
      "concept_council.selection.confidence",
      "Executive concept selection confidence must be at least 90",
      selection.confidence,
    );
  }
}

export function validateCreativeMasterPlanDecision({
  plan,
  available_capabilities = [],
  require_temporal_council = false,
} = {}) {
  const failures = [];
  const normalized = object(plan);

  validateConceptDepth(normalized, failures);
  const thresholds = validateCreativeReview(normalized, failures);
  validateProductionCapabilities(
    normalized,
    available_capabilities,
    failures,
  );

  if (
    require_temporal_council &&
    text(normalized.workflow_kind).toUpperCase() === "TEMPORAL"
  ) {
    validateTemporalCouncil(normalized, failures);
  }

  return {
    contract: CONTRACT,
    passed: failures.length === 0,
    workflow_kind: text(normalized.workflow_kind).toUpperCase() || null,
    review_thresholds: thresholds,
    capability_service_count: capabilityIndex(available_capabilities).size,
    temporal_council_required: require_temporal_council === true,
    failures,
  };
}

export function assertCreativeMasterPlanDecision(input = {}) {
  const validation = validateCreativeMasterPlanDecision(input);
  if (!validation.passed) {
    const codes = [...new Set(validation.failures.map((failure) => failure.code))];
    // A bare code list ("PRODUCTION_SERVICE_NOT_ENABLED") does not say which
    // service was rejected, so every diagnosis cost another paid reasoning run.
    // The path and rejected value now travel with the error.
    const detail = validation.failures
      .slice(0, 8)
      .map((failure) => {
        const path = String(failure.path ?? "?");
        const evidence =
          failure.evidence === undefined || failure.evidence === null
            ? ""
            : `=${String(
                typeof failure.evidence === "object"
                  ? JSON.stringify(failure.evidence)
                  : failure.evidence,
              ).slice(0, 60)}`;
        return `${failure.code}@${path}${evidence}`;
      })
      .join("; ");

    const error = new Error(
      `CREATIVE_MASTER_PLAN_DECISION_GATE_FAILED:${codes.join(",")}${
        detail ? ` :: ${detail}` : ""
      }`,
    );
    error.validation = validation;
    throw error;
  }
  return validation;
}

export const CreativeMasterPlanDecisionGate = Object.freeze({
  contract: CONTRACT,
  validate: validateCreativeMasterPlanDecision,
  assert: assertCreativeMasterPlanDecision,
});
