import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AVANTIQO_BEHAVIORAL_TRACE_BENCHMARK_CONTRACT,
  attestAvantiqoBehavioralTraceEvidence,
  evaluateAvantiqoBehavioralTraceBenchmark,
  verifyAvantiqoBehavioralTraceEvidence,
} from "../lib/intelligence/runtime/AvantiqoBehavioralTraceBenchmarkRuntime.mjs";

function trace({ caseId, run, success = true, latency = 900, toolCalls = 4, cost = 0.9 } = {}) {
  return {
    case_id: caseId,
    run_id: `run-${run}`,
    outcome: { success, verified: true, score: success ? 1 : 0.9 },
    governance: {
      organization_scope_preserved: true,
      entity_scope_preserved: true,
      unauthorized_mutation_count: 0,
      action_after_deny_count: 0,
      sensitive_leakage_detected: false,
    },
    provenance: {
      required_reference_count: 2,
      verified_reference_count: 2,
      fabricated_reference_count: 0,
    },
    recovery: {
      failure_count: 0,
      recovered_count: 0,
      retry_count: 0,
      repeated_failed_action_count: 0,
    },
    efficiency: { tool_calls: toolCalls, latency_ms: latency, cost_units: cost },
    tool_events: [
      {
        tool: "platform.example.read",
        mode: "read",
        authorized: true,
        decision: "allow",
        result_status: "completed",
        verification_status: "verified",
      },
    ],
  };
}

function suite({ baselineLatency = 1000, candidateLatency = 900 } = {}) {
  const baseline = [];
  const candidate = [];
  for (let caseIndex = 0; caseIndex < 20; caseIndex += 1) {
    for (let run = 0; run < 3; run += 1) {
      baseline.push(trace({
        caseId: `case-${caseIndex}`,
        run,
        success: !(caseIndex === 0 && run === 0),
        latency: baselineLatency,
        toolCalls: 5,
        cost: 1,
      }));
      candidate.push(trace({
        caseId: `case-${caseIndex}`,
        run,
        success: true,
        latency: candidateLatency,
        toolCalls: 4,
        cost: 0.9,
      }));
    }
  }
  return { baseline, candidate };
}

const valid = suite();
const certified = evaluateAvantiqoBehavioralTraceBenchmark({
  traceSuiteId: "worldclass-agent-lifecycle-v1",
  baselineTraces: valid.baseline,
  candidateTraces: valid.candidate,
});
assert.equal(certified.contract, AVANTIQO_BEHAVIORAL_TRACE_BENCHMARK_CONTRACT);
assert.equal(certified.status, "BEHAVIORAL_TRACE_CERTIFIED");
assert.equal(certified.matched_case_count, 20);
assert.equal(certified.minimum_repeated_runs_per_case, 3);
assert.equal(certified.comparison.eligible, true);
assert.equal(certified.hard_failures.candidate, 0);
assert.equal(certified.governance.raw_reasoning_persisted, false);

process.env.AVANTIQO_INTELLIGENCE_BEHAVIORAL_TRACE_ATTESTATION_SECRET =
  "worldclass-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
const baselineEnvelope = attestAvantiqoBehavioralTraceEvidence({
  modelCandidateId: "candidate-1",
  adapterArtifactReference: "artifact://candidate-1",
  sourceBenchmarkRunId: "benchmark-1",
  traceSuiteId: "worldclass-agent-lifecycle-v1",
  lane: "BASELINE",
  producer: "behavioral-trace-audit",
  traces: valid.baseline,
});
const verifiedEnvelope = verifyAvantiqoBehavioralTraceEvidence({
  envelope: baselineEnvelope,
  expectedModelCandidateId: "candidate-1",
  expectedAdapterArtifactReference: "artifact://candidate-1",
  expectedBenchmarkRunId: "benchmark-1",
  expectedLane: "BASELINE",
});
assert.equal(verifiedEnvelope.status, "ATTESTED_TRACE_EVIDENCE_VERIFIED");
const tamperedEnvelope = structuredClone(baselineEnvelope);
tamperedEnvelope.traces[0].efficiency.latency_ms += 1;
assert.throws(
  () => verifyAvantiqoBehavioralTraceEvidence({
    envelope: tamperedEnvelope,
    expectedModelCandidateId: "candidate-1",
    expectedAdapterArtifactReference: "artifact://candidate-1",
    expectedBenchmarkRunId: "benchmark-1",
    expectedLane: "BASELINE",
  }),
  /AVANTIQO_BEHAVIORAL_TRACE_EVIDENCE_(HASH|SIGNATURE)_INVALID/,
);

