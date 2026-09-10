import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_CODE_COMPETITIVE_BENCHMARK_V1";
const DEFAULT_OWNED = "/tmp/avantiqo-code-certification-benchmark.json";
const DEFAULT_OUTPUT = "/tmp/avantiqo-code-competitive-benchmark.json";
const DEFAULT_SUITE = "benchmarks/avantiqo-code-frontier-engineering-suite.json";
const SUITE_CONTRACT = "AVANTIQO_CODE_FRONTIER_ENGINEERING_SUITE_V1";
const MIN_CASES = 20;
const MAX_REFERENCE_AGE_DAYS = 30;
const MIN_WIN_RATE = 0.55;
const MAX_P95_LATENCY_RATIO = 1.25;
const MAX_COST_RATIO = 1.25;

const text = (value) => String(value ?? "").trim();
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const list = (value) => Array.isArray(value) ? value : [];

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
  const correctness = ownedPassed === referencePassed ? 0 : ownedPassed ? 1 : -1;
  const latency = ownedLatency !== null && referenceLatency !== null
    ? referenceLatency === ownedLatency ? 0 : ownedLatency < referenceLatency ? 1 : -1
    : 0;
  const score = correctness * 10 + latency;
  return {
    case_id: text(owned?.case_id),
    owned_passed: ownedPassed,
    reference_passed: referencePassed,
    owned_wall_ms: ownedLatency,
    reference_wall_ms: referenceLatency,
    outcome: score > 0 ? "WIN" : score < 0 ? "LOSS" : "TIE",
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
  const wins = comparisons.filter((item) => item.outcome === "WIN").length;
  const losses = comparisons.filter((item) => item.outcome === "LOSS").length;
  const ties = comparisons.filter((item) => item.outcome === "TIE").length;
  const decisive = wins + losses;
  const winRate = decisive ? wins / decisive : 0;
  const ownedPassRate = comparisons.length ? comparisons.filter((item) => item.owned_passed).length / comparisons.length : 0;
  const referencePassRate = comparisons.length ? comparisons.filter((item) => item.reference_passed).length / comparisons.length : 0;
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
    owned_win_rate: winRate >= MIN_WIN_RATE,
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
    win_rate: Number(winRate.toFixed(4)),
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
const referencePaths = text(process.env.AVANTIQO_CODE_COMPETITIVE_REFERENCES)
  .split(",")
  .map((item) => text(item))
  .filter(Boolean)
  .map(resolve);
if (!referencePaths.length) throw new Error("AVANTIQO_CODE_COMPETITIVE_REFERENCES_REQUIRED");

const suite = JSON.parse(await readFile(suitePath, "utf8"));
if (text(suite?.contract) !== SUITE_CONTRACT) throw new Error("AVANTIQO_CODE_COMPETITIVE_SUITE_CONTRACT_INVALID");
const requiredCaseIds = list(suite?.cases).map((item) => text(item?.case_id)).filter(Boolean).sort();
if (requiredCaseIds.length < MIN_CASES || new Set(requiredCaseIds).size !== requiredCaseIds.length) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_SUITE_INVALID");
}
const owned = JSON.parse(await readFile(ownedPath, "utf8"));
if (owned?.summary?.passed !== true || owned?.summary?.complete_suite !== true) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_OWNED_BENCHMARK_MUST_PASS");
}
const references = await Promise.all(referencePaths.map(async (path) => JSON.parse(await readFile(path, "utf8"))));
const comparisons = references.map((reference) => compareReference(owned, reference, requiredCaseIds));
const competitiveCertified = comparisons.length >= 2 && comparisons.every((item) => item.passed);

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
    minimum_decisive_win_rate: MIN_WIN_RATE,
    maximum_p95_latency_ratio: MAX_P95_LATENCY_RATIO,
    maximum_cost_ratio: MAX_COST_RATIO,
    identical_task_ids_required: true,
    canonical_suite_exact_match_required: true,
  },
  comparisons,
  competitive_certified: competitiveCertified,
  superiority_claim_allowed: competitiveCertified,
};

const outputPath = resolve(process.env.AVANTIQO_CODE_COMPETITIVE_OUTPUT || DEFAULT_OUTPUT);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  contract: CONTRACT,
  output_path: outputPath,
  competitive_certified: competitiveCertified,
  superiority_claim_allowed: competitiveCertified,
  references: comparisons.map(({ reference, case_count, win_rate, passed, gates }) => ({ reference, case_count, win_rate, passed, gates })),
}, null, 2));
if (!competitiveCertified) process.exitCode = 2;
