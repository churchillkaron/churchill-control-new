import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyCodeAICompetitiveReferenceReport } from "../lib/code/runtime/CodeAICompetitiveReferenceAttestationRuntime.js";
import { assessCodeAIRepositoryTaskBenchmark } from "../lib/code/runtime/CodeAIRepositoryTaskBenchmarkRuntime.js";

const CONTRACT = "AVANTIQO_CODE_COMPETITIVE_BENCHMARK_V1";
const DEFAULT_OWNED = "/tmp/avantiqo-code-certification-benchmark.json";
const DEFAULT_OUTPUT = "/tmp/avantiqo-code-competitive-benchmark.json";
const DEFAULT_SUITE = "benchmarks/avantiqo-code-frontier-engineering-suite.json";
const DEFAULT_PROMPT_CONTRACT = "benchmarks/avantiqo-code-frontier-prompt-contract.json";
const SUITE_CONTRACT = "AVANTIQO_CODE_FRONTIER_ENGINEERING_SUITE_V1";
const PROMPT_CONTRACT = "AVANTIQO_CODE_FRONTIER_PROMPT_CONTRACT_V1";
const MIN_CASES = 20;
const MAX_REFERENCE_AGE_DAYS = 30;
const MIN_NON_LOSS_RATE = 0.95;
const MIN_NARRATIVE_GROUNDING_SCORE = 0.5;
const MIN_QUALITY_WIN_MARGIN = 0.03;
const MIN_SUPERIORITY_WIN_RATE = 0.10;
const MAX_P95_LATENCY_RATIO = 1.25;
const MAX_COST_RATIO = 1.25;

const text = (value) => String(value ?? "").trim();
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const list = (value) => Array.isArray(value) ? value : [];
const sha256 = (value) => createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");

function percentile(values, p) {
  const safe = values.map(finite).filter((value) => value !== null).sort((a, b) => a - b);
  if (!safe.length) return null;
  const index = Math.min(safe.length - 1, Math.max(0, Math.ceil(p * safe.length) - 1));
  return safe[index];
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
  const wins = comparisons.filter((item) => item.quality_outcome === "WIN").length;
  const losses = comparisons.filter((item) => item.quality_outcome === "LOSS").length;
  const ties = comparisons.filter((item) => item.quality_outcome === "TIE").length;
  const nonLossRate = comparisons.length ? (wins + ties) / comparisons.length : 0;
  const qualityWinRate = comparisons.length ? wins / comparisons.length : 0;
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
    gates,
    passed: Object.values(gates).every(Boolean),
    cases: comparisons,
  };
}

const ownedPath = resolve(process.env.AVANTIQO_CODE_COMPETITIVE_OWNED || DEFAULT_OWNED);
const suitePath = resolve(process.env.AVANTIQO_CODE_COMPETITIVE_SUITE || DEFAULT_SUITE);
const promptContractPath = resolve(process.env.AVANTIQO_CODE_COMPETITIVE_PROMPT_CONTRACT || DEFAULT_PROMPT_CONTRACT);
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
if (requiredCaseIds.length < MIN_CASES || new Set(requiredCaseIds).size !== requiredCaseIds.length) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_SUITE_INVALID");
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
if (
  text(owned?.prompt_contract) !== PROMPT_CONTRACT ||
  text(owned?.prompt_contract_sha256).toLowerCase() !== promptContractSha256.toLowerCase()
) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_OWNED_PROMPT_CONTRACT_MISMATCH");
}
const references = await Promise.all(referencePaths.map(async (path) => JSON.parse(await readFile(path, "utf8"))));
for (const reference of references) {
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
const comparisons = references.map((reference) => compareReference(owned, reference, requiredCaseIds));
const competitiveCertified = comparisons.length >= 2 && comparisons.every((item) => item.passed);
const ownedRepositoryTaskEvidence = assessCodeAIRepositoryTaskBenchmark(owned);
const referenceRepositoryTaskEvidence = references.map((reference) => assessCodeAIRepositoryTaskBenchmark(reference));
const repositoryTaskArtifactCertified =
  ownedRepositoryTaskEvidence.repository_task_artifact_certified === true &&
  referenceRepositoryTaskEvidence.length >= 2 &&
  referenceRepositoryTaskEvidence.every((item) => item.repository_task_artifact_certified === true);
const qualitySuperiorityObserved =
  comparisons.length >= 2 &&
  comparisons.every((item) =>
    item.owned_pass_rate >= item.reference_pass_rate &&
    item.losses === 0 &&
    item.quality_win_rate >= MIN_SUPERIORITY_WIN_RATE,
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
    minimum_quality_non_loss_rate: MIN_NON_LOSS_RATE,
    minimum_material_quality_win_margin: MIN_QUALITY_WIN_MARGIN,
    deterministic_quality_score_required_for_passed_cases: true,
    case_specific_evidence_grounding_required_for_passed_cases: true,
    case_specific_narrative_grounding_required_for_passed_cases: true,
    minimum_narrative_grounding_score: MIN_NARRATIVE_GROUNDING_SCORE,
    maximum_p95_latency_ratio: MAX_P95_LATENCY_RATIO,
    maximum_cost_ratio: MAX_COST_RATIO,
    identical_task_ids_required: true,
    canonical_suite_exact_match_required: true,
    cryptographic_reference_attestation_required: true,
    exact_suite_sha256_binding_required: true,
    exact_prompt_contract_sha256_binding_required: true,
    live_reference_provider_execution_required: true,
    exact_runner_source_commit_required: true,
    actual_repository_mutation_evidence_required_for_superiority: true,
    independent_repository_verification_required_for_superiority: true,
    hidden_acceptance_evidence_required_for_superiority: true,
    speed_alone_cannot_establish_quality_superiority: true,
    quality_superiority_requires_reference_quality_win: true,
    minimum_superiority_quality_win_rate_per_reference: MIN_SUPERIORITY_WIN_RATE,
    superiority_requires_zero_quality_losses_per_reference: true,
  },
  comparisons,
  repository_task_evidence: {
    owned: ownedRepositoryTaskEvidence,
    references: referenceRepositoryTaskEvidence,
    certified: repositoryTaskArtifactCertified,
  },
  competitive_certified: competitiveCertified,
  quality_superiority_observed: qualitySuperiorityObserved,
  superiority_claim_allowed: superiorityClaimAllowed,
};

const outputPath = resolve(process.env.AVANTIQO_CODE_COMPETITIVE_OUTPUT || DEFAULT_OUTPUT);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  contract: CONTRACT,
  output_path: outputPath,
  competitive_certified: competitiveCertified,
  repository_task_artifact_certified: repositoryTaskArtifactCertified,
  superiority_claim_allowed: superiorityClaimAllowed,
  references: comparisons.map(({ reference, case_count, win_rate, passed, gates }) => ({ reference, case_count, win_rate, passed, gates })),
}, null, 2));
if (!competitiveCertified) process.exitCode = 2;
