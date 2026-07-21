import {
  runAIService,
} from "@/lib/platform/service-runtime/ai";

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
  const number = Number(value || 0);
  return Math.max(0, Math.min(100, number));
}

function normalizeReview(source = {}, minimumScore = 90) {
  const scores = {
    identity_fidelity: normalizeScore(source.scores?.identity_fidelity),
    product_fidelity: normalizeScore(source.scores?.product_fidelity),
    brand_fidelity: normalizeScore(source.scores?.brand_fidelity),
    venue_fidelity: normalizeScore(source.scores?.venue_fidelity),
    anatomy: normalizeScore(source.scores?.anatomy),
    physical_reality: normalizeScore(source.scores?.physical_reality),
    composition: normalizeScore(source.scores?.composition),
    lighting: normalizeScore(source.scores?.lighting),
    continuity: normalizeScore(source.scores?.continuity),
    technical_quality: normalizeScore(source.scores?.technical_quality),
  };
  const values = Object.values(scores);
  const overall = normalizeScore(
    source.overall_score ||
    values.reduce((total, value) => total + value, 0) /
      Math.max(values.length, 1),
  );
  const criticalFailures = Array.isArray(source.critical_failures)
    ? source.critical_failures.filter(Boolean)
    : [];
  const passed =
    source.passed === true &&
    overall >= minimumScore &&
    criticalFailures.length === 0;

  return {
    passed,
    overall_score: overall,
    minimum_score: minimumScore,
    scores,
    critical_failures: criticalFailures,
    issues: Array.isArray(source.issues)
      ? source.issues.filter(Boolean)
      : [],
    correction_instructions:
      Array.isArray(source.correction_instructions)
        ? source.correction_instructions.filter(Boolean)
        : [],
    evidence: source.evidence || {},
    reviewed_at: new Date().toISOString(),
    reviewer_version: "creative-visual-qa-v1",
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

    const execution = await runAIService.execute({
      organization_id,
      service_id: "ai.image.analyze",
      operation: "CREATIVE_MASTER_STILL_QA",
      input: {
        image: image_url,
        prompt: `
Act as a strict senior commercial-film visual quality supervisor.
Inspect the supplied generated master still against the exact shot specification and reference contract.
Do not reward generic beauty. Judge whether the frame is production-ready and truthful.

SHOT SPECIFICATION:
${JSON.stringify(specification)}

REFERENCE ASSETS:
${JSON.stringify(reference_assets)}

Return strict JSON only with this shape:
{
  "passed": boolean,
  "overall_score": number,
  "scores": {
    "identity_fidelity": number,
    "product_fidelity": number,
    "brand_fidelity": number,
    "venue_fidelity": number,
    "anatomy": number,
    "physical_reality": number,
    "composition": number,
    "lighting": number,
    "continuity": number,
    "technical_quality": number
  },
  "critical_failures": ["string"],
  "issues": ["string"],
  "correction_instructions": ["specific generator correction"],
  "evidence": {}
}

A critical failure includes identity drift, altered product or logo, invented venue architecture, broken anatomy, impossible physical interaction, unreadable subject hierarchy, fake text, severe artifacts, or continuity contradiction.
Set passed true only when the image is safe to use as the approved first frame for motion generation.
`,
      },
      metadata: {
        module: "CREATIVE",
        operation: "MASTER_STILL_QA",
        production_contract:
          "atomic_reference_grounded_shots_v1",
      },
      category: "AI",
    });

    const review = parseJson(
      execution?.output?.json ||
      execution?.output?.text ||
      execution?.output?.output?.text,
    );

    if (!review) {
      throw new Error("Visual quality supervisor returned invalid JSON");
    }

    return normalizeReview(
      review,
      Number(minimum_score || 90),
    );
  },
};
