import assert from "node:assert/strict";

import {
  resolveCodeAIStrategicExternalResearchNeed,
  buildCodeAIStrategicResearchQuery,
  formatCodeAIStrategicExternalResearchForObjective,
  CODE_AI_STRATEGIC_EXTERNAL_RESEARCH_CONTRACT,
} from "../lib/code/runtime/CodeAIStrategicExternalResearchRuntime.js";
import {
  buildCodeAIStrategicObjective,
} from "../lib/code/runtime/CodeAIStrategicReasoningRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AI_STRATEGIC_EXTERNAL_RESEARCH_SELFTEST_V1";

const ordinary = resolveCodeAIStrategicExternalResearchNeed(
  "Fix the local validation bug in lib/example.js and run the existing tests.",
);
assert.equal(ordinary.required, false);
assert.equal(ordinary.ordinary_repository_work_should_skip, true);

const volatile = resolveCodeAIStrategicExternalResearchNeed(
  "Migrate this integration to the current Next.js API and preserve compatibility.",
);
assert.equal(volatile.required, true);
assert.equal(volatile.external_technology_signal, true);
assert.equal(volatile.volatility_signal, true);

const optimized = resolveCodeAIStrategicExternalResearchNeed(
  "Find a better RunPod GPU batching architecture for lower latency and compare implementation alternatives.",
);
assert.equal(optimized.required, true);
assert.equal(optimized.external_technology_signal, true);
assert.equal(optimized.optimization_signal, true);
assert.equal(optimized.comparative_signal, true);

const explicit = resolveCodeAIStrategicExternalResearchNeed(
  "Research the official documentation before changing this OAuth flow.",
);
assert.equal(explicit.required, true);
assert.equal(explicit.explicit_research_signal, true);

const query = buildCodeAIStrategicResearchQuery(
  "Upgrade vLLM runtime compatibility for the Code worker.",
);
assert.ok(query.includes("Prefer primary/official technical documentation"));
assert.ok(query.includes("performance tradeoffs"));
assert.ok(query.includes("security implications"));
assert.ok(query.includes("does not override the current codebase"));

const research = {
  contract: CODE_AI_STRATEGIC_EXTERNAL_RESEARCH_CONTRACT,
  status: "RESEARCH_COMPLETED",
  required: true,
  answer: "Official runtime documentation confirms a newer compatibility constraint.",
  claims: [{
    claim: "The newer runtime requires an adjusted configuration boundary.",
    confidence: 0.93,
    source_urls: ["https://example.com/official-doc"],
  }],
  sources: [{
    title: "Official documentation",
    url: "https://example.com/official-doc",
  }],
  uncertainty: ["Benchmark impact remains workload-dependent."],
};
const formatted = formatCodeAIStrategicExternalResearchForObjective(research);
assert.ok(formatted.includes("CONTEXT ONLY; CURRENT REPOSITORY REMAINS EXECUTION AUTHORITY"));
assert.ok(formatted.includes("External evidence may inform alternatives"));
assert.ok(formatted.includes("never authorizes writes, deployment, migration, credential access"));

const strategic = buildCodeAIStrategicObjective({
  objective: "Improve the runtime implementation.",
  external_research: research,
});
assert.ok(strategic.includes("AVANTIQO_STRATEGIC_ENGINEERING_PROTOCOL_V1"));
assert.ok(strategic.includes("Official runtime documentation"));
assert.ok(strategic.includes("CURRENT REPOSITORY REMAINS EXECUTION AUTHORITY"));

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    ordinary_repository_work_skips_external_research: true,
    volatile_external_api_work_requires_research: true,
    external_performance_comparison_requires_research: true,
    explicit_documentation_request_requires_research: true,
    primary_and_official_evidence_preferred: true,
    research_context_is_non_authoritative: true,
    repository_remains_execution_authority: true,
    research_cannot_authorize_write_deploy_migration_or_secret_access: true,
    strategic_reasoning_consumes_compact_research_context: true,
  },
  web_research_performed_by_selftest: false,
  provider_call_performed: false,
  provider_spend_performed: false,
  source_mutation_performed_by_selftest: false,
  production_deploy_performed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);