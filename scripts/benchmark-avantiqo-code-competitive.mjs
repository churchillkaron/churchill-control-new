import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyCodeAICompetitiveReferenceReport } from "../lib/code/runtime/CodeAICompetitiveReferenceAttestationRuntime.js";
import { verifyCodeAICompetitiveOwnedReport } from "../lib/code/runtime/CodeAICompetitiveOwnedAttestationRuntime.js";
import { assessCodeAIRepositoryTaskBenchmark } from "../lib/code/runtime/CodeAIRepositoryTaskBenchmarkRuntime.js";
import { verifyCodeAIRepositoryReferenceReport } from "../lib/code/runtime/CodeAIRepositoryReferenceAttestationRuntime.js";
import { verifyCodeAIRepositoryOwnedReport } from "../lib/code/runtime/CodeAIRepositoryOwnedAttestationRuntime.js";

const CONTRACT = "AVANTIQO_CODE_COMPETITIVE_BENCHMARK_V1";
const DEFAULT_OWNED = "/tmp/avantiqo-code-certification-benchmark.json";
const DEFAULT_OUTPUT = "/tmp/avantiqo-code-competitive-benchmark.json";
const DEFAULT_SUITE = "benchmarks/avantiqo-code-frontier-engineering-suite.json";
const DEFAULT_PROMPT_CONTRACT = "benchmarks/avantiqo-code-frontier-prompt-contract.json";
const DEFAULT_REPOSITORY_SUITE = "benchmarks/avantiqo-code-executable-repository-suite.json";
const SUITE_CONTRACT = "AVANTIQO_CODE_FRONTIER_ENGINEERING_SUITE_V1";
const PROMPT_CONTRACT = "AVANTIQO_CODE_FRONTIER_PROMPT_CONTRACT_V1";
const REPOSITORY_SUITE_CONTRACT = "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_SUITE_V1";
const MIN_CASES = 20;
const MAX_REFERENCE_AGE_DAYS = 30;
const MAX_CROSS_EVIDENCE_SKEW_HOURS = 24;
const MIN_NON_LOSS_RATE = 0.95;
const MIN_NARRATIVE_GROUNDING_SCORE = 0.5;
const MIN_EVIDENCE_DISTINCTNESS_SCORE = 0.25;
const MIN_TEMPLATE_SIMHASH_HAMMING_DISTANCE = 8;
const MIN_QUALITY_WIN_MARGIN = 0.03;
const MIN_ABSOLUTE_CASE_QUALITY_SCORE = 0.50;
const MIN_ABSOLUTE_MEAN_QUALITY_SCORE = 0.65;
const MIN_SUPERIORITY_WIN_RATE = 0.10;
const MIN_SUPERIORITY_WIN_CATEGORIES = 3;
const MAX_P95_LATENCY_RATIO = 1.25;
const MAX_COST_RATIO = 1.25;
const DEFAULT_REQUIRED_REFERENCE_PROVIDERS = Object.freeze(["openai", "google"]);

const text = (value) => String(value ?? "").trim();
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const list = (value) => Array.isArray(value) ? value : [];
const sha256 = (value) => createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");


function canonicalReferenceProvider(value) {
  const provider = text(value).toLowerCase();
  return provider === "gemini" ? "google" : provider;
}

function requiredReferenceProviders() {
  const configured = text(process.env.AVANTIQO_CODE_COMPETITIVE_REQUIRED_PROVIDERS)
    .split(",")
    .map(canonicalReferenceProvider)
    .filter(Boolean);
  return [...new Set(configured.length ? configured : DEFAULT_REQUIRED_REFERENCE_PROVIDERS)].sort();
}


function requiredReferenceModels(requiredProviders) {
  const raw = text(process.env.AVANTIQO_CODE_COMPETITIVE_REQUIRED_REFERENCE_MODELS);
  if (!raw) throw new Error("AVANTIQO_CODE_COMPETITIVE_REQUIRED_REFERENCE_MODELS_REQUIRED");
  let parsed;
  try { parsed = JSON.parse(raw); } catch {
    throw new Error("AVANTIQO_CODE_COMPETITIVE_REQUIRED_REFERENCE_MODELS_INVALID_JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AVANTIQO_CODE_COMPETITIVE_REQUIRED_REFERENCE_MODELS_INVALID");
  }
  const normalized = {};
  for (const provider of requiredProviders) {
    const model = text(parsed[provider]);
    if (!model) throw new Error(`AVANTIQO_CODE_COMPETITIVE_REQUIRED_REFERENCE_MODEL_MISSING:${provider}`);
    normalized[provider] = model;
  }
  return normalized;
}

function repositoryCaseDefinitionSha256(item) {
  const canonical = {
    case_id: text(item?.case_id),
    title: text(item?.title),
    objective: text(item?.objective),
    seed_files: list(item?.seed_files).map((value) => text(value)),
    candidate_paths: list(item?.candidate_paths).map((value) => text(value)),
    allowed_edit_paths: list(item?.allowed_edit_paths).map((value) => text(value)),
    hidden_acceptance: item?.hidden_acceptance && typeof item.hidden_acceptance === "object" && !Array.isArray(item.hidden_acceptance)
      ? item.hidden_acceptance
      : {},
  };
  return sha256(JSON.stringify(canonical));
}

