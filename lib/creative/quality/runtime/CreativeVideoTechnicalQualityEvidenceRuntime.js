const CONTRACT = "CREATIVE_VIDEO_TECHNICAL_QUALITY_V2";
const TEMPORAL_CONTRACT = "CREATIVE_VIDEO_TEMPORAL_EVIDENCE_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function missingEvidence(candidate = {}) {
  return {
    contract: CONTRACT,
    asset_node_id: candidate.id || null,
    shot_id: text(candidate.metadata?.shot_id) || null,
    passed: false,
    failed_checks: ["persisted_technical_evidence_missing"],
    repair_instructions: [
      "Run deterministic Video technical and temporal inspection on the exact generated master before finalisation.",
    ],
    checks: [],
    technical: {},
    temporal_evidence: {},
    reused: true,
    evidence_source: "PERSISTED_DETERMINISTIC_VIDEO_EVIDENCE",
  };
}

function verify(candidate = {}) {
  const metadata = object(candidate.metadata);
  const technical = object(candidate.technical);
  const temporal = object(technical.temporal_evidence);

  if (metadata.video_technical_quality_contract !== CONTRACT) {
    return missingEvidence(candidate);
  }

  const failedChecks = list(metadata.video_technical_quality_failed_checks);
  const checks = list(metadata.video_technical_quality_checks);
  const failures = [];

  if (!text(candidate.url)) failures.push("candidate_media_url_missing");
  if (
    text(metadata.video_technical_quality_source_url) !== text(candidate.url)
  ) {
    failures.push("persisted_technical_evidence_source_mismatch");
  }
  if (temporal.contract !== TEMPORAL_CONTRACT || temporal.evidence_ready !== true) {
    failures.push("persisted_temporal_evidence_missing");
  }
  if (typeof metadata.video_technical_quality_passed !== "boolean") {
    failures.push("persisted_technical_evidence_result_missing");
  }
  if (!checks.length) failures.push("persisted_technical_checks_missing");
  if (checks.some((item) => object(item).status === "FAIL")) {
    failures.push("persisted_technical_checks_failed");
  }
  if (metadata.video_technical_quality_passed === true && failedChecks.length) {
    failures.push("persisted_technical_evidence_inconsistent");
  }

  const combinedFailures = unique([
    ...failedChecks,
    ...failures,
  ]);
  const passed =
    metadata.video_technical_quality_passed === true &&
    combinedFailures.length === 0;

  return {
    contract: CONTRACT,
    asset_node_id: candidate.id || null,
    shot_id: text(metadata.shot_id) || null,
    passed,
    failed_checks: combinedFailures,
    repair_instructions: unique([
      ...list(metadata.video_technical_quality_repair_instructions),
      ...(!passed && !metadata.video_technical_quality_repair_instructions?.length
        ? ["Regenerate or re-inspect the exact Video master and persist deterministic technical evidence before finalisation."]
        : []),
    ]),
    checks,
    technical: object(metadata.video_technical_quality_technical),
    temporal_evidence: temporal,
    reused: true,
    evidence_source: "PERSISTED_DETERMINISTIC_VIDEO_EVIDENCE",
  };
}

export const CreativeVideoTechnicalQualityEvidenceRuntime = Object.freeze({
  contract: CONTRACT,
  temporal_contract: TEMPORAL_CONTRACT,
  verify,
});
