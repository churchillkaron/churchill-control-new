import {
  listCodeAIMissionHistory,
} from "./CodeAIMissionHistoryRuntime.js";
import {
  aggregateCodeAIEngineeringPerformance,
  CODE_AI_ENGINEERING_PERFORMANCE_METRICS_CONTRACT,
} from "./CodeAIEngineeringPerformanceMetricsRuntime.js";

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
  return {
    contract: CODE_AI_ENGINEERING_PERFORMANCE_BENCHMARK_CONTRACT,
    metrics_contract: CODE_AI_ENGINEERING_PERFORMANCE_METRICS_CONTRACT,
    measured_from_attested_mission_history: true,
    actor_scoped: true,
    organization_scoped: true,
    repository_url: repositoryUrl || null,
    ref: ref || null,
    metrics,
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