function exactObservationIds(report, requiredCaseIds) {
  const ids = list(report?.observations).map((item) => text(item?.case_id)).filter(Boolean).sort();
  return ids.length === requiredCaseIds.length && ids.every((id, index) => id === requiredCaseIds[index]);
}

function percentile(values, p) {
  const safe = values.map(finite).filter((value) => value !== null).sort((a, b) => a - b);
  if (!safe.length) return null;
  const index = Math.min(safe.length - 1, Math.max(0, Math.ceil(p * safe.length) - 1));
  return safe[index];
}

function qualityFloor(report) {
  const passed = list(report?.observations).filter((item) => item?.passed === true);
  const scores = passed.map((item) => finite(item?.quality_score));
  const complete = passed.length > 0 && scores.length === passed.length && scores.every((score) => score !== null);
  const minimum = complete ? Math.min(...scores) : null;
  const mean = complete ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
  return {
    complete,
    minimum_quality_score: minimum === null ? null : Number(minimum.toFixed(4)),
    mean_quality_score: mean === null ? null : Number(mean.toFixed(4)),
    minimum_case_quality_passed: minimum !== null && minimum >= MIN_ABSOLUTE_CASE_QUALITY_SCORE,
    mean_quality_passed: mean !== null && mean >= MIN_ABSOLUTE_MEAN_QUALITY_SCORE,
  };
}

function hammingDistance64(left, right) {
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (value) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}

function templateFingerprintGate(report, requiredCaseIds) {
  const observations = observationMap(report);
  const rows = requiredCaseIds.map((caseId) => {
    const item = observations.get(caseId);
    if (item?.passed !== true) return null;
    const fingerprint = text(item?.response_template_fingerprint_sha256).toLowerCase();
    const simhash = text(item?.response_template_simhash64).toLowerCase();
    return /^[a-f0-9]{64}$/.test(fingerprint) && /^[a-f0-9]{16}$/.test(simhash)
      ? { case_id: caseId, fingerprint, simhash }
      : null;
  });
  const complete = rows.every(Boolean);
  const valid = rows.filter(Boolean);
  const unique = new Set(valid.map((item) => item.fingerprint)).size === valid.length;
  let minimumHammingDistance = null;
  for (let left = 0; left < valid.length; left += 1) {
    for (let right = left + 1; right < valid.length; right += 1) {
      const distance = hammingDistance64(valid[left].simhash, valid[right].simhash);
      minimumHammingDistance = minimumHammingDistance === null ? distance : Math.min(minimumHammingDistance, distance);
    }
  }
  const sufficientlyDistinct = minimumHammingDistance === null || minimumHammingDistance >= MIN_TEMPLATE_SIMHASH_HAMMING_DISTANCE;
  return {
    complete,
    unique,
    sufficiently_distinct: sufficientlyDistinct,
    passed_case_count: valid.length,
    unique_fingerprint_count: new Set(valid.map((item) => item.fingerprint)).size,
    minimum_simhash_hamming_distance: minimumHammingDistance,
    passed: complete && unique && sufficientlyDistinct,
  };
}

function observationMap(report) {
  return new Map(list(report?.observations).map((item) => [text(item?.case_id), item]).filter(([id]) => id));
}

function totalCost(report) {
  const direct = finite(report?.economics?.estimated_supplier_cost_usd ?? report?.summary?.estimated_api_cost_usd);
  if (direct !== null) return direct;
  const costs = list(report?.observations).map((item) => finite(item?.supplier_cost_usd ?? item?.cost_usd));
  return costs.every((value) => value !== null) && costs.length ? costs.reduce((a, b) => a + b, 0) : null;
}

