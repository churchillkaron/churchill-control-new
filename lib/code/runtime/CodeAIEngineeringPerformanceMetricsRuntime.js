export const CODE_AI_ENGINEERING_PERFORMANCE_METRICS_CONTRACT =
  "AVANTIQO_CODE_AI_ENGINEERING_PERFORMANCE_METRICS_V1";


function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

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
  const candidateAssisted = rows.filter(
    (row) => row?.performance?.candidate_assisted_verified_completion === true,
  ).length;
  const finalReviewRepairs = rows.map((row) =>
    number(row?.performance?.final_review_repair_count),
  );
  const employeeContinuations = rows.map((row) =>
    number(row?.performance?.employee_continuation_count),
  );
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
    isolated_candidate_mission_rate: ratio(isolated, total),
    candidate_assisted_verified_completion_count: candidateAssisted,
    candidate_assisted_verified_completion_rate: ratio(candidateAssisted, total),
    average_final_review_repair_count: average(finalReviewRepairs),
    average_employee_continuation_count: average(employeeContinuations),
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

export function compareCodeAIEngineeringPerformanceWindows(sessions = [], windowSize = 10) {
  const rows = list(sessions).filter((session) => session && typeof session === "object");
  const size = Math.min(20, Math.max(2, Number(windowSize || 10)));
  const recentRows = rows.slice(0, size);
  const previousRows = rows.slice(size, size * 2);
  const recent = aggregateCodeAIEngineeringPerformance(recentRows);
  const previous = aggregateCodeAIEngineeringPerformance(previousRows);
  const sufficient = recentRows.length >= 2 && previousRows.length >= 2;
  return {
    contract: "AVANTIQO_CODE_AI_ENGINEERING_PERFORMANCE_TREND_V1",
    sufficient_history: sufficient,
    recent_window_count: recentRows.length,
    previous_window_count: previousRows.length,
    recent,
    previous,
    delta: {
      verified_completion_rate: Number((recent.verified_completion_rate - previous.verified_completion_rate).toFixed(4)),
      first_pass_success_rate: Number((recent.first_pass_success_rate - previous.first_pass_success_rate).toFixed(4)),
      average_reasoning_calls: Number((recent.average_reasoning_calls - previous.average_reasoning_calls).toFixed(2)),
      average_failure_count: Number((recent.average_failure_count - previous.average_failure_count).toFixed(2)),
      human_intervention_rate: Number((recent.human_intervention_rate - previous.human_intervention_rate).toFixed(4)),
      engineering_efficiency_score: recent.engineering_efficiency_score - previous.engineering_efficiency_score,
    },
    improvement_means_quality_up_and_reasoning_not_up: true,
  };
}

export function deriveCodeAIEngineeringImprovementBacklog(metrics = {}, trend = null) {
  const items = [];
  const push = (priority, area, reason, target) => items.push({ priority, area, reason, target });
  if (number(metrics.verified_completion_rate) < 0.9) {
    push("P0", "verified_completion", `Verified completion is ${Math.round(number(metrics.verified_completion_rate) * 100)}%.`, "Raise verified completion to >= 90% without weakening gates.");
  }
  if (number(metrics.first_pass_success_rate) < 0.7) {
    push("P1", "first_pass_strategy", `First-pass success is ${Math.round(number(metrics.first_pass_success_rate) * 100)}%.`, "Improve strategy selection and seeded evidence so >= 70% finish without repair loops.");
  }
  if (number(metrics.average_reasoning_calls) > 3) {
    push("P1", "reasoning_efficiency", `Average reasoning calls are ${number(metrics.average_reasoning_calls)}.`, "Reduce average reasoning calls to <= 3 while preserving verified completion.");
  }
  if (number(metrics.average_employee_passes) > 2) {
    push("P1", "employee_convergence", `Average employee passes are ${number(metrics.average_employee_passes)}.`, "Converge most missions in <= 2 employee passes.");
  }
  if (number(metrics.average_failure_count) > 0.5) {
    push("P1", "failure_prevention", `Average observed failures per mission are ${number(metrics.average_failure_count)}.`, "Convert repeated failures into deterministic preflight/verification prevention.");
  }
  if (number(metrics.human_intervention_rate) > 0.2) {
    push("P2", "autonomy", `Human intervention appears in ${Math.round(number(metrics.human_intervention_rate) * 100)}% of missions.`, "Reduce avoidable intervention while preserving material-decision governance.");
  }
  if (number(metrics.runtime_evidence_verified_rate) < 1) {
    push("P1", "runtime_evidence", `Runtime evidence verification rate is ${Math.round(number(metrics.runtime_evidence_verified_rate) * 100)}% where required.`, "Reach 100% runtime evidence coverage for required UI/API missions.");
  }
  if (trend?.sufficient_history === true) {
    if (number(trend?.delta?.verified_completion_rate) < 0) {
      push("P0", "quality_regression", "Verified completion regressed versus the previous mission window.", "Reverse the verified-completion regression before optimizing latency/cost.");
    }
    if (number(trend?.delta?.average_reasoning_calls) > 0.5) {
      push("P1", "reasoning_regression", "Reasoning-call usage increased materially versus the previous mission window.", "Recover prior reasoning efficiency without reducing quality.");
    }
  }
  const priorityOrder = { P0: 0, P1: 1, P2: 2 };
  return {
    contract: "AVANTIQO_CODE_AI_ENGINEERING_IMPROVEMENT_BACKLOG_V1",
    item_count: items.length,
    items: items
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || a.area.localeCompare(b.area))
      .slice(0, 8),
    repository_assessment_still_authoritative: true,
    automatic_source_mutation_authority: false,
    authorization_effect: "NONE",
  };
}

