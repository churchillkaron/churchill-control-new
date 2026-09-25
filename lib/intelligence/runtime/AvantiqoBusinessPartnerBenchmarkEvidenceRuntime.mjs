import fs from "node:fs";

import {
  BUSINESS_PARTNER_QUALITY_DIMENSIONS,
  BUSINESS_PARTNER_REFERENCE_FAMILIES,
  evaluateBusinessPartnerBenchmarkFloor,
} from "./AvantiqoBusinessPartnerBenchmarkFloorRuntime.mjs";

export const AVANTIQO_BUSINESS_PARTNER_BENCHMARK_EVIDENCE_CONTRACT =
  "AVANTIQO_BUSINESS_PARTNER_BENCHMARK_EVIDENCE_V1";
export const MAX_BUSINESS_PARTNER_BENCHMARK_AGE_DAYS = 7;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function ageDays(value, nowMs = Date.now()) {
  const time = Date.parse(text(value, 120));
  if (!Number.isFinite(time)) return null;
  return (Number(nowMs) - time) / 86400000;
}
function completeDimensions(scores = {}) {
  return BUSINESS_PARTNER_QUALITY_DIMENSIONS.every(
    (dimension) => finite(scores[dimension]) !== null,
  );
}

export function loadBusinessPartnerBenchmarkSuite(path = "benchmarks/business-partner/suite.v1.json") {
  const suite = JSON.parse(fs.readFileSync(path, "utf8"));
  if (suite.contract !== "AVANTIQO_BUSINESS_PARTNER_BENCHMARK_SUITE_V1") {
    throw new Error("BUSINESS_PARTNER_BENCHMARK_SUITE_CONTRACT_INVALID");
  }
  return suite;
}

export function validateBusinessPartnerBenchmarkSuite(suite = {}) {
  const cases = list(suite.cases);
  const ids = cases.map((item) => text(item.id, 160)).filter(Boolean);
  const categories = new Set(cases.map((item) => text(item.category, 160)).filter(Boolean));
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const dimensionsCovered = new Set(
    cases.flatMap((item) => list(item.requires).map((dimension) => text(dimension, 160))),
  );
  const unknownDimensions = [...dimensionsCovered].filter(
    (dimension) => !BUSINESS_PARTNER_QUALITY_DIMENSIONS.includes(dimension),
  );
  const missingDimensions = BUSINESS_PARTNER_QUALITY_DIMENSIONS.filter(
    (dimension) => !dimensionsCovered.has(dimension),
  );
  const casesWithoutGuardrails = cases
    .filter((item) => !list(item.must_not).length)
    .map((item) => text(item.id, 160));

  const valid =
    suite.matched_conditions_required === true &&
    JSON.stringify(list(suite.reference_families)) === JSON.stringify(BUSINESS_PARTNER_REFERENCE_FAMILIES) &&
    cases.length >= 36 &&
    categories.size >= 10 &&
    duplicateIds.length === 0 &&
    unknownDimensions.length === 0 &&
    missingDimensions.length === 0 &&
    casesWithoutGuardrails.length === 0;

  return {
    valid,
    case_count: cases.length,
    category_count: categories.size,
    duplicate_ids: duplicateIds,
    unknown_dimensions: unknownDimensions,
    missing_dimensions: missingDimensions,
    cases_without_guardrails: casesWithoutGuardrails,
  };
}

function aggregateCaseScores(caseResults = [], suiteCases = []) {
  const byId = new Map(list(caseResults).map((item) => [text(item.case_id, 160), object(item)]));
  const requiredCaseIds = list(suiteCases).map((item) => text(item.id, 160)).filter(Boolean);
  const missing = requiredCaseIds.filter((id) => !byId.has(id));
  const dimensionScores = {};

  for (const dimension of BUSINESS_PARTNER_QUALITY_DIMENSIONS) {
    const relevantCaseIds = list(suiteCases)
      .filter((item) => list(item.requires).includes(dimension))
      .map((item) => text(item.id, 160))
      .filter(Boolean);
    const values = relevantCaseIds
      .map((id) => finite(object(byId.get(id)?.scores)[dimension]))
      .filter((value) => value !== null);

    dimensionScores[dimension] =
      relevantCaseIds.length > 0 && values.length === relevantCaseIds.length
        ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6))
        : null;
  }

  return { scores: dimensionScores, missing_case_ids: missing };
}

export function evaluateBusinessPartnerBenchmarkEvidence({
  report,
  suite = loadBusinessPartnerBenchmarkSuite(),
  now_ms = Date.now(),
} = {}) {
  const source = object(report);
  const suiteValidation = validateBusinessPartnerBenchmarkSuite(suite);
  const suiteCases = list(suite.cases);
  const generatedAgeDays = ageDays(source.generated_at, now_ms);
  const evidenceFresh =
    generatedAgeDays !== null &&
    generatedAgeDays >= 0 &&
    generatedAgeDays <= MAX_BUSINESS_PARTNER_BENCHMARK_AGE_DAYS;

  const candidate = aggregateCaseScores(object(source.candidate).cases, suiteCases);
  const references = {};
  const missingReferenceCases = {};
  for (const family of BUSINESS_PARTNER_REFERENCE_FAMILIES) {
    const aggregate = aggregateCaseScores(object(object(source.references)[family]).cases, suiteCases);
    references[family] = aggregate.scores;
    missingReferenceCases[family] = aggregate.missing_case_ids;
  }

  const matchedConditions =
    source.matched_conditions === true &&
    source.same_case_prompts === true &&
    source.same_evidence_packets === true &&
    source.same_tool_contracts === true &&
    source.hidden_expected_outcomes_not_exposed === true;

  const floor = evaluateBusinessPartnerBenchmarkFloor({
    candidate: candidate.scores,
    references,
    evidenceFresh,
    matchedConditions,
  });

  const completeCaseEvidence =
    candidate.missing_case_ids.length === 0 &&
    BUSINESS_PARTNER_REFERENCE_FAMILIES.every(
      (family) => missingReferenceCases[family].length === 0,
    );

  const valid =
    source.contract === AVANTIQO_BUSINESS_PARTNER_BENCHMARK_EVIDENCE_CONTRACT &&
    suiteValidation.valid &&
    completeCaseEvidence &&
    matchedConditions &&
    evidenceFresh &&
    completeDimensions(candidate.scores) &&
    BUSINESS_PARTNER_REFERENCE_FAMILIES.every((family) => completeDimensions(references[family])) &&
    floor.release_eligible === true;

  return {
    contract: AVANTIQO_BUSINESS_PARTNER_BENCHMARK_EVIDENCE_CONTRACT,
    valid,
    release_eligible: valid,
    suite_validation: suiteValidation,
    generated_at: text(source.generated_at, 120) || null,
    evidence_age_days: generatedAgeDays,
    evidence_fresh: evidenceFresh,
    matched_conditions: matchedConditions,
    complete_case_evidence: completeCaseEvidence,
    missing_candidate_cases: candidate.missing_case_ids,
    missing_reference_cases: missingReferenceCases,
    candidate_scores: candidate.scores,
    reference_scores: references,
    floor,
  };
}

export default Object.freeze({
  contract: AVANTIQO_BUSINESS_PARTNER_BENCHMARK_EVIDENCE_CONTRACT,
  max_age_days: MAX_BUSINESS_PARTNER_BENCHMARK_AGE_DAYS,
  loadSuite: loadBusinessPartnerBenchmarkSuite,
  validateSuite: validateBusinessPartnerBenchmarkSuite,
  evaluateEvidence: evaluateBusinessPartnerBenchmarkEvidence,
});