function generatedAt(report) {
  const raw = text(report?.generated_at || report?.measured_at);
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function providerLabel(report) {
  return {
    provider: text(report?.model?.provider || report?.provider) || "unknown",
    model: text(report?.model?.product_model || report?.model?.runtime_model || report?.model) || "unknown",
  };
}

function compareCase(owned, reference) {
  const ownedPassed = owned?.passed === true;
  const referencePassed = reference?.passed === true;
  const ownedLatency = finite(owned?.wall_ms);
  const referenceLatency = finite(reference?.wall_ms);
  const ownedQuality = finite(owned?.quality_score);
  const referenceQuality = finite(reference?.quality_score);
  const ownedGrounding = finite(owned?.evidence_grounding_score);
  const referenceGrounding = finite(reference?.evidence_grounding_score);
  const ownedNarrativeGrounding = finite(owned?.narrative_grounding_score);
  const referenceNarrativeGrounding = finite(reference?.narrative_grounding_score);
  const ownedEvidenceDistinctness = finite(owned?.evidence_distinctness_score);
  const referenceEvidenceDistinctness = finite(reference?.evidence_distinctness_score);
  const qualityDelta = ownedQuality !== null && referenceQuality !== null
    ? Number((ownedQuality - referenceQuality).toFixed(4))
    : null;
  const qualityOutcome = ownedPassed !== referencePassed
    ? ownedPassed ? "WIN" : "LOSS"
    : ownedPassed && referencePassed && qualityDelta !== null
      ? qualityDelta >= MIN_QUALITY_WIN_MARGIN
        ? "WIN"
        : qualityDelta <= -MIN_QUALITY_WIN_MARGIN
          ? "LOSS"
          : "TIE"
      : "TIE";
  const latencyOutcome = ownedLatency !== null && referenceLatency !== null
    ? referenceLatency === ownedLatency ? "TIE" : ownedLatency < referenceLatency ? "WIN" : "LOSS"
    : "UNKNOWN";
  return {
    case_id: text(owned?.case_id),
    category: text(owned?.category || reference?.category) || null,
    owned_passed: ownedPassed,
    reference_passed: referencePassed,
    owned_wall_ms: ownedLatency,
    reference_wall_ms: referenceLatency,
    owned_quality_score: ownedQuality,
    reference_quality_score: referenceQuality,
    quality_score_delta: qualityDelta,
    owned_evidence_grounding_score: ownedGrounding,
    reference_evidence_grounding_score: referenceGrounding,
    owned_narrative_grounding_score: ownedNarrativeGrounding,
    reference_narrative_grounding_score: referenceNarrativeGrounding,
    owned_evidence_distinctness_score: ownedEvidenceDistinctness,
    reference_evidence_distinctness_score: referenceEvidenceDistinctness,
    quality_outcome: qualityOutcome,
    latency_outcome: latencyOutcome,
    outcome: qualityOutcome,
  };
}

function compareReference(ownedReport, referenceReport, requiredCaseIds) {
  const owned = observationMap(ownedReport);
  const reference = observationMap(referenceReport);
  const ownedIds = [...owned.keys()].sort();
  const referenceIds = [...reference.keys()].sort();
  const exactRequiredOwned = ownedIds.length === requiredCaseIds.length && ownedIds.every((id, index) => id === requiredCaseIds[index]);
  const exactRequiredReference = referenceIds.length === requiredCaseIds.length && referenceIds.every((id, index) => id === requiredCaseIds[index]);
  const sameCases = exactRequiredOwned && exactRequiredReference;
  const comparisons = sameCases ? requiredCaseIds.map((id) => compareCase(owned.get(id), reference.get(id))) : [];
  const ownedTemplateFingerprints = templateFingerprintGate(ownedReport, requiredCaseIds);
  const referenceTemplateFingerprints = templateFingerprintGate(referenceReport, requiredCaseIds);
  const wins = comparisons.filter((item) => item.quality_outcome === "WIN").length;
  const losses = comparisons.filter((item) => item.quality_outcome === "LOSS").length;
  const ties = comparisons.filter((item) => item.quality_outcome === "TIE").length;
  const nonLossRate = comparisons.length ? (wins + ties) / comparisons.length : 0;
  const qualityWinRate = comparisons.length ? wins / comparisons.length : 0;
  const qualityWinCategories = [...new Set(comparisons
    .filter((item) => item.quality_outcome === "WIN" && item.category)
    .map((item) => item.category))].sort();
  const latencyWins = comparisons.filter((item) => item.latency_outcome === "WIN").length;
  const latencyLosses = comparisons.filter((item) => item.latency_outcome === "LOSS").length;
  const latencyTies = comparisons.filter((item) => item.latency_outcome === "TIE").length;
  const ownedPassRate = comparisons.length ? comparisons.filter((item) => item.owned_passed).length / comparisons.length : 0;
  const referencePassRate = comparisons.length ? comparisons.filter((item) => item.reference_passed).length / comparisons.length : 0;
  const qualityScoresComplete = comparisons.every((item) =>
    (!item.owned_passed || (item.owned_quality_score !== null && item.owned_quality_score > 0 && item.owned_quality_score <= 1)) &&
    (!item.reference_passed || (item.reference_quality_score !== null && item.reference_quality_score > 0 && item.reference_quality_score <= 1)),
  );
  const evidenceGroundingComplete = comparisons.every((item) =>
    (!item.owned_passed || (item.owned_evidence_grounding_score !== null && item.owned_evidence_grounding_score > 0 && item.owned_evidence_grounding_score <= 1)) &&
    (!item.reference_passed || (item.reference_evidence_grounding_score !== null && item.reference_evidence_grounding_score > 0 && item.reference_evidence_grounding_score <= 1)),
  );
  const narrativeGroundingComplete = comparisons.every((item) =>
    (!item.owned_passed || (item.owned_narrative_grounding_score !== null && item.owned_narrative_grounding_score >= MIN_NARRATIVE_GROUNDING_SCORE && item.owned_narrative_grounding_score <= 1)) &&
    (!item.reference_passed || (item.reference_narrative_grounding_score !== null && item.reference_narrative_grounding_score >= MIN_NARRATIVE_GROUNDING_SCORE && item.reference_narrative_grounding_score <= 1)),
  );
  const evidenceDistinctnessComplete = comparisons.every((item) =>
    (!item.owned_passed || (item.owned_evidence_distinctness_score !== null && item.owned_evidence_distinctness_score >= MIN_EVIDENCE_DISTINCTNESS_SCORE && item.owned_evidence_distinctness_score <= 1)) &&
    (!item.reference_passed || (item.reference_evidence_distinctness_score !== null && item.reference_evidence_distinctness_score >= MIN_EVIDENCE_DISTINCTNESS_SCORE && item.reference_evidence_distinctness_score <= 1)),
  );
  const ownedP95 = percentile(comparisons.map((item) => item.owned_wall_ms), 0.95);
  const referenceP95 = percentile(comparisons.map((item) => item.reference_wall_ms), 0.95);
  const latencyRatio = ownedP95 !== null && referenceP95 > 0 ? ownedP95 / referenceP95 : null;
  const ownedCost = totalCost(ownedReport);
  const referenceCost = totalCost(referenceReport);
  const costRatio = ownedCost !== null && referenceCost > 0 ? ownedCost / referenceCost : null;
  const referenceTime = generatedAt(referenceReport);
  const ageDays = referenceTime === null ? null : (Date.now() - referenceTime) / 86400000;
  const referenceFresh = ageDays !== null && ageDays >= 0 && ageDays <= MAX_REFERENCE_AGE_DAYS;

  const gates = {
    canonical_suite_exact: sameCases,
    owned_uses_canonical_suite: exactRequiredOwned,
    reference_uses_canonical_suite: exactRequiredReference,
    minimum_case_count: comparisons.length >= MIN_CASES,
    owned_pass_rate_not_worse: ownedPassRate >= referencePassRate,
    owned_quality_non_loss_rate: nonLossRate >= MIN_NON_LOSS_RATE,
    deterministic_quality_scores_complete: qualityScoresComplete,
    case_specific_evidence_grounding_complete: evidenceGroundingComplete,
    case_specific_narrative_grounding_complete: narrativeGroundingComplete,
    distinct_evidence_obligations_complete: evidenceDistinctnessComplete,
    owned_cross_case_templates_unique: ownedTemplateFingerprints.passed,
    reference_cross_case_templates_unique: referenceTemplateFingerprints.passed,
    reference_fresh: referenceFresh,
    p95_latency_competitive: latencyRatio !== null && latencyRatio <= MAX_P95_LATENCY_RATIO,
    cost_competitive: costRatio !== null && costRatio <= MAX_COST_RATIO,
  };

  return {
    reference: providerLabel(referenceReport),
    measured_at: text(referenceReport?.generated_at || referenceReport?.measured_at) || null,
    case_count: comparisons.length,
    wins,
    losses,
    ties,
    quality_non_loss_rate: Number(nonLossRate.toFixed(4)),
    quality_win_rate: Number(qualityWinRate.toFixed(4)),
    quality_win_categories: qualityWinCategories,
    quality_win_category_count: qualityWinCategories.length,
    latency_wins: latencyWins,
    latency_losses: latencyLosses,
    latency_ties: latencyTies,
    owned_pass_rate: Number(ownedPassRate.toFixed(4)),
    reference_pass_rate: Number(referencePassRate.toFixed(4)),
    owned_p95_wall_ms: ownedP95,
    reference_p95_wall_ms: referenceP95,
    p95_latency_ratio: latencyRatio === null ? null : Number(latencyRatio.toFixed(4)),
    owned_cost_usd: ownedCost,
    reference_cost_usd: referenceCost,
    cost_ratio: costRatio === null ? null : Number(costRatio.toFixed(4)),
    reference_age_days: ageDays === null ? null : Number(ageDays.toFixed(2)),
    owned_template_fingerprints: ownedTemplateFingerprints,
    reference_template_fingerprints: referenceTemplateFingerprints,
    gates,
    passed: Object.values(gates).every(Boolean),
    cases: comparisons,
  };
}

const ownedPath = resolve(process.env.AVANTIQO_CODE_COMPETITIVE_OWNED || DEFAULT_OWNED);
const suitePath = resolve(process.env.AVANTIQO_CODE_COMPETITIVE_SUITE || DEFAULT_SUITE);
const promptContractPath = resolve(process.env.AVANTIQO_CODE_COMPETITIVE_PROMPT_CONTRACT || DEFAULT_PROMPT_CONTRACT);
const repositorySuitePath = resolve(process.env.AVANTIQO_CODE_COMPETITIVE_REPOSITORY_SUITE || DEFAULT_REPOSITORY_SUITE);
const ownedRepositoryEvidenceInput = text(process.env.AVANTIQO_CODE_COMPETITIVE_OWNED_REPOSITORY_EVIDENCE);
const referenceRepositoryEvidenceInputs = text(process.env.AVANTIQO_CODE_COMPETITIVE_REFERENCE_REPOSITORY_EVIDENCE)
  .split(",")
  .map((item) => text(item))
  .filter(Boolean);
const separateRepositoryEvidenceRequested = Boolean(ownedRepositoryEvidenceInput || referenceRepositoryEvidenceInputs.length);
if (separateRepositoryEvidenceRequested && (!ownedRepositoryEvidenceInput || !referenceRepositoryEvidenceInputs.length)) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_COMPLETE_REPOSITORY_EVIDENCE_SET_REQUIRED");
}
const referencePaths = text(process.env.AVANTIQO_CODE_COMPETITIVE_REFERENCES)
  .split(",")
  .map((item) => text(item))
  .filter(Boolean)
  .map((item) => resolve(item));
