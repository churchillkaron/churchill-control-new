import { createHash } from "node:crypto";

export const AVANTIQO_SPECIALIST_BENCHMARK_CONTRACT =
  "AVANTIQO_SPECIALIST_BENCHMARK_V1";

const DOMAINS = Object.freeze(["business", "avantiqo", "code"]);
const REQUIRED_SCORE_DIMENSIONS = Object.freeze([
  "correctness",
  "evidence_grounding",
  "decision_quality",
  "verification_quality",
]);

const CASES = Object.freeze([
  Object.freeze({
    id: "business-cash-inventory-01",
    domain: "business",
    task: "A profitable company is growing revenue but cash is falling while inventory days rise. Diagnose the most likely operating causes, identify the minimum evidence needed to distinguish them, and recommend the first three management actions in priority order.",
    expected_depth: "deep",
    requires_verification: false,
    requires_current_evidence: false,
    rubric: Object.freeze([
      "distinguishes profit from cash generation",
      "connects inventory and working capital to cash",
      "requests discriminating evidence instead of inventing facts",
      "prioritizes executable actions with tradeoffs",
    ]),
  }),
  Object.freeze({
    id: "business-pricing-unit-economics-02",
    domain: "business",
    task: "A service business can raise price 8 percent but expects volume to fall 5 percent. Explain what must be true for the change to improve contribution profit and show the decision logic without assuming missing cost data.",
    expected_depth: "deep",
    requires_verification: false,
    requires_current_evidence: false,
    rubric: Object.freeze([
      "uses contribution economics rather than revenue alone",
      "makes missing variable cost explicit",
      "shows break-even decision logic",
      "does not fabricate elasticity certainty",
    ]),
  }),
  Object.freeze({
    id: "avantiqo-safe-lease-01",
    domain: "avantiqo",
    task: "A RunPod Intelligence request is queued but no worker is running. Diagnose the execution path and propose the safest next action without changing model code or starting duplicate capacity.",
    expected_depth: "deep",
    requires_verification: true,
    requires_current_evidence: true,
    rubric: Object.freeze([
      "checks scheduling capacity placement before model code",
      "preserves Safe Lease ownership of scaling",
      "avoids duplicate GPU spend",
      "requires runtime evidence before claiming resolution",
    ]),
  }),
  Object.freeze({
    id: "avantiqo-context-boundary-02",
    domain: "avantiqo",
    task: "Design a change that adds specialist reasoning to Avantiqo without bypassing BusinessContext, wallet governance, provider ownership, or existing runtime boundaries.",
    expected_depth: "deep",
    requires_verification: true,
    requires_current_evidence: false,
    rubric: Object.freeze([
      "preserves existing architecture before adding a parallel subsystem",
      "keeps organization context explicit",
      "keeps provider and wallet governance intact",
      "defines verification and rollback surface",
    ]),
  }),
  Object.freeze({
    id: "code-regression-debug-01",
    domain: "code",
    task: "A Node test suite started failing after a refactor. The focused test for the changed module passes but the repository-wide test command fails. Describe the evidence sequence needed to determine whether the change caused the failure and the smallest safe repair strategy.",
    expected_depth: "deep",
    requires_verification: true,
    requires_current_evidence: false,
    rubric: Object.freeze([
      "separates focused success from repository baseline health",
      "compares failing stage against current main or baseline",
      "avoids weakening good code to fit unrelated failures",
      "re-runs the narrowest sufficient verification after repair",
    ]),
  }),
  Object.freeze({
    id: "code-trivial-edit-02",
    domain: "code",
    task: "Fix a spelling typo in one JavaScript comment and change nothing else.",
    expected_depth: "fast",
    requires_verification: true,
    requires_current_evidence: false,
    rubric: Object.freeze([
      "keeps change surface to one comment",
      "does not invent architectural work",
      "verifies the exact diff",
      "uses a cheap validation path",
    ]),
  }),
]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boundedScore(value) {
  const parsed = number(value);
  if (parsed === null) return null;
  return Math.max(0, Math.min(1, parsed));
}

function stableHash(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

export function listAvantiqoSpecialistBenchmarkCases() {
  return CASES.map((item) => ({ ...item, rubric: [...item.rubric] }));
}

export function getAvantiqoSpecialistBenchmarkCase(caseId) {
  const id = text(caseId, 160);
  const found = CASES.find((item) => item.id === id);
  if (!found) throw new Error(`AVANTIQO_SPECIALIST_BENCHMARK_CASE_NOT_FOUND:${id || "missing"}`);
  return { ...found, rubric: [...found.rubric] };
}

export function evaluateAvantiqoSpecialistBenchmarkResult(input = {}) {
  const benchmarkCase = getAvantiqoSpecialistBenchmarkCase(input.case_id || input.caseId);
  const scores = {};
  for (const dimension of REQUIRED_SCORE_DIMENSIONS) {
    const score = boundedScore(input.scores?.[dimension]);
    if (score === null) {
      throw new Error(`AVANTIQO_SPECIALIST_BENCHMARK_SCORE_REQUIRED:${dimension}`);
    }
    scores[dimension] = score;
  }

  const routeMode = text(input.route_mode || input.routeMode, 40).toLowerCase();
  const routeCorrect = routeMode === benchmarkCase.expected_depth;
  const verificationObserved = input.verification_observed === true;
  const currentEvidenceObserved = input.current_evidence_observed === true;
  const verificationSatisfied =
    !benchmarkCase.requires_verification || verificationObserved;
  const currentEvidenceSatisfied =
    !benchmarkCase.requires_current_evidence || currentEvidenceObserved;
  const qualityAverage = REQUIRED_SCORE_DIMENSIONS.reduce(
    (sum, dimension) => sum + scores[dimension],
    0,
  ) / REQUIRED_SCORE_DIMENSIONS.length;

  const ttftMs = number(input.ttft_ms);
  const totalMs = number(input.total_latency_ms);
  const latencyValid =
    (ttftMs === null || ttftMs >= 0) &&
    (totalMs === null || totalMs >= 0) &&
    (ttftMs === null || totalMs === null || ttftMs <= totalMs);
  if (!latencyValid) {
    throw new Error("AVANTIQO_SPECIALIST_BENCHMARK_LATENCY_INVALID");
  }

  const hardGatePassed =
    routeCorrect && verificationSatisfied && currentEvidenceSatisfied;
  const pass = hardGatePassed && qualityAverage >= 0.8;
  const fingerprint = stableHash([
    AVANTIQO_SPECIALIST_BENCHMARK_CONTRACT,
    benchmarkCase.id,
    routeMode,
    ...REQUIRED_SCORE_DIMENSIONS.map((dimension) => `${dimension}:${scores[dimension].toFixed(4)}`),
    verificationObserved ? "verified" : "unverified",
    currentEvidenceObserved ? "current" : "not-current",
    ttftMs ?? "na",
    totalMs ?? "na",
  ].join("|"));

  return {
    contract: AVANTIQO_SPECIALIST_BENCHMARK_CONTRACT,
    case_id: benchmarkCase.id,
    domain: benchmarkCase.domain,
    expected_depth: benchmarkCase.expected_depth,
    observed_depth: routeMode || null,
    route_correct: routeCorrect,
    verification_satisfied: verificationSatisfied,
    current_evidence_satisfied: currentEvidenceSatisfied,
    scores,
    quality_average: Number(qualityAverage.toFixed(4)),
    ttft_ms: ttftMs,
    total_latency_ms: totalMs,
    hard_gate_passed: hardGatePassed,
    passed: pass,
    result_fingerprint: fingerprint,
  };
}

export function compareAvantiqoSpecialistBenchmarkResults(left, right) {
  const a = evaluateAvantiqoSpecialistBenchmarkResult(left);
  const b = evaluateAvantiqoSpecialistBenchmarkResult(right);
  if (a.case_id !== b.case_id) {
    throw new Error("AVANTIQO_SPECIALIST_BENCHMARK_CASE_MISMATCH");
  }

  const latencyA = a.total_latency_ms;
  const latencyB = b.total_latency_ms;
  return {
    contract: AVANTIQO_SPECIALIST_BENCHMARK_CONTRACT,
    case_id: a.case_id,
    quality_delta: Number((a.quality_average - b.quality_average).toFixed(4)),
    latency_delta_ms:
      latencyA === null || latencyB === null ? null : latencyA - latencyB,
    left_passed: a.passed,
    right_passed: b.passed,
    quality_winner:
      a.quality_average === b.quality_average
        ? "tie"
        : a.quality_average > b.quality_average ? "left" : "right",
    latency_winner:
      latencyA === null || latencyB === null || latencyA === latencyB
        ? "tie"
        : latencyA < latencyB ? "left" : "right",
  };
}

export const AvantiqoSpecialistBenchmarkRuntime = Object.freeze({
  contract: AVANTIQO_SPECIALIST_BENCHMARK_CONTRACT,
  domains: DOMAINS,
  score_dimensions: REQUIRED_SCORE_DIMENSIONS,
  listCases: listAvantiqoSpecialistBenchmarkCases,
  getCase: getAvantiqoSpecialistBenchmarkCase,
  evaluate: evaluateAvantiqoSpecialistBenchmarkResult,
  compare: compareAvantiqoSpecialistBenchmarkResults,
});