export function aggregateCodeAIEngineeringHotspotBacklog(sessions = []) {
  const priorityRank = { P0: 0, P1: 1, P2: 2 };
  const byArea = new Map();
  for (const session of list(sessions)) {
    for (const item of list(session?.engineering_hotspots?.items)) {
      const area = text(item?.area, 120);
      if (!area) continue;
      const current = byArea.get(area) || {
        area,
        priority: text(item?.priority, 20) || "P2",
        occurrence_count: 0,
        max_score: 0,
        evidence: null,
        recommendation: null,
        affected_paths: new Set(),
      };
      current.occurrence_count += 1;
      current.max_score = Math.max(current.max_score, Number(item?.score || 0));
      const candidatePriority = text(item?.priority, 20) || "P2";
      if ((priorityRank[candidatePriority] ?? 9) < (priorityRank[current.priority] ?? 9)) {
        current.priority = candidatePriority;
      }
      if (!current.evidence && text(item?.evidence, 1200)) current.evidence = text(item.evidence, 1200);
      if (!current.recommendation && text(item?.recommendation, 1200)) current.recommendation = text(item.recommendation, 1200);
      for (const path of list(item?.affected_paths)) {
        const normalized = text(path, 1000);
        if (normalized) current.affected_paths.add(normalized);
      }
      byArea.set(area, current);
    }
  }
  const items = [...byArea.values()]
    .map((item) => ({
      area: item.area,
      priority: item.priority,
      occurrence_count: item.occurrence_count,
      max_score: item.max_score,
      evidence: item.evidence,
      recommendation: item.recommendation,
      affected_paths: [...item.affected_paths].slice(0, 16),
      authorization_effect: "NONE",
    }))
    .sort((a, b) =>
      (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) ||
      b.occurrence_count - a.occurrence_count ||
      b.max_score - a.max_score ||
      a.area.localeCompare(b.area)
    )
    .slice(0, 10);
  return {
    contract: "AVANTIQO_CODE_AI_ENGINEERING_HOTSPOT_BACKLOG_V1",
    item_count: items.length,
    items,
    repeated_hotspot_count: items.filter((item) => item.occurrence_count >= 2).length,
    repository_reassessment_required_before_mutation: true,
    automatic_source_mutation_authority: false,
    authorization_effect: "NONE",
  };
}


export const CodeAIEngineeringPerformanceMetricsRuntime = Object.freeze({
  contract: CODE_AI_ENGINEERING_PERFORMANCE_METRICS_CONTRACT,
  aggregate: aggregateCodeAIEngineeringPerformance,
  compareWindows: compareCodeAIEngineeringPerformanceWindows,
  improvementBacklog: deriveCodeAIEngineeringImprovementBacklog,
  engineeringHotspotBacklog: aggregateCodeAIEngineeringHotspotBacklog,
});

export default CodeAIEngineeringPerformanceMetricsRuntime;
