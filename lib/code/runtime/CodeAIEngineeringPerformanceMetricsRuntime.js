export const CODE_AI_ENGINEERING_PERFORMANCE_METRICS_CONTRACT =
  "AVANTIQO_CODE_AI_ENGINEERING_PERFORMANCE_METRICS_V1";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0;
}

function average(values) {
  const safe = values.map(number);
  return safe.length
    ? Number((safe.reduce((sum, value) => sum + value, 0) / safe.length).toFixed(2))
    : 0;
}

function percentile(values, p) {
  const safe = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!safe.length) return null;
  const index = Math.min(safe.length - 1, Math.max(0, Math.ceil(p * safe.length) - 1));
  return safe[index];
}

export function aggregateCodeAIEngineeringPerformance(sessions = []) {
  const rows = list(sessions).filter((session) => session && typeof session === "object");
  const total = rows.length;
  const verified = rows.filter((row) => row.verified_complete === true).length;
  const firstPass = rows.filter((row) => row?.performance?.first_pass_success === true).length;
  const interventions = rows.filter((row) => number(row?.performance?.owner_intervention_count) > 0).length;
  const isolated = rows.filter((row) => row?.performance?.isolated_candidate_competition_used === true).length;
  const runtimeRequired = rows.filter((row) => row?.performance?.runtime_evidence_required === true);
  const runtimeVerified = runtimeRequired.filter((row) => row?.performance?.runtime_evidence_verified === true).length;
  const reasoning = rows.map((row) => number(row?.performance?.reasoning_calls_used));
  const passes = rows.map((row) => number(row?.performance?.employee_passes_used));
  const failures = rows.map((row) => number(row?.performance?.failure_count));
  const repairs = rows.map((row) => number(row?.performance?.repair_count));
  const wall = rows.map((row) => Number(row?.performance?.wall_ms)).filter(Number.isFinite);
  const verifiedRate = ratio(verified, total);
  const firstPassRate = ratio(firstPass, total);
  const runtimeEvidenceRate = runtimeRequired.length
    ? ratio(runtimeVerified, runtimeRequired.length)
    : 1;
  const averageReasoning = average(reasoning);
  const averageFailures = average(failures);
  const score = Math.max(0, Math.min(100, Math.round(
    verifiedRate * 45 +
    firstPassRate * 25 +
    runtimeEvidenceRate * 10 +
    Math.max(0, 12 - averageReasoning * 2) +
    Math.max(0, 8 - averageFailures * 2)
  )));

  return {
    contract: CODE_AI_ENGINEERING_PERFORMANCE_METRICS_CONTRACT,
    mission_count: total,
    verified_completion_count: verified,
    verified_completion_rate: verifiedRate,
    first_pass_success_count: firstPass,
    first_pass_success_rate: firstPassRate,
    average_reasoning_calls: averageReasoning,
    average_employee_passes: average(passes),
    average_failure_count: averageFailures,
    average_repair_count: average(repairs),
    human_intervention_mission_count: interventions,
    human_intervention_rate: ratio(interventions, total),
    isolated_candidate_mission_count: isolated,
    runtime_evidence_required_count: runtimeRequired.length,
    runtime_evidence_verified_rate: runtimeEvidenceRate,
    p50_wall_ms: percentile(wall, 0.5),
    p95_wall_ms: percentile(wall, 0.95),
    engineering_efficiency_score: score,
    lower_reasoning_calls_is_better_when_quality_is_preserved: true,
    quality_precedes_latency_and_cost: true,
    authorization_effect: "NONE",
  };
}

export const CodeAIEngineeringPerformanceMetricsRuntime = Object.freeze({
  contract: CODE_AI_ENGINEERING_PERFORMANCE_METRICS_CONTRACT,
  aggregate: aggregateCodeAIEngineeringPerformance,
});

export default CodeAIEngineeringPerformanceMetricsRuntime;