if (!referencePaths.length) throw new Error("AVANTIQO_CODE_COMPETITIVE_REFERENCES_REQUIRED");

const suiteSource = await readFile(suitePath, "utf8");
const suite = JSON.parse(suiteSource);
if (text(suite?.contract) !== SUITE_CONTRACT) throw new Error("AVANTIQO_CODE_COMPETITIVE_SUITE_CONTRACT_INVALID");
const requiredCaseIds = list(suite?.cases).map((item) => text(item?.case_id)).filter(Boolean).sort();
const canonicalCategoryByCase = new Map(list(suite?.cases).map((item) => [text(item?.case_id), text(item?.category)]));
const canonicalEvidenceCountByCase = new Map(list(suite?.cases).map((item) => [
  text(item?.case_id),
  list(item?.required_evidence).map((value) => text(value)).filter(Boolean).length,
]));
if (requiredCaseIds.length < MIN_CASES || new Set(requiredCaseIds).size !== requiredCaseIds.length) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_SUITE_INVALID");
}
const repositorySuiteSource = await readFile(repositorySuitePath, "utf8");
const repositorySuite = JSON.parse(repositorySuiteSource);
if (text(repositorySuite?.contract) !== REPOSITORY_SUITE_CONTRACT) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_REPOSITORY_SUITE_CONTRACT_INVALID");
}
const repositorySuiteSha256 = sha256(repositorySuiteSource);
const requiredRepositoryCaseIds = list(repositorySuite?.cases).map((item) => text(item?.case_id)).filter(Boolean).sort();
const canonicalRepositoryCaseDefinitionById = new Map(list(repositorySuite?.cases).map((item) => [
  text(item?.case_id),
  repositoryCaseDefinitionSha256(item),
]));
if (!requiredRepositoryCaseIds.length || new Set(requiredRepositoryCaseIds).size !== requiredRepositoryCaseIds.length) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_REPOSITORY_SUITE_INVALID");
}
const owned = JSON.parse(await readFile(ownedPath, "utf8"));
if (owned?.summary?.passed !== true || owned?.summary?.complete_suite !== true) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_OWNED_BENCHMARK_MUST_PASS");
}
const ownedRunnerCommit = text(owned?.runner_source_commit);
if (!/^[a-f0-9]{40}$/i.test(ownedRunnerCommit) || text(owned?.runner_ref) !== "main" || owned?.runner_repository_clean !== true) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_OWNED_CURRENT_CLEAN_MAIN_REQUIRED");
}
const suiteSha256 = sha256(suiteSource);
const promptContractSource = await readFile(promptContractPath, "utf8");
const promptContract = JSON.parse(promptContractSource);
if (text(promptContract?.contract) !== PROMPT_CONTRACT) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_PROMPT_CONTRACT_INVALID");
}
const promptContractSha256 = sha256(promptContractSource);
for (const observation of list(owned?.observations)) {
  const caseId = text(observation?.case_id);
  if (!caseId || text(observation?.category) !== canonicalCategoryByCase.get(caseId)) {
    throw new Error(`AVANTIQO_CODE_COMPETITIVE_CANONICAL_CATEGORY_MISMATCH:${caseId || "UNKNOWN"}`);
  }
  if (Number(observation?.evidence_key_count) !== canonicalEvidenceCountByCase.get(caseId)) {
    throw new Error(`AVANTIQO_CODE_COMPETITIVE_CANONICAL_EVIDENCE_COUNT_MISMATCH:${caseId || "UNKNOWN"}`);
  }
}
verifyCodeAICompetitiveOwnedReport(owned, {
  suite_contract: SUITE_CONTRACT,
  suite_sha256: suiteSha256,
  prompt_contract: PROMPT_CONTRACT,
  prompt_contract_sha256: promptContractSha256,
  required_case_ids: requiredCaseIds,
});
if (
  text(owned?.prompt_contract) !== PROMPT_CONTRACT ||
  text(owned?.prompt_contract_sha256).toLowerCase() !== promptContractSha256.toLowerCase()
) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_OWNED_PROMPT_CONTRACT_MISMATCH");
}
const references = await Promise.all(referencePaths.map(async (path) => JSON.parse(await readFile(path, "utf8"))));
const allRunIds = [text(owned?.benchmark_run_id), ...references.map((reference) => text(reference?.benchmark_run_id))];
if (allRunIds.some((runId) => !runId) || new Set(allRunIds).size !== allRunIds.length) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_UNIQUE_BENCHMARK_RUN_IDS_REQUIRED");
}
const ownedMeasuredAt = Date.parse(text(owned?.generated_at));
if (!Number.isFinite(ownedMeasuredAt)) throw new Error("AVANTIQO_CODE_COMPETITIVE_OWNED_MEASURED_AT_REQUIRED");
for (const reference of references) {
  const referenceMeasuredAt = Date.parse(text(reference?.generated_at));
  const skewMs = Math.abs(referenceMeasuredAt - ownedMeasuredAt);
  if (!Number.isFinite(referenceMeasuredAt) || skewMs > MAX_CROSS_EVIDENCE_SKEW_HOURS * 60 * 60 * 1000) {
    throw new Error("AVANTIQO_CODE_COMPETITIVE_CROSS_EVIDENCE_SKEW_EXCEEDED");
  }
}
const requiredProviders = requiredReferenceProviders();
const requiredModels = requiredReferenceModels(requiredProviders);
const availableProviders = [...new Set(references.map((reference) => canonicalReferenceProvider(reference?.provider)).filter(Boolean))].sort();
const missingProviders = requiredProviders.filter((provider) => !availableProviders.includes(provider));
if (missingProviders.length) {
  throw new Error(`AVANTIQO_CODE_COMPETITIVE_REQUIRED_REFERENCE_PROVIDERS_MISSING:${missingProviders.join(",")}`);
}
for (const provider of requiredProviders) {
  const matches = references.filter((reference) => canonicalReferenceProvider(reference?.provider) === provider);
  const expectedModel = requiredModels[provider];
  if (!matches.some((reference) => text(reference?.model?.product_model) === expectedModel)) {
    throw new Error(`AVANTIQO_CODE_COMPETITIVE_REQUIRED_REFERENCE_MODEL_MISMATCH:${provider}`);
  }
}
for (const reference of references) {
  for (const observation of list(reference?.observations)) {
    const caseId = text(observation?.case_id);
    if (!caseId || text(observation?.category) !== canonicalCategoryByCase.get(caseId)) {
      throw new Error(`AVANTIQO_CODE_COMPETITIVE_CANONICAL_CATEGORY_MISMATCH:${caseId || "UNKNOWN"}`);
    }
    if (Number(observation?.evidence_key_count) !== canonicalEvidenceCountByCase.get(caseId)) {
      throw new Error(`AVANTIQO_CODE_COMPETITIVE_CANONICAL_EVIDENCE_COUNT_MISMATCH:${caseId || "UNKNOWN"}`);
    }
  }
  verifyCodeAICompetitiveReferenceReport(reference, {
    suite_contract: SUITE_CONTRACT,
    suite_sha256: suiteSha256,
    prompt_contract: PROMPT_CONTRACT,
    prompt_contract_sha256: promptContractSha256,
    required_case_ids: requiredCaseIds,
  });
  if (text(reference?.runner_source_commit).toLowerCase() !== ownedRunnerCommit.toLowerCase()) {
    throw new Error("AVANTIQO_CODE_COMPETITIVE_RUNNER_SOURCE_COMMIT_MISMATCH");
  }
}
const ownedQualityFloor = qualityFloor(owned);
if (!ownedQualityFloor.complete || !ownedQualityFloor.minimum_case_quality_passed || !ownedQualityFloor.mean_quality_passed) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_OWNED_ABSOLUTE_QUALITY_FLOOR_NOT_MET");
}
const referenceQualityFloors = references.map((reference) => ({
  provider: canonicalReferenceProvider(reference?.provider),
  model: text(reference?.model?.product_model),
  ...qualityFloor(reference),
}));
for (const floor of referenceQualityFloors) {
  if (!floor.complete || !floor.minimum_case_quality_passed || !floor.mean_quality_passed) {
    throw new Error(`AVANTIQO_CODE_COMPETITIVE_REFERENCE_ABSOLUTE_QUALITY_FLOOR_NOT_MET:${floor.provider || "unknown"}`);
  }
}
const comparisons = references.map((reference) => compareReference(owned, reference, requiredCaseIds));
const referenceModelBindingsCertified = requiredProviders.every((provider) =>
  references.some((reference) =>
    canonicalReferenceProvider(reference?.provider) === provider &&
    text(reference?.model?.product_model) === requiredModels[provider],
  ),
);
const providerDiversityCertified =
  requiredProviders.every((provider) => availableProviders.includes(provider)) &&
  availableProviders.length >= requiredProviders.length;
