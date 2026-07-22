const REQUIRED_SCORE_KEYS = [
  "brief_accuracy",
  "identity_fidelity",
  "venue_fidelity",
  "brand_product_fidelity",
  "composition_camera",
  "lighting",
  "realism_anatomy",
  "emotional_readability",
  "technical_quality",
  "commercial_craft",
];

const SCORE_ALIASES = {
  brief_accuracy: [
    "brief_accuracy",
    "specification_accuracy",
    "creative_brief_accuracy",
  ],
  identity_fidelity: [
    "identity_fidelity",
    "subject_identity_fidelity",
    "people_fidelity",
  ],
  venue_fidelity: [
    "venue_fidelity",
    "location_fidelity",
    "architecture_fidelity",
  ],
  brand_product_fidelity: [
    "brand_product_fidelity",
    "brand_fidelity",
    "product_fidelity",
    "logo_fidelity",
  ],
  composition_camera: [
    "composition_camera",
    "composition",
    "camera_accuracy",
    "framing",
  ],
  lighting: [
    "lighting",
    "lighting_accuracy",
    "lighting_quality",
  ],
  realism_anatomy: [
    "realism_anatomy",
    "physical_realism",
    "anatomy",
    "realism",
  ],
  emotional_readability: [
    "emotional_readability",
    "performance",
    "emotion",
  ],
  technical_quality: [
    "technical_quality",
    "image_quality",
    "finish_quality",
  ],
  commercial_craft: [
    "commercial_craft",
    "production_value",
    "art_direction",
    "world_class_quality",
  ],
};

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, number));
}

function normalizeList(value) {
  return Array.isArray(value)
    ? value.filter(Boolean).map(String)
    : [];
}

function findScore(scores = {}, aliases = []) {
  for (const alias of aliases) {
    const score = clampScore(scores?.[alias]);
    if (score !== null) return score;
  }
  return null;
}

function normalizedScores(scores = {}) {
  const result = {};

  for (const key of REQUIRED_SCORE_KEYS) {
    result[key] = findScore(scores, SCORE_ALIASES[key]);
  }

  return result;
}

function average(values = []) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function criticalFailureCeiling(count) {
  if (count >= 4) return 10;
  if (count === 3) return 20;
  if (count === 2) return 30;
  if (count === 1) return 49;
  return 100;
}

function issueCeiling(count) {
  if (count >= 8) return 30;
  if (count >= 6) return 40;
  if (count >= 4) return 60;
  if (count >= 2) return 75;
  if (count === 1) return 84;
  return 100;
}

function semanticFailureCeiling(text = "") {
  const corpus = String(text || "").toLowerCase();

  if (
    /wrong (person|identity|venue|location|brand|product|logo|architecture|subject)|unrelated|generic stock|does not resemble|unrecognizable|identity drift|face morph|broken anatomy|deformed|extra (finger|limb)|missing (finger|limb)|misspelled (logo|brand|text)|invented architecture|fake text|watermark/.test(corpus)
  ) {
    return 10;
  }

  if (
    /does not match|materially contradict|major mismatch|incorrect identity|incorrect venue|incorrect product|incorrect branding|missing required subject|wrong framing|wrong camera|physically impossible/.test(corpus)
  ) {
    return 25;
  }

  return 100;
}

function hardGateFailures(scores = {}) {
  const thresholds = {
    brief_accuracy: 90,
    identity_fidelity: 95,
    venue_fidelity: 95,
    brand_product_fidelity: 95,
    realism_anatomy: 95,
    technical_quality: 90,
    commercial_craft: 90,
  };

  return Object.entries(thresholds)
    .filter(([key, threshold]) => (
      scores[key] === null || scores[key] < threshold
    ))
    .map(([key, threshold]) => ({
      key,
      score: scores[key],
      threshold,
    }));
}

export function calibrateMasterStillQualityReview(
  review = {},
  {
    minimum_score = 90,
  } = {},
) {
  const reportedScore = clampScore(review.overall_score) ?? 0;
  const criticalFailures = normalizeList(review.critical_failures);
  const issues = normalizeList(review.issues);
  const corrections = normalizeList(review.correction_instructions);
  const scores = normalizedScores(review.scores || {});
  const availableScores = Object.values(scores).filter(
    (value) => value !== null,
  );
  const missingScores = REQUIRED_SCORE_KEYS.filter(
    (key) => scores[key] === null,
  );
  const lowestDimension = availableScores.length
    ? Math.min(...availableScores)
    : null;
  const dimensionAverage = average(availableScores);
  const corpus = [
    ...criticalFailures,
    ...issues,
    ...corrections,
  ].join("\n");

  const ceilings = {
    critical_failures: criticalFailureCeiling(criticalFailures.length),
    issues: issueCeiling(issues.length),
    semantic_failures: semanticFailureCeiling(corpus),
    lowest_dimension:
      lowestDimension === null
        ? 49
        : Math.min(100, lowestDimension + 10),
    score_completeness: missingScores.length ? 49 : 100,
  };

  const scoreCeiling = Math.min(...Object.values(ceilings));
  const candidateScores = [
    reportedScore,
    scoreCeiling,
  ];

  if (dimensionAverage !== null) {
    candidateScores.push(dimensionAverage);
  }

  const calibratedScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(Math.min(...candidateScores)),
    ),
  );
  const gateFailures = hardGateFailures(scores);
  const passed =
    review.passed === true &&
    calibratedScore >= Number(minimum_score || 90) &&
    criticalFailures.length === 0 &&
    missingScores.length === 0 &&
    gateFailures.length === 0;

  const calibrationReasons = [];

  if (criticalFailures.length) {
    calibrationReasons.push(
      `${criticalFailures.length}_CRITICAL_FAILURES_CAP_${ceilings.critical_failures}`,
    );
  }
  if (issues.length) {
    calibrationReasons.push(
      `${issues.length}_ISSUES_CAP_${ceilings.issues}`,
    );
  }
  if (ceilings.semantic_failures < 100) {
    calibrationReasons.push(
      `SEMANTIC_FAILURE_CAP_${ceilings.semantic_failures}`,
    );
  }
  if (missingScores.length) {
    calibrationReasons.push(
      `MISSING_DIMENSION_SCORES:${missingScores.join(",")}`,
    );
  }
  if (gateFailures.length) {
    calibrationReasons.push(
      `HARD_GATE_FAILURES:${gateFailures.map((failure) => failure.key).join(",")}`,
    );
  }

  return {
    ...review,
    passed,
    reported_overall_score: reportedScore,
    overall_score: calibratedScore,
    minimum_score: Number(minimum_score || 90),
    scores,
    score_ceiling: scoreCeiling,
    score_ceilings: ceilings,
    lowest_dimension_score: lowestDimension,
    dimension_average:
      dimensionAverage === null
        ? null
        : Math.round(dimensionAverage),
    missing_dimension_scores: missingScores,
    hard_gate_failures: gateFailures,
    calibration_reasons: calibrationReasons,
    calibration_contract: "absolute_world_class_master_still_v2",
  };
}
