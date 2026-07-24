import {
  runAIService,
} from "@/lib/platform/service-runtime/ai";

import {
  CreativeVisualEvidenceBoardRuntime,
} from "@/lib/creative/quality/runtime/CreativeVisualEvidenceBoardRuntime";

function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    const match = String(value).match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, number));
}

function normalizeReview(
  source = {},
  minimumScore = 90,
  evidence = {},
) {
  const requiredDimensions = [
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
  const aliases = {
    brief_accuracy: ["brief_accuracy"],
    identity_fidelity: ["identity_fidelity"],
    venue_fidelity: ["venue_fidelity"],
    brand_product_fidelity: [
      "brand_product_fidelity",
      "brand_fidelity",
      "product_fidelity",
    ],
    composition_camera: ["composition_camera", "composition"],
    lighting: ["lighting"],
    realism_anatomy: [
      "realism_anatomy",
      "physical_reality",
      "anatomy",
    ],
    emotional_readability: ["emotional_readability"],
    technical_quality: ["technical_quality"],
    commercial_craft: ["commercial_craft"],
  };
  const scores = {};

  for (const dimension of requiredDimensions) {
    const candidates = aliases[dimension] || [dimension];
    let resolved = null;

    for (const candidate of candidates) {
      const score = normalizeScore(source.scores?.[candidate]);
      if (score !== null) {
        resolved = score;
        break;
      }
    }

    scores[dimension] = resolved;
  }

  const missingDimensions = requiredDimensions.filter(
    (dimension) => scores[dimension] === null,
  );
  const values = requiredDimensions
    .map((dimension) => scores[dimension])
    .filter((value) => value !== null);
  const declaredOverall = normalizeScore(source.overall_score);
  const overall = declaredOverall ?? (
    values.length
      ? values.reduce((total, value) => total + value, 0) /
        values.length
      : 0
  );
  const criticalFailures = Array.isArray(source.critical_failures)
    ? source.critical_failures.filter(Boolean)
    : [];
  const hardFidelityDimensions = [
    "identity_fidelity",
    "venue_fidelity",
    "brand_product_fidelity",
    "realism_anatomy",
    "technical_quality",
  ];
  const hardFidelityPassed = hardFidelityDimensions.every(
    (dimension) =>
      scores[dimension] !== null &&
      scores[dimension] >= Number(minimumScore || 90),
  );
  const passed = Boolean(
    source.passed === true &&
    evidence.evidence_board_created === true &&
    evidence.reference_count > 0 &&
    missingDimensions.length === 0 &&
    overall >= Number(minimumScore || 90) &&
    hardFidelityPassed &&
    criticalFailures.length === 0,
  );

  return {
    passed,
    overall_score: Math.round(overall * 100) / 100,
    minimum_score: Number(minimumScore || 90),
    scores,
    missing_dimensions: missingDimensions,
    critical_failures: criticalFailures,
    issues: Array.isArray(source.issues)
      ? source.issues.filter(Boolean)
      : [],
    correction_instructions:
      Array.isArray(source.correction_instructions)
        ? source.correction_instructions.filter(Boolean)
        : [],
    evidence: {
      ...(source.evidence || {}),
      visual_evidence_board: evidence,
    },
    reviewed_at: new Date().toISOString(),
    reviewer_version: "creative-visual-qa-v2-reference-board",
  };
}

export const CreativeQualityControlRuntime = {
  async inspectImage({
    organization_id,
    image_url,
    specification = {},
    reference_assets = [],
    minimum_score = 90,
  } = {}) {
    if (!organization_id) {
      throw new Error("organization_id required");
    }
    if (!image_url) {
      throw new Error("image_url required for visual quality control");
    }

    const evidence = await CreativeVisualEvidenceBoardRuntime.prepare({
      generated_image: image_url,
      assets: reference_assets,
    });

    if (!evidence.evidence_board_created || !evidence.reference_count) {
      const error = new Error("CREATIVE_QA_VISUAL_REFERENCES_REQUIRED");
      error.code = "CREATIVE_QA_VISUAL_REFERENCES_REQUIRED";
      error.details = evidence;
      throw error;
    }

    const execution = await runAIService.execute({
      organization_id,
      service_id: "ai.image.analyze",
      operation: "CREATIVE_MASTER_STILL_QA",
      input: {
        image: evidence.image,
        mode: "creative_master_still_qa",
        minimum_score: Number(minimum_score || 90),
        prompt: `
The supplied image is a labelled visual evidence board.
The large first panel is the GENERATED MASTER STILL under review.
Every lower panel is an ORIGINAL REFERENCE IMAGE with its role.
Compare the pixels directly. Do not infer fidelity from filenames, URLs or written claims.

Judge the generated frame against this production specification:
${JSON.stringify(specification)}

Return strict JSON only with:
- passed
- overall_score
- scores containing exactly: brief_accuracy, identity_fidelity, venue_fidelity, brand_product_fidelity, composition_camera, lighting, realism_anatomy, emotional_readability, technical_quality, commercial_craft
- critical_failures
- issues
- correction_instructions
- evidence

Use an absolute professional scale. A wrong identity, wrong venue, invented architecture, pasted rectangle, cropped body, broken anatomy, fake text, incorrect brand mark, disconnected lighting or generic unrelated image is a critical failure and must score below 50.
Set passed true only when every dimension is present, the overall score and all hard-fidelity dimensions meet ${Number(minimum_score || 90)}, and there are zero critical failures.
        `.trim(),
      },
      metadata: {
        module: "CREATIVE",
        operation: "MASTER_STILL_QA",
        production_contract:
          "atomic_reference_grounded_shots_v1",
        visual_evidence_board: {
          created: evidence.evidence_board_created,
          reference_count: evidence.reference_count,
          manifest: evidence.manifest,
        },
      },
      category: "AI",
    });

    const review = parseJson(
      execution?.output?.json ||
      execution?.output?.text ||
      execution?.output?.output?.json ||
      execution?.output?.output?.text,
    );

    if (!review) {
      const error = new Error("CREATIVE_QA_INVALID_RESPONSE");
      error.code = "CREATIVE_QA_INVALID_RESPONSE";
      throw error;
    }

    const normalized = normalizeReview(
      review,
      Number(minimum_score || 90),
      {
        evidence_board_created: evidence.evidence_board_created,
        reference_count: evidence.reference_count,
        manifest: evidence.manifest,
      },
    );

    if (!normalized.passed) {
      const error = new Error("MASTER_STILL_QUALITY_REJECTED");
      error.code = "MASTER_STILL_QUALITY_REJECTED";
      error.quality_review = normalized;
      throw error;
    }

    return normalized;
  },
};
