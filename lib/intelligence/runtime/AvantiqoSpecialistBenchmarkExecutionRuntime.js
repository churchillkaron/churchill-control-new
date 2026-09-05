import { createHash } from "node:crypto";

import { requireAvantiqoIntelligenceSafeLease } from "../../platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceSafeLeaseGuard.js";
import {
  AVANTIQO_SPECIALIST_BENCHMARK_CONTRACT,
  getAvantiqoSpecialistBenchmarkCase,
  listAvantiqoSpecialistBenchmarkCases,
} from "./AvantiqoSpecialistBenchmarkRuntime.js";

export const AVANTIQO_SPECIALIST_BENCHMARK_EXECUTION_CONTRACT =
  "AVANTIQO_SPECIALIST_BENCHMARK_EXECUTION_V1";

const EXECUTION_APPROVAL = "AVANTIQO_SPECIALIST_BENCHMARK_EXECUTION_APPROVED";

function text(value, limit = 8000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stableHash(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function laneForBenchmarkCase(benchmarkCase) {
  return benchmarkCase.expected_depth === "fast" ? "fast" : "deep";
}

function executionApproved(input = {}) {
  return input.execution_approved === true ||
    text(input.execution_approval, 120) === EXECUTION_APPROVAL;
}

function governedContext(input = {}) {
  const context = object(input.context);
  return {
    organization_id: text(context.organization_id, 160),
    organization_service_id: text(context.organization_service_id, 160),
    usage_id: text(context.usage_id, 160),
    intelligence_safe_lease_contract: text(context.intelligence_safe_lease_contract, 120),
    intelligence_safe_lease_lane: text(context.intelligence_safe_lease_lane, 120),
    intelligence_safe_lease_endpoint_id: text(context.intelligence_safe_lease_endpoint_id, 160),
    intelligence_safe_lease_expires_at: text(context.intelligence_safe_lease_expires_at, 160),
  };
}

function governedContextReady(context = {}) {
  return Boolean(
    context.organization_id &&
    context.organization_service_id &&
    context.usage_id &&
    context.intelligence_safe_lease_contract &&
    context.intelligence_safe_lease_lane &&
    context.intelligence_safe_lease_endpoint_id &&
    context.intelligence_safe_lease_expires_at,
  );
}

function promptForCase(benchmarkCase) {
  return [
    "Complete the benchmark task below.",
    "Return only the useful final answer; do not expose hidden reasoning.",
    `Benchmark domain: ${benchmarkCase.domain}`,
    `Task: ${benchmarkCase.task}`,
  ].join("\n\n");
}

export function planAvantiqoSpecialistBenchmarkExecution(input = {}) {
  const requested = Array.isArray(input.case_ids) && input.case_ids.length
    ? input.case_ids.map((caseId) => getAvantiqoSpecialistBenchmarkCase(caseId))
    : listAvantiqoSpecialistBenchmarkCases();
  const approved = executionApproved(input);

  return {
    contract: AVANTIQO_SPECIALIST_BENCHMARK_EXECUTION_CONTRACT,
    benchmark_contract: AVANTIQO_SPECIALIST_BENCHMARK_CONTRACT,
    mode: "plan",
    execution_approved: approved,
    mutation_performed: false,
    inference_performed: false,
    wallet_mutation_performed: false,
    runpod_mutation_performed: false,
    production_deploy_performed: false,
    raw_reasoning_persisted: false,
    safe_lease_policy: "REUSE_AVANTIQO_INTELLIGENCE_SAFE_LEASE_GUARD_V2",
    ttft_policy: "MEASURE_ONLY_IF_EXECUTION_ADAPTER_REPORTS_FIRST_TOKEN",
    scoring_policy: "EXTERNAL_SCORES_REQUIRED_NO_SELF_JUDGING",
    cases: requested.map((benchmarkCase) => ({
      case_id: benchmarkCase.id,
      domain: benchmarkCase.domain,
      expected_lane: laneForBenchmarkCase(benchmarkCase),
      requires_verification: benchmarkCase.requires_verification,
      requires_current_evidence: benchmarkCase.requires_current_evidence,
      prompt_fingerprint: stableHash(promptForCase(benchmarkCase)),
    })),
  };
}

function normalizeProviderObservation({ benchmarkCase, result, totalLatencyMs } = {}) {
  const payload = object(result);
  const output = object(payload.output);
  const usage = object(payload.usage);
  const outputUsage = object(output.usage);
  const answer = text(output.text ?? payload.text ?? payload.content, 64000);
  const observedLane = text(
    output.execution_lane ?? payload.execution_lane ?? payload.route_mode,
    40,
  ).toLowerCase() || laneForBenchmarkCase(benchmarkCase);
  const ttftMs = finiteOrNull(payload.ttft_ms ?? output.ttft_ms ?? payload.first_token_latency_ms);
  const reportedTotalMs = finiteOrNull(payload.total_latency_ms ?? output.total_latency_ms);
  if (ttftMs !== null && ttftMs < 0) {
    throw new Error("AVANTIQO_SPECIALIST_BENCHMARK_TTFT_INVALID");
  }
  const effectiveTotalMs = reportedTotalMs ?? totalLatencyMs;
  if (ttftMs !== null && effectiveTotalMs !== null && ttftMs > effectiveTotalMs) {
    throw new Error("AVANTIQO_SPECIALIST_BENCHMARK_TTFT_EXCEEDS_TOTAL");
  }
  return {
    case_id: benchmarkCase.id,
    domain: benchmarkCase.domain,
    expected_lane: laneForBenchmarkCase(benchmarkCase),
    observed_lane: observedLane,
    provider: text(payload.provider, 120) || null,
    model: text(payload.model, 240) || null,
    answer,
    answer_fingerprint: stableHash(answer),
    finish_reason: text(output.finish_reason ?? payload.finish_reason, 120) || null,
    usage: {
      input_tokens: finiteOrNull(usage.input_tokens ?? outputUsage.input_tokens),
      output_tokens: finiteOrNull(usage.output_tokens ?? outputUsage.output_tokens),
      total_tokens: finiteOrNull(usage.total_tokens ?? outputUsage.total_tokens),
    },
    ttft_ms: ttftMs,
    total_latency_ms: effectiveTotalMs,
    ttft_measured: ttftMs !== null,
    raw_reasoning_persisted: false,
  };
}

export async function executeAvantiqoSpecialistBenchmarkCase(input = {}) {
  const benchmarkCase = getAvantiqoSpecialistBenchmarkCase(input.case_id || input.caseId);
  if (!executionApproved(input)) {
    throw new Error("AVANTIQO_SPECIALIST_BENCHMARK_EXECUTION_NOT_APPROVED");
  }
  if (typeof input.execute_provider !== "function") {
    throw new Error("AVANTIQO_SPECIALIST_BENCHMARK_EXECUTION_ADAPTER_REQUIRED");
  }

  const lane = laneForBenchmarkCase(benchmarkCase);
  const context = governedContext(input);
  if (!governedContextReady(context)) {
    throw new Error("AVANTIQO_SPECIALIST_BENCHMARK_GOVERNED_SAFE_LEASE_CONTEXT_REQUIRED");
  }
  const lease = requireAvantiqoIntelligenceSafeLease(lane, context);

  const providerInput = {
    prompt: promptForCase(benchmarkCase),
    intelligence_domain: benchmarkCase.domain,
    execution_lane: lane,
    max_output_tokens: Number(input.max_output_tokens || 2200),
    context: {
      ...object(input.context),
      ...context,
    },
  };

  const startedAt = Date.now();
  const result = await input.execute_provider({
    lane,
    benchmark_case: benchmarkCase,
    safe_lease: lease,
    provider_input: providerInput,
  });
  const totalLatencyMs = Date.now() - startedAt;
  const observation = normalizeProviderObservation({ benchmarkCase, result, totalLatencyMs });

  return {
    contract: AVANTIQO_SPECIALIST_BENCHMARK_EXECUTION_CONTRACT,
    benchmark_contract: AVANTIQO_SPECIALIST_BENCHMARK_CONTRACT,
    mode: "execute",
    execution_approved: true,
    inference_performed: true,
    safe_lease_guard: {
      contract: lease.contract,
      safe_lease_contract: lease.safe_lease_contract,
      execution_lane: lease.execution_lane,
      lease_lane: lease.lease_lane,
      endpoint_id: lease.endpoint_id,
      expires_at: lease.expires_at,
      source: lease.source,
    },
    runpod_mutation_performed_by_harness: false,
    wallet_mutation_performed_by_harness: false,
    production_deploy_performed: false,
    scoring_performed: false,
    scoring_policy: "EXTERNAL_SCORES_REQUIRED_NO_SELF_JUDGING",
    observation,
  };
}

export const AvantiqoSpecialistBenchmarkExecutionRuntime = Object.freeze({
  contract: AVANTIQO_SPECIALIST_BENCHMARK_EXECUTION_CONTRACT,
  approval_token: EXECUTION_APPROVAL,
  plan: planAvantiqoSpecialistBenchmarkExecution,
  executeCase: executeAvantiqoSpecialistBenchmarkCase,
});