const competitiveCertified = providerDiversityCertified && referenceModelBindingsCertified && comparisons.length >= 2 && comparisons.every((item) => item.passed);
let ownedRepositoryTaskEvidence;
let referenceRepositoryTaskEvidence;
let repositoryEvidenceMode = "INLINE_FRONTIER_OBSERVATIONS_LEGACY";
if (separateRepositoryEvidenceRequested) {
  repositoryEvidenceMode = "SEPARATE_EXECUTABLE_REPOSITORY_REPORTS";
  const ownedRepositoryReport = JSON.parse(await readFile(resolve(ownedRepositoryEvidenceInput), "utf8"));
  const referenceRepositoryReports = await Promise.all(referenceRepositoryEvidenceInputs.map(async (path) =>
    JSON.parse(await readFile(resolve(path), "utf8")),
  ));
  const validateRepositoryReport = (report, { expectedProvider = null, expectedModel = null, ownedEvidence = false } = {}) => {
    if (ownedEvidence) {
      try {
        verifyCodeAIRepositoryOwnedReport(report, { env: process.env });
      } catch {
        throw new Error("AVANTIQO_CODE_COMPETITIVE_REPOSITORY_OWNED_ATTESTATION_INVALID");
      }
    }
    if (text(report?.suite_contract) !== REPOSITORY_SUITE_CONTRACT || text(report?.suite_sha256).toLowerCase() !== repositorySuiteSha256.toLowerCase()) {
      throw new Error("AVANTIQO_CODE_COMPETITIVE_REPOSITORY_SUITE_MISMATCH");
    }
    if (text(report?.runner_source_commit).toLowerCase() !== ownedRunnerCommit.toLowerCase() || report?.runner_source_clean !== true) {
      throw new Error("AVANTIQO_CODE_COMPETITIVE_REPOSITORY_RUNNER_SOURCE_MISMATCH");
    }
    if (!exactObservationIds(report, requiredRepositoryCaseIds)) {
      throw new Error("AVANTIQO_CODE_COMPETITIVE_REPOSITORY_CASE_SET_MISMATCH");
    }
    for (const observation of list(report?.observations)) {
      const caseId = text(observation?.case_id);
      const canonicalCaseSha = canonicalRepositoryCaseDefinitionById.get(caseId);
      if (!canonicalCaseSha || text(observation?.case_definition_sha256).toLowerCase() !== canonicalCaseSha.toLowerCase()) {
        throw new Error(`AVANTIQO_CODE_COMPETITIVE_REPOSITORY_CASE_DEFINITION_MISMATCH:${caseId || "UNKNOWN"}`);
      }
    }
    if (!ownedEvidence) {
      try {
        verifyCodeAIRepositoryReferenceReport(report, { env: process.env });
      } catch {
        throw new Error("AVANTIQO_CODE_COMPETITIVE_REPOSITORY_REFERENCE_ATTESTATION_INVALID");
      }
      const provider = canonicalReferenceProvider(report?.provider || report?.model?.provider);
      const model = text(report?.model?.product_model || report?.model);
      if (provider !== expectedProvider || model !== expectedModel) {
        throw new Error(`AVANTIQO_CODE_COMPETITIVE_REPOSITORY_REFERENCE_IDENTITY_MISMATCH:${expectedProvider || "unknown"}`);
      }
      if (report?.provider_execution_performed !== true) {
        throw new Error(`AVANTIQO_CODE_COMPETITIVE_REPOSITORY_REFERENCE_EXECUTION_REQUIRED:${expectedProvider || "unknown"}`);
      }
    }
    const assessed = assessCodeAIRepositoryTaskBenchmark(report);
    if (assessed.repository_task_artifact_certified !== true) {
      throw new Error("AVANTIQO_CODE_COMPETITIVE_REPOSITORY_ARTIFACT_NOT_CERTIFIED");
    }
    return assessed;
  };
  ownedRepositoryTaskEvidence = validateRepositoryReport(ownedRepositoryReport, { ownedEvidence: true });
  referenceRepositoryTaskEvidence = requiredProviders.map((provider) => {
    const expectedModel = requiredModels[provider];
    const report = referenceRepositoryReports.find((candidate) =>
      canonicalReferenceProvider(candidate?.provider || candidate?.model?.provider) === provider &&
      text(candidate?.model?.product_model || candidate?.model) === expectedModel,
    );
    if (!report) throw new Error(`AVANTIQO_CODE_COMPETITIVE_REPOSITORY_REFERENCE_MISSING:${provider}`);
    return validateRepositoryReport(report, { expectedProvider: provider, expectedModel });
  });
} else {
  ownedRepositoryTaskEvidence = assessCodeAIRepositoryTaskBenchmark(owned);
  referenceRepositoryTaskEvidence = references.map((reference) => assessCodeAIRepositoryTaskBenchmark(reference));
}
const repositoryTaskArtifactCertified =
  ownedRepositoryTaskEvidence.repository_task_artifact_certified === true &&
  referenceRepositoryTaskEvidence.length >= requiredProviders.length &&
  referenceRepositoryTaskEvidence.every((item) => item.repository_task_artifact_certified === true);
