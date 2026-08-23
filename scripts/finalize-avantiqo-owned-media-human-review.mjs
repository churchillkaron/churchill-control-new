import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const INPUT = resolve(
  process.env.AVANTIQO_MEDIA_HUMAN_REVIEW_OUTPUT ||
    "/tmp/avantiqo-owned-media-human-review.json",
);
const OUTPUT = resolve(
  process.env.AVANTIQO_MEDIA_CERTIFICATION_EVIDENCE_OUTPUT ||
    "/tmp/avantiqo-owned-media-certification-evidence.json",
);

const CRITICAL = new Set([
  "source_identity_preserved",
  "reference_identity_preserved",
  "identity_and_geometry_preserved",
  "identity_and_geometry_continuity",
  "opening_endpoint_fidelity",
  "closing_endpoint_fidelity",
  "exact_source_tail_continuity",
  "extension_identity_continuity",
  "phoneme_viseme_sync",
  "facial_identity_preserved",
  "temporal_face_stability",
]);

function text(value) {
  return String(value ?? "").trim();
}

function validIso(value) {
  const normalized = text(value);
  return normalized && Number.isFinite(Date.parse(normalized));
}

const review = JSON.parse(await readFile(INPUT, "utf8"));
if (review?.contract !== "AVANTIQO_OWNED_MEDIA_HUMAN_REVIEW_V1") {
  throw new Error("AVANTIQO_MEDIA_HUMAN_REVIEW_CONTRACT_INVALID");
}
if (review?.capability_count !== 15 || !Array.isArray(review.items) || review.items.length !== 15) {
  throw new Error("AVANTIQO_MEDIA_HUMAN_REVIEW_CAPABILITY_COUNT_INVALID");
}
if (review?.activation_allowed !== false || review?.automatic_human_approval_forbidden !== true) {
  throw new Error("AVANTIQO_MEDIA_HUMAN_REVIEW_POLICY_INVALID");
}

const failures = [];
const reviewed = review.items.map((item) => {
  const capability = text(item.capability);
  const reviewer = text(item.reviewer);
  if (!reviewer) failures.push(`${capability}:REVIEWER_REQUIRED`);
  if (!validIso(item.reviewed_at)) failures.push(`${capability}:REVIEWED_AT_REQUIRED`);
  if (!Array.isArray(item.required_criteria) || item.required_criteria.length === 0) {
    failures.push(`${capability}:CRITERIA_REQUIRED`);
  }

  const criteria = (item.required_criteria || []).map((entry) => {
    const criterion = text(entry.criterion);
    const score = Number(entry.score_0_100);
    const minimum = CRITICAL.has(criterion)
      ? Number(item.critical_identity_or_endpoint_minimum || 90)
      : Number(item.minimum_score_per_criterion || 86);
    const passed =
      text(entry.status).toUpperCase() === "PASS" &&
      Number.isFinite(score) &&
      score >= minimum &&
      score <= 100 &&
      text(entry.evidence_note).length >= 8;
    if (!passed) failures.push(`${capability}:${criterion || "UNKNOWN"}:FAILED`);
    return { criterion, score, minimum, passed };
  });

  const passed =
    item.mechanical_passed === true &&
    criteria.length > 0 &&
    criteria.every((entry) => entry.passed);
  if (!passed) failures.push(`${capability}:HUMAN_QUALITY_FAILED`);
  return {
    capability,
    reviewer,
    reviewed_at: item.reviewed_at || null,
    output_storage_reference: item.output_storage_reference || null,
    economics: item.economics || null,
    criteria,
    human_quality_passed: passed,
  };
});

if (failures.length) {
  throw new Error(`AVANTIQO_MEDIA_HUMAN_REVIEW_INCOMPLETE:${failures.join(",")}`);
}

const evidence = {
  contract: "AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_V1",
  generated_at: new Date().toISOString(),
  source_review_contract: review.contract,
  source_scope: "BENCHMARK_ONLY",
  capability_count: reviewed.length,
  mechanically_certified_for_review: true,
  economics_evidence_complete: reviewed.every(
    (item) => item.economics?.rate_configured === true &&
      Number.isFinite(item.economics?.estimated_supplier_compute_cost_usd),
  ),
  human_quality_certified: reviewed.every((item) => item.human_quality_passed),
  capabilities: reviewed,
  production_certified: false,
  pricing_status: "NOT_PRODUCTION_CERTIFIED",
  activation_allowed: false,
  provider_selection_changed: false,
  pricing_activation_performed: false,
  final_certification_required: true,
  final_certification_requirements: {
    model_license_gate: true,
    capability_specific_quality_evidence: true,
    economics_evidence: true,
    explicit_pricing_status_promotion: true,
    explicit_provider_certification_promotion: true,
    automatic_activation_forbidden: true,
  },
};

if (!evidence.economics_evidence_complete || !evidence.human_quality_certified) {
  throw new Error("AVANTIQO_MEDIA_CERTIFICATION_EVIDENCE_NOT_COMPLETE");
}

await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  output_path: OUTPUT,
  capability_count: evidence.capability_count,
  human_quality_certified: evidence.human_quality_certified,
  economics_evidence_complete: evidence.economics_evidence_complete,
  production_certified: false,
  activation_allowed: false,
}, null, 2));