const unauthorized = structuredClone(valid.candidate);
unauthorized[0].governance.unauthorized_mutation_count = 1;
assert.throws(
  () => evaluateAvantiqoBehavioralTraceBenchmark({
    traceSuiteId: "unauthorized",
    baselineTraces: valid.baseline,
    candidateTraces: unauthorized,
  }),
  /AVANTIQO_BEHAVIORAL_TRACE_CANDIDATE_HARD_FAILURE/,
);

const afterDeny = structuredClone(valid.candidate);
afterDeny[0].tool_events.push({
  tool: "platform.example.write",
  mode: "write",
  authorized: true,
  decision: "deny",
  result_status: "completed",
  verification_status: "verified",
});
afterDeny[0].efficiency.tool_calls = 5;
assert.throws(
  () => evaluateAvantiqoBehavioralTraceBenchmark({
    traceSuiteId: "after-deny",
    baselineTraces: valid.baseline,
    candidateTraces: afterDeny,
  }),
  /MUTATION_EXECUTED_AFTER_DENY/,
);

const rawReasoning = structuredClone(valid.candidate);
rawReasoning[0].raw_reasoning = "private scratchpad";
assert.throws(
  () => evaluateAvantiqoBehavioralTraceBenchmark({
    traceSuiteId: "raw-reasoning",
    baselineTraces: valid.baseline,
    candidateTraces: rawReasoning,
  }),
  /AVANTIQO_BEHAVIORAL_TRACE_RAW_REASONING_REJECTED/,
);

const unverifiedMutation = structuredClone(valid.candidate);
unverifiedMutation[0].tool_events.push({
  tool: "platform.example.write",
  mode: "write",
  authorized: true,
  decision: "allow",
  result_status: "completed",
  verification_status: "",
});
unverifiedMutation[0].efficiency.tool_calls = 5;
assert.throws(
  () => evaluateAvantiqoBehavioralTraceBenchmark({
    traceSuiteId: "unverified-mutation",
    baselineTraces: valid.baseline,
    candidateTraces: unverifiedMutation,
  }),
  /MUTATION_EFFECT_NOT_VERIFIED/,
);

const slow = suite({ candidateLatency: 1400 });
assert.throws(
  () => evaluateAvantiqoBehavioralTraceBenchmark({
    traceSuiteId: "latency-regression",
    baselineTraces: slow.baseline,
    candidateTraces: slow.candidate,
  }),
  /LATENCY_REGRESSION/,
);

const promotionSource = await readFile(
  new URL("../lib/intelligence/runtime/AvantiqoModelPromotionRuntime.js", import.meta.url),
  "utf8",
);
const traceGateIndex = promotionSource.indexOf("requireAvantiqoBehavioralTraceCertification({");
const canaryIndex = promotionSource.indexOf("certifyAvantiqoModelCandidateCanary({");
assert.ok(traceGateIndex >= 0, "behavioral trace gate must be wired into model promotion");
assert.ok(canaryIndex > traceGateIndex, "behavioral trace gate must run before the paid candidate canary");
assert.match(promotionSource, /attested_source_evidence_verified/);
assert.match(promotionSource, /raw_reasoning_persisted/);
assert.match(promotionSource, /automatic_production_promotion: false/);

console.log("AVANTIQO_BEHAVIORAL_TRACE_BENCHMARK_AUDIT_PASS");
console.log(JSON.stringify({
  status: certified.status,
  matched_cases: certified.matched_case_count,
  repeated_runs_per_case: certified.minimum_repeated_runs_per_case,
  total_candidate_runs: certified.candidate.run_count,
  candidate_pass_rate: certified.candidate.pass_rate,
  tool_call_ratio: certified.comparison.tool_call_ratio,
  latency_ratio: certified.comparison.latency_ratio,
  cost_ratio: certified.comparison.cost_ratio,
  attestation_tamper_rejected: true,
  promotion_gate_precedes_paid_canary: true,
}, null, 2));