const qualitySuperiorityObserved =
  comparisons.length >= 2 &&
  comparisons.every((item) =>
    item.owned_pass_rate >= item.reference_pass_rate &&
    item.losses === 0 &&
    item.quality_win_rate >= MIN_SUPERIORITY_WIN_RATE &&
    item.quality_win_category_count >= MIN_SUPERIORITY_WIN_CATEGORIES,
  );
const superiorityClaimAllowed = competitiveCertified && repositoryTaskArtifactCertified && qualitySuperiorityObserved;

const report = {
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  purpose: "PROVIDER_NEUTRAL_CODE_COMPETITIVE_CERTIFICATION",
  runtime_provider_effect: "NONE",
  suite_contract: SUITE_CONTRACT,
  suite_case_count: requiredCaseIds.length,
  external_reference_execution_performed: false,
  owned: providerLabel(owned),
  requirements: {
    minimum_references: 2,
    minimum_cases_per_reference: MIN_CASES,
    maximum_reference_age_days: MAX_REFERENCE_AGE_DAYS,
    maximum_cross_evidence_skew_hours: MAX_CROSS_EVIDENCE_SKEW_HOURS,
    unique_signed_benchmark_run_ids_required: true,
    minimum_quality_non_loss_rate: MIN_NON_LOSS_RATE,
    minimum_material_quality_win_margin: MIN_QUALITY_WIN_MARGIN,
    minimum_absolute_case_quality_score: MIN_ABSOLUTE_CASE_QUALITY_SCORE,
    minimum_absolute_mean_quality_score: MIN_ABSOLUTE_MEAN_QUALITY_SCORE,
    symmetric_absolute_quality_floor_required: true,
    deterministic_quality_score_required_for_passed_cases: true,
    case_specific_evidence_grounding_required_for_passed_cases: true,
    case_specific_narrative_grounding_required_for_passed_cases: true,
    minimum_narrative_grounding_score: MIN_NARRATIVE_GROUNDING_SCORE,
    minimum_evidence_distinctness_score: MIN_EVIDENCE_DISTINCTNESS_SCORE,
    unique_cross_case_template_fingerprints_required: true,
    minimum_cross_case_template_simhash_hamming_distance: MIN_TEMPLATE_SIMHASH_HAMMING_DISTANCE,
    maximum_p95_latency_ratio: MAX_P95_LATENCY_RATIO,
    maximum_cost_ratio: MAX_COST_RATIO,
    identical_task_ids_required: true,
    canonical_evidence_key_count_required: true,
    canonical_case_category_binding_required: true,
    distinct_required_reference_providers: true,
    explicit_reference_model_binding_required: true,
    default_required_reference_providers: DEFAULT_REQUIRED_REFERENCE_PROVIDERS,
    canonical_suite_exact_match_required: true,
    cryptographic_reference_attestation_required: true,
    exact_suite_sha256_binding_required: true,
    exact_prompt_contract_sha256_binding_required: true,
    live_reference_provider_execution_required: true,
    exact_runner_source_commit_required: true,
    actual_repository_mutation_evidence_required_for_superiority: true,
    independent_repository_verification_required_for_superiority: true,
    hidden_acceptance_evidence_required_for_superiority: true,
    separate_executable_repository_evidence_supported: true,
    canonical_executable_repository_suite_required: true,
    cryptographic_repository_reference_attestation_required: true,
    cryptographic_repository_owned_attestation_required: true,
    speed_alone_cannot_establish_quality_superiority: true,
    quality_superiority_requires_reference_quality_win: true,
    minimum_superiority_quality_win_rate_per_reference: MIN_SUPERIORITY_WIN_RATE,
    minimum_superiority_quality_win_categories_per_reference: MIN_SUPERIORITY_WIN_CATEGORIES,
    superiority_requires_zero_quality_losses_per_reference: true,
  },
  comparisons,
  repository_task_evidence: {
    mode: repositoryEvidenceMode,
    suite_contract: REPOSITORY_SUITE_CONTRACT,
    suite_sha256: repositorySuiteSha256,
    owned: ownedRepositoryTaskEvidence,
    references: referenceRepositoryTaskEvidence,
    certified: repositoryTaskArtifactCertified,
  },
  competitive_certified: competitiveCertified,
  provider_diversity_certified: providerDiversityCertified,
  owned_absolute_quality_floor: ownedQualityFloor,
  reference_absolute_quality_floors: referenceQualityFloors,
  reference_model_bindings_certified: referenceModelBindingsCertified,
  required_reference_providers: requiredProviders,
  required_reference_models: requiredModels,
  available_reference_providers: availableProviders,
  quality_superiority_observed: qualitySuperiorityObserved,
  superiority_claim_allowed: superiorityClaimAllowed,
};

const outputPath = resolve(process.env.AVANTIQO_CODE_COMPETITIVE_OUTPUT || DEFAULT_OUTPUT);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  contract: CONTRACT,
  output_path: outputPath,
  competitive_certified: competitiveCertified,
  provider_diversity_certified: providerDiversityCertified,
  reference_model_bindings_certified: referenceModelBindingsCertified,
  required_reference_providers: requiredProviders,
  required_reference_models: requiredModels,
  available_reference_providers: availableProviders,
  repository_task_artifact_certified: repositoryTaskArtifactCertified,
  superiority_claim_allowed: superiorityClaimAllowed,
  references: comparisons.map(({ reference, case_count, win_rate, passed, gates }) => ({ reference, case_count, win_rate, passed, gates })),
}, null, 2));
if (!competitiveCertified) process.exitCode = 2;
