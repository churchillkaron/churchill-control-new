import {
  listCodeAIMissionHistory,
} from "./CodeAIMissionHistoryRuntime.js";
import {
  aggregateCodeAIEngineeringPerformance,
  CODE_AI_ENGINEERING_PERFORMANCE_METRICS_CONTRACT,
} from "./CodeAIEngineeringPerformanceMetricsRuntime.js";
import {
  loadLatestCodeAICompetitiveBenchmarkEvidence,
  CODE_AI_COMPETITIVE_BENCHMARK_EVIDENCE_CONTRACT,
} from "./CodeAICompetitiveBenchmarkEvidenceRuntime.js";

export const CODE_AI_ENGINEERING_PERFORMANCE_BENCHMARK_CONTRACT =
  "AVANTIQO_CODE_AI_ENGINEERING_PERFORMANCE_BENCHMARK_V1";

export async function benchmarkCodeAIEngineeringPerformance({
  context = {},
  repositoryUrl = null,
  ref = null,
  limit = 50,
} = {}) {
  const history = await listCodeAIMissionHistory({
    context,
    limit: Math.min(50, Math.max(5, Number(limit || 50))),
    repositoryUrl,
    ref,
    verifiedOnly: false,
  });
  const metrics = history.performance || aggregateCodeAIEngineeringPerformance(history.sessions);
  let competitiveEvidence = null;
  try {
    const competitive = await loadLatestCodeAICompetitiveBenchmarkEvidence();
    competitiveEvidence = competitive?.found === true ? competitive.evidence : null;
  } catch (error) {
    console.error(JSON.stringify({
      event: "AVANTIQO_CODE_COMPETITIVE_BENCHMARK_EVIDENCE_LOAD_FAILED",
      reason: String(error?.message || error || "UNKNOWN").slice(0, 500),
      benchmark_execution_blocked: false,
      authorization_effect: "NONE",
    }));
  }
  return {
    contract: CODE_AI_ENGINEERING_PERFORMANCE_BENCHMARK_CONTRACT,
    metrics_contract: CODE_AI_ENGINEERING_PERFORMANCE_METRICS_CONTRACT,
    measured_from_attested_mission_history: true,
    actor_scoped: true,
    organization_scoped: true,
    repository_url: repositoryUrl || null,
    ref: ref || null,
    metrics,
    trend: history.performance_trend || null,
    improvement_backlog: history.improvement_backlog || null,
    engineering_hotspot_backlog: history.engineering_hotspot_backlog || null,
    competitive_evidence_contract: CODE_AI_COMPETITIVE_BENCHMARK_EVIDENCE_CONTRACT,
    competitive_evidence: competitiveEvidence,
    external_competitive_certification_contract:
      "AVANTIQO_CODE_COMPETITIVE_BENCHMARK_V1",
    external_superiority_claim_effect: "NONE",
    authorization_effect: "NONE",
  };
}

export const CodeAIEngineeringPerformanceBenchmarkRuntime = Object.freeze({
  contract: CODE_AI_ENGINEERING_PERFORMANCE_BENCHMARK_CONTRACT,
  metrics_contract: CODE_AI_ENGINEERING_PERFORMANCE_METRICS_CONTRACT,
  benchmark: benchmarkCodeAIEngineeringPerformance,
});

export default CodeAIEngineeringPerformanceBenchmarkRuntime;
