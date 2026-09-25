import test from "node:test";
import assert from "node:assert/strict";

import {
  CODE_AI_ENGINEERING_OPERATING_SYSTEM_CONTRACT,
  classifyCodeAIEngineeringMission,
  prepareCodeAIEngineeringOperatingSystem,
  finalizeCodeAIEngineeringOperatingSystem,
} from "../lib/code/runtime/CodeAIEngineeringOperatingSystemRuntime.js";

function resolvedHypothesisDebugging(ids = ["pre-verify", "post-verify", "post-browser"]) {
  return {
    contract: "AVANTIQO_CODE_HYPOTHESIS_DEBUGGING_V1",
    falsification_first: true,
    hypotheses: [
      { id: "H1", hypothesis: "authorization state is the root cause", status: "SUPPORTED", evidence_operation_ids: [ids[0]] },
      { id: "H2", hypothesis: "client state is the root cause", status: "ELIMINATED", evidence_operation_ids: [ids[1] || ids[0]] },
      { id: "H3", hypothesis: "render contract is the root cause", status: "ELIMINATED", evidence_operation_ids: [ids[2] || ids[1] || ids[0]] },
    ],
  };
}

function completedState(overrides = {}) {
  return {
    contract: "AVANTIQO_CODE_AI_MISSION_V1",
    mission_id: "code-mission-test",
    objective: "Fix broken customer invoice form",
    repository_url: "https://github.com/churchillkaron/churchill-control-new",
    ref: "main",
    base_commit: "a".repeat(40),
    completed_operation_ids: ["pre-verify", "apply", "post-verify", "post-browser"],
    created_at: "2026-09-24T12:00:00.000Z",
    updated_at: "2026-09-24T12:01:00.000Z",
    files_changed: ["app/invoices/page.jsx"],
    source_changes: [{ path: "app/invoices/page.jsx", operation: "write", content: "export default function Page(){}" }],
    verification: [{ passed: true, family: "browser" }],
    tests: [{ exit_code: 0, command: "node", args: ["--test", "tests/invoice.test.mjs"] }],
    hypothesis_debugging: resolvedHypothesisDebugging(),
    evidence: [
      { kind: "operation", operation_id: "pre-verify", action: "verify", status: "completed", result: { exit_code: 1 } },
      { kind: "causal_hypothesis_record", hypotheses: ["auth", "state", "contract"] },
      { kind: "operation", operation_id: "apply", action: "apply_files", status: "completed", result: {} },
      { kind: "operation", operation_id: "post-verify", action: "verify", status: "completed", result: { exit_code: 0 } },
      { kind: "operation", operation_id: "post-browser", action: "browser_verify", status: "completed", result: { passed: true } },
    ],
    verified_engineering_memory: {
      contract: "AVANTIQO_CODE_AI_VERIFIED_ENGINEERING_MEMORY_V1",
      evaluated: true,
      attestation_required: true,
      verified_completion_required: true,
      current_head_revalidation_required: true,
      patch_replay_allowed: false,
      automatic_knowledge_promotion: false,
      authorization_effect: "NONE",
    },
    formed_engineering_skills: {
      contract: "AVANTIQO_CODE_AI_ENGINEERING_SKILL_V1",
      evaluated: true,
      lifecycle_evaluated: true,
      current_head_revalidation_required: true,
      patch_replay_allowed: false,
      persisted_as_trusted_rule: false,
      automatic_knowledge_promotion: false,
      authorization_effect: "NONE",
    },
    employee_completion: {
      verified: true,
      behavioral_verification: {
        required: true,
        verified: true,
        matched_impacted_test_count: 1,
        broad_test_operation_ids: [],
      },
    },
    parallel_specialist_review: {
      completed: true,
      reviewer_count_requested: 2,
      reviewer_count_succeeded: 2,
      architecture_performance_review_present: true,
      adversarial_risk_review_present: true,
      reviews: [{ role: "architecture_performance", success: true }, { role: "adversarial_risk", success: true }],
    },
    final_independent_review: { verified: true, status: "APPROVED" },
    final_independent_review_gate: { contract: "AVANTIQO_CODE_AI_FINAL_INDEPENDENT_REVIEW_V1", verified: true, fingerprint_matches: true, required_approvals: 2, observed_approvals: 2, blocking_finding_count: 0, blocker: null },
    ...overrides,
  };
}

test("engineering OS classifies mission departments deterministically", () => {
  const classification = classifyCodeAIEngineeringMission({
    objective: "Fix the broken auth form and database RLS regression and make it faster",
    state: { files_changed: ["app/login/page.jsx", "supabase/migrations/001.sql"] },
  });
  assert.equal(classification.defect, true);
  assert.equal(classification.ui, true);
  assert.equal(classification.database, true);
  assert.equal(classification.security, true);
  assert.equal(classification.performance, true);
  assert.equal(classification.high_risk, true);
});

test("engineering OS binds all 17 upgrade departments into one constitution", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({
    objective: "Make the whole platform release ready and world-class",
    objective_context: { workspace_target: "DEVICE" },
  });
  assert.equal(prepared.control.contract, CODE_AI_ENGINEERING_OPERATING_SYSTEM_CONTRACT);
  assert.equal(prepared.control.departments.length, 17);
  assert.equal(prepared.control.routing.preferred_lane, "NODE01_LOCAL_FIRST");
  assert.equal(prepared.control.routing.external_frontier_allowed, false);
  assert.equal(prepared.control.program_manager.active, true);
  assert.equal(prepared.control.benchmark.required, true);
  assert.match(prepared.directive, /MANDATORY MISSION CONSTITUTION/);
  assert.match(prepared.objective, /HIDDEN BENCHMARK/);
});

test("defect mission requires reproduction hypotheses adversarial testing and browser proof when UI is affected", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken invoice form" });
  assert.equal(prepared.control.reproduction.required, true);
  assert.equal(prepared.control.hypothesis_debugging.minimum_hypotheses_when_ambiguous, 3);
  assert.equal(prepared.control.adversarial_testing.required, true);
  assert.equal(prepared.control.browser_department.required, true);
  assert.ok(prepared.control.engineering_team.roles.includes("FINAL_ADVERSARIAL_REVIEWER"));
});

test("finalizer exposes missing required proof instead of declaring readiness by confidence", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken invoice form" });
  const final = finalizeCodeAIEngineeringOperatingSystem({
    prepared_control: prepared.control,
    result: { success: true, state: completedState({ verification: [], evidence: [] }) },
  });
  assert.equal(final.mission_success_claimed, true);
  assert.equal(final.engineering_os_ready, false);
  assert.ok(final.missing_required_departments.some((item) => item.key === "reproduction_first"));
  assert.ok(final.missing_required_departments.some((item) => item.key === "browser_verification"));
});

test("finalizer recognizes evidence-backed defect closure", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken invoice form" });
  const state = completedState({
    hypothesis_debugging: resolvedHypothesisDebugging(),
    reproduction: { exact_before_after_observed: true, exact_reproduction_key: "invoice-form" },
    security_review: { passed: true, scope: "authorization and tenant isolation", evidence_operation_ids: ["post-verify"] },
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  const required = final.department_readiness.filter((item) => item.required);
  assert.ok(required.every((item) => item.satisfied), JSON.stringify(final.missing_required_departments));
  assert.equal(final.engineering_os_ready, true);
});

test("engineering OS commit gate fails closed when a required department lacks proof", async () => {
  const { assertCodeAIEngineeringOSCommitReady } = await import("../lib/code/runtime/CodeAIEngineeringOperatingSystemRuntime.js");
  assert.throws(() => assertCodeAIEngineeringOSCommitReady({
    engineering_operating_system: {
      contract: CODE_AI_ENGINEERING_OPERATING_SYSTEM_CONTRACT,
      engineering_os_ready: false,
      missing_required_departments: [{ key: "browser_verification" }],
    },
  }), /CODE_AI_ENGINEERING_OS_REQUIRED_PROOF_MISSING:browser_verification/);
  assert.equal(assertCodeAIEngineeringOSCommitReady({}), true);
});

test("engineering OS carries prior architecture brain only as revalidated advisory evidence", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({
    objective: "Refactor invoice runtime",
    objective_context: {
      prior_architecture_brain: {
        found: true,
        mission_id: "old-mission",
        repository_head: "a".repeat(40),
        graph_hash: "deadbeef",
        graph: { contract: "GRAPH", node_count: 22 },
        integrity_verified: true,
      },
    },
  });
  assert.equal(prepared.control.prior_architecture_brain.mission_id, "old-mission");
  assert.equal(prepared.control.prior_architecture_brain_requires_current_head_revalidation, true);
  assert.match(prepared.directive, /Revalidate against the current repository head|revalidate against the current repository head/i);
});

test("one causal hypothesis record cannot satisfy the three-hypothesis defect gate", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken invoice form" });
  const state = completedState({
    hypothesis_debugging: null,
    evidence: [
      { kind: "operation", action: "verify", status: "completed", result: { exit_code: 1 } },
      { kind: "causal_hypothesis_record", hypotheses: ["auth"] },
      { kind: "operation", action: "apply_files", status: "completed", result: {} },
      { kind: "operation", action: "verify", status: "completed", result: { exit_code: 0 } },
      { kind: "operation", action: "browser_verify", status: "completed", result: { passed: true } },
    ],
    reproduction: { before_failure_observed: true, after_pass_observed: true },
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.equal(final.engineering_os_ready, false);
  assert.ok(final.missing_required_departments.some((item) => item.key === "hypothesis_debugging"));
});

test("completed browser verification does not satisfy UI gate when the browser result failed", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken invoice form" });
  const state = completedState({
    verification: [],
    reproduction: { before_failure_observed: true, after_pass_observed: true },
    hypothesis_debugging: { hypotheses: ["auth", "state", "contract"] },
    evidence: [
      { kind: "operation", action: "verify", status: "completed", result: { exit_code: 1 } },
      { kind: "causal_hypothesis_record", hypotheses: ["auth", "state", "contract"] },
      { kind: "operation", action: "apply_files", status: "completed", result: {} },
      { kind: "operation", action: "verify", status: "completed", result: { exit_code: 0 } },
      { kind: "operation", action: "browser_verify", status: "completed", result: { passed: false } },
    ],
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.equal(final.engineering_os_ready, false);
  assert.ok(final.missing_required_departments.some((item) => item.key === "browser_verification"));
});

test("passing pre-edit verification cannot masquerade as defect reproduction", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken invoice form" });
  const state = completedState({
    reproduction: null,
    hypothesis_debugging: { hypotheses: ["auth", "state", "contract"] },
    evidence: [
      { kind: "operation", action: "verify", status: "completed", result: { exit_code: 0 } },
      { kind: "causal_hypothesis_record", hypotheses: ["auth", "state", "contract"] },
      { kind: "operation", action: "apply_files", status: "completed", result: {} },
      { kind: "operation", action: "verify", status: "completed", result: { exit_code: 0 } },
      { kind: "operation", action: "browser_verify", status: "completed", result: { passed: true } },
    ],
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.equal(final.engineering_os_ready, false);
  assert.ok(final.missing_required_departments.some((item) => item.key === "reproduction_first"));
});

test("database and security reviews cannot rely on stale pre-mutation verification", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken database RLS authorization" });
  const state = completedState({
    objective: "Fix broken database RLS authorization",
    files_changed: ["supabase/migrations/999_fix_rls.sql"],
    source_changes: [{ path: "supabase/migrations/999_fix_rls.sql", operation: "write", content: "alter policy ..." }],
    verification: [{ passed: true, family: "tests" }],
    database_review: {
      passed: true,
      migration_plan: "bounded migration",
      backward_compatibility: "preserved",
      rollback_plan: "rollback prepared",
    },
    security_review: { passed: true, scope: "RLS and organization isolation" },
    reproduction: { before_failure_observed: true, after_pass_observed: true },
    hypothesis_debugging: { hypotheses: ["policy", "membership", "scope"] },
    evidence: [
      { kind: "operation", action: "verify", status: "completed", result: { exit_code: 0 } },
      { kind: "causal_hypothesis_record", hypotheses: ["policy", "membership", "scope"] },
      { kind: "operation", action: "apply_files", status: "completed", result: {} },
    ],
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.ok(final.missing_required_departments.some((item) => item.key === "database_department"));
  assert.ok(final.missing_required_departments.some((item) => item.key === "security_engineering"));
});

test("legacy reproduction booleans alone cannot satisfy exact defect closure", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken invoice form" });
  const state = completedState({
    reproduction: { before_failure_observed: true, after_pass_observed: true },
    hypothesis_debugging: { hypotheses: ["auth", "state", "contract"] },
    evidence: [
      { kind: "causal_hypothesis_record", hypotheses: ["auth", "state", "contract"] },
      { kind: "operation", action: "apply_files", status: "completed", result: {} },
      { kind: "operation", action: "browser_verify", status: "completed", result: { passed: true } },
    ],
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.equal(final.engineering_os_ready, false);
  assert.ok(final.missing_required_departments.some((item) => item.key === "reproduction_first"));
});

test("broad program requires a real independently verified hidden benchmark contract", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Make the whole platform world-class" });
  const state = {
    mission_id: "broad-benchmark-test",
    objective: "Make the whole platform world-class",
    files_changed: [],
    source_changes: [],
    evidence: [],
    verification: [],
    tests: [],
    parallel_specialist_review: {
      completed: true,
      reviewer_count_requested: 2,
      reviewer_count_succeeded: 2,
      architecture_performance_review_present: true,
      adversarial_risk_review_present: true,
    },
    final_independent_review: { verified: true, status: "APPROVED" },
    final_independent_review_gate: { contract: "AVANTIQO_CODE_AI_FINAL_INDEPENDENT_REVIEW_V1", verified: true, fingerprint_matches: true, required_approvals: 2, observed_approvals: 2, blocking_finding_count: 0, blocker: null },
    program_plan: { active: true },
    benchmark_scorecard: { held_out: true, verified: true },
  };
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.equal(final.engineering_os_ready, false);
  assert.ok(final.missing_required_departments.some((item) => item.key === "hidden_benchmark"));

  const verified = finalizeCodeAIEngineeringOperatingSystem({
    prepared_control: prepared.control,
    result: {
      success: true,
      state: {
        ...state,
        hidden_benchmark_certification: {
          contract: "AVANTIQO_CODE_AI_HIDDEN_BENCHMARK_V2",
          held_out: true,
          verified: true,
          case_count: 20,
          pass_rate: 0.95,
          independent_verification_required: true,
          candidate_self_report_authority: false,
        },
      },
    },
  });
  assert.ok(!verified.missing_required_departments.some((item) => item.key === "hidden_benchmark"));
});

test("required memory self-improvement and routing departments fail closed without their evidence", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Inspect and improve invoice handling" });
  const state = completedState({
    verified_engineering_memory: null,
    formed_engineering_skills: null,
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.equal(final.engineering_os_ready, false);
  assert.ok(final.missing_required_departments.some((item) => item.key === "engineering_memory"));
  assert.ok(final.missing_required_departments.some((item) => item.key === "self_improvement"));
  assert.ok(!final.missing_required_departments.some((item) => item.key === "dynamic_routing"));

  const brokenRouting = finalizeCodeAIEngineeringOperatingSystem({
    prepared_control: { ...prepared.control, routing: { contract: "BROKEN" } },
    result: { success: true, state: completedState() },
  });
  assert.ok(brokenRouting.missing_required_departments.some((item) => item.key === "dynamic_routing"));
});

test("ordinary post-mutation verification cannot satisfy adversarial testing", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken invoice form" });
  const state = completedState({
    behavioral_verification: null,
    employee_completion: { verified: true, behavioral_verification: { verified: false }, final_review: { complete: true } },
    precision_evidence: {},
    reproduction: { exact_before_after_observed: true, exact_reproduction_key: "invoice-form" },
    hypothesis_debugging: { hypotheses: ["auth", "state", "contract"] },
    evidence: [
      { kind: "causal_hypothesis_record", hypotheses: ["auth", "state", "contract"] },
      { kind: "operation", action: "apply_files", status: "completed", result: {} },
      { kind: "operation", action: "verify", status: "completed", result: { exit_code: 0 } },
      { kind: "operation", action: "browser_verify", status: "completed", result: { passed: true } },
    ],
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.equal(final.engineering_os_ready, false);
  assert.ok(final.missing_required_departments.some((item) => item.key === "adversarial_testing"));
});

test("verified mutation or fuzz evidence satisfies adversarial testing only with real observed provenance", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken invoice form" });
  for (const precision_evidence of [
    { mutation_testing: { contract: "AVANTIQO_CODE_MUTATION_TEST_V1", passed: true, verified: true, evidence_operation_ids: ["adversarial-op"] } },
    { property_fuzz: { contract: "AVANTIQO_CODE_FUZZ_TEST_V1", passed: true, verified: true, evidence_operation_ids: ["adversarial-op"] } },
  ]) {
    const state = completedState({
      behavioral_verification: null,
      employee_completion: { verified: true, behavioral_verification: { verified: false }, final_review: { complete: true } },
      precision_evidence,
      reproduction: { exact_before_after_observed: true, exact_reproduction_key: "invoice-form" },
      hypothesis_debugging: { hypotheses: ["auth", "state", "contract"] },
      evidence: [
        { kind: "causal_hypothesis_record", hypotheses: ["auth", "state", "contract"] },
        { kind: "operation", operation_id: "apply-op", action: "apply_files", status: "completed", result: {} },
        { kind: "operation", operation_id: "verify-op", action: "verify", status: "completed", result: { exit_code: 0 } },
        { kind: "operation", operation_id: "adversarial-op", action: "mutation_test", status: "completed", result: { passed: true } },
        { kind: "operation", operation_id: "browser-op", action: "browser_verify", status: "completed", result: { passed: true } },
      ],
    });
    const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
    assert.ok(!final.missing_required_departments.some((item) => item.key === "adversarial_testing"));
  }
});

test("spoofed mutation or fuzz flags without contract and operation provenance cannot satisfy adversarial testing", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken invoice form" });
  for (const precision_evidence of [
    { mutation_testing: { passed: true, verified: true } },
    { property_fuzz: { passed: true, verified: true } },
  ]) {
    const state = completedState({
      behavioral_verification: null,
      employee_completion: { verified: true, behavioral_verification: { verified: false }, final_review: { complete: true } },
      precision_evidence,
      reproduction: { exact_before_after_observed: true, exact_reproduction_key: "invoice-form" },
      hypothesis_debugging: { hypotheses: ["auth", "state", "contract"] },
      evidence: [
        { kind: "causal_hypothesis_record", hypotheses: ["auth", "state", "contract"] },
        { kind: "operation", operation_id: "apply-op", action: "apply_files", status: "completed", result: {} },
        { kind: "operation", operation_id: "verify-op", action: "verify", status: "completed", result: { exit_code: 0 } },
        { kind: "operation", operation_id: "browser-op", action: "browser_verify", status: "completed", result: { passed: true } },
      ],
    });
    const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
    assert.ok(final.missing_required_departments.some((item) => item.key === "adversarial_testing"));
  }
});

test("verified behavioral record without impacted or broad test proof cannot satisfy adversarial testing", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken invoice form" });
  const state = completedState({
    behavioral_verification: { required: false, verified: true, matched_impacted_test_count: 0, broad_test_operation_ids: [] },
    employee_completion: { verified: true, behavioral_verification: { required: false, verified: true, matched_impacted_test_count: 0, broad_test_operation_ids: [] }, final_review: { complete: true } },
    precision_evidence: {},
    reproduction: { exact_before_after_observed: true, exact_reproduction_key: "invoice-form" },
    hypothesis_debugging: { hypotheses: ["auth", "state", "contract"] },
    evidence: [
      { kind: "causal_hypothesis_record", hypotheses: ["auth", "state", "contract"] },
      { kind: "operation", action: "apply_files", status: "completed", result: {} },
      { kind: "operation", action: "verify", status: "completed", result: { exit_code: 0 } },
      { kind: "operation", action: "browser_verify", status: "completed", result: { passed: true } },
    ],
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.ok(final.missing_required_departments.some((item) => item.key === "adversarial_testing"));
});

test("runtime observability cannot rely on telemetry linked only to pre-mutation operations", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken API runtime endpoint" });
  const state = completedState({
    files_changed: ["app/api/example/route.js"],
    source_changes: [{ path: "app/api/example/route.js", operation: "write", content: "export async function GET(){}" }],
    reproduction: { exact_before_after_observed: true, exact_reproduction_key: "api-runtime" },
    hypothesis_debugging: { hypotheses: ["route", "auth", "runtime"] },
    observability_evidence: {
      records: [{ source: "runtime logs", summary: "old logs", evidence_operation_ids: ["pre-runtime"] }],
    },
    evidence: [
      { kind: "operation", operation_id: "pre-runtime", action: "run", status: "completed", result: { exit_code: 0 } },
      { kind: "causal_hypothesis_record", hypotheses: ["route", "auth", "runtime"] },
      { kind: "operation", operation_id: "apply", action: "apply_files", status: "completed", result: {} },
      { kind: "operation", operation_id: "post-verify", action: "verify", status: "completed", result: { exit_code: 0 } },
    ],
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.ok(final.missing_required_departments.some((item) => item.key === "runtime_observability"));
});

test("runtime observability accepts evidence linked to a successful post-mutation operation", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken API runtime endpoint" });
  const state = completedState({
    files_changed: ["app/api/example/route.js"],
    source_changes: [{ path: "app/api/example/route.js", operation: "write", content: "export async function GET(){}" }],
    reproduction: { exact_before_after_observed: true, exact_reproduction_key: "api-runtime" },
    hypothesis_debugging: { hypotheses: ["route", "auth", "runtime"] },
    observability_evidence: {
      records: [{ source: "runtime logs", summary: "fresh logs", evidence_operation_ids: ["post-runtime"] }],
    },
    evidence: [
      { kind: "operation", operation_id: "pre-runtime", action: "run", status: "completed", result: { exit_code: 0 } },
      { kind: "causal_hypothesis_record", hypotheses: ["route", "auth", "runtime"] },
      { kind: "operation", operation_id: "apply", action: "apply_files", status: "completed", result: {} },
      { kind: "operation", operation_id: "post-runtime", action: "run", status: "completed", result: { exit_code: 0 } },
    ],
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.ok(!final.missing_required_departments.some((item) => item.key === "runtime_observability"));
});

test("generic performance verified flag cannot certify a performance mission", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix slow API runtime performance" });
  const state = completedState({
    engineering_performance: { verified: true },
    performance_evidence: null,
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.ok(final.missing_required_departments.some((item) => item.key === "performance_proof"));
});

test("measured comparable before-after benchmark certifies the performance department", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix slow API runtime performance" });
  const state = completedState({
    performance_evidence: {
      contract: "AVANTIQO_CODE_PERFORMANCE_EVIDENCE_V1",
      passed: true,
      benchmark_key: "api-p95-stable-config",
      metric: "p95 latency",
      direction: "lower_is_better",
      minimum_improvement_percent: 5,
      measured_improvement_percent: 25,
      before: 120,
      after: 90,
      before_operation_id: "perf-before",
      after_operation_id: "perf-after",
      evidence_operation_ids: ["perf-before", "perf-after"],
    },
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.ok(!final.missing_required_departments.some((item) => item.key === "performance_proof"));
});

test("pre-mutation browser verification cannot certify changed UI", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken invoice form UI" });
  const state = completedState({
    verification: [{ passed: true, family: "browser", operation_id: "pre-browser" }],
    reproduction: { exact_before_after_observed: true, exact_reproduction_key: "invoice-ui" },
    hypothesis_debugging: { hypotheses: ["layout", "state", "event"] },
    evidence: [
      { kind: "operation", operation_id: "pre-browser", action: "browser_verify", status: "completed", result: { passed: true } },
      { kind: "causal_hypothesis_record", hypotheses: ["layout", "state", "event"] },
      { kind: "operation", operation_id: "apply", action: "apply_files", status: "completed", result: {} },
      { kind: "operation", operation_id: "post-test", action: "verify", status: "completed", result: { exit_code: 0 } },
    ],
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.ok(final.missing_required_departments.some((item) => item.key === "browser_verification"));
});

test("non-browser post-mutation operation cannot masquerade as browser proof", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken invoice form UI" });
  const state = completedState({
    verification: [{ passed: true, family: "browser", operation_id: "post-test" }],
    reproduction: { exact_before_after_observed: true, exact_reproduction_key: "invoice-ui" },
    hypothesis_debugging: { hypotheses: ["layout", "state", "event"] },
    evidence: [
      { kind: "operation", operation_id: "pre-fail", action: "verify", status: "completed", result: { exit_code: 1 } },
      { kind: "causal_hypothesis_record", hypotheses: ["layout", "state", "event"] },
      { kind: "operation", operation_id: "apply", action: "apply_files", status: "completed", result: {} },
      { kind: "operation", operation_id: "post-test", action: "verify", status: "completed", result: { exit_code: 0 } },
    ],
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.ok(final.missing_required_departments.some((item) => item.key === "browser_verification"));
});

test("high-risk multi-agent gate requires both specialist and independent final review", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken invoice authorization" });
  const base = completedState({
    security_review: { passed: true, scope: "authorization", evidence_operation_ids: ["post-verify"] },
  });

  const independentOnly = finalizeCodeAIEngineeringOperatingSystem({
    prepared_control: prepared.control,
    result: { success: true, state: { ...base, parallel_specialist_review: { completed: false, reviewer_count_requested: 2, reviewer_count_succeeded: 0, architecture_performance_review_present: false, adversarial_risk_review_present: false }, final_independent_review: { verified: true, status: "APPROVED" }, final_independent_review_gate: { verified: true } } },
  });
  assert.ok(independentOnly.missing_required_departments.some((item) => item.key === "multi_agent_team"));

  const specialistOnly = finalizeCodeAIEngineeringOperatingSystem({
    prepared_control: prepared.control,
    result: { success: true, state: { ...base, parallel_specialist_review: { completed: true, reviewer_count_requested: 2, reviewer_count_succeeded: 2, architecture_performance_review_present: true, adversarial_risk_review_present: true }, final_independent_review: { verified: false, status: "UNAVAILABLE" }, final_independent_review_gate: { contract: "AVANTIQO_CODE_AI_FINAL_INDEPENDENT_REVIEW_V1", verified: false, fingerprint_matches: false, required_approvals: 2, observed_approvals: 0, blocking_finding_count: 0, blocker: "CODE_AI_FINAL_INDEPENDENT_REVIEW_UNAVAILABLE" } } },
  });
  assert.ok(specialistOnly.missing_required_departments.some((item) => item.key === "multi_agent_team"));

  const both = finalizeCodeAIEngineeringOperatingSystem({
    prepared_control: prepared.control,
    result: { success: true, state: base },
  });
  assert.ok(!both.missing_required_departments.some((item) => item.key === "multi_agent_team"));
});


test("partial specialist council cannot satisfy high-risk multi-agent gate", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken invoice authorization" });
  const state = completedState({
    parallel_specialist_review: {
      completed: true,
      reviewer_count_requested: 2,
      reviewer_count_succeeded: 1,
      architecture_performance_review_present: true,
      adversarial_risk_review_present: false,
    },
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.ok(final.missing_required_departments.some((item) => item.key === "multi_agent_team"));
});


test("generic failing-before and passing-after operations cannot replace keyed reproduction", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken invoice form" });
  const state = completedState({
    reproduction: null,
    hypothesis_debugging: { hypotheses: ["auth", "state", "contract"] },
    evidence: [
      { kind: "operation", operation_id: "before", action: "verify", status: "completed", result: { exit_code: 1 } },
      { kind: "causal_hypothesis_record", hypotheses: ["auth", "state", "contract"] },
      { kind: "operation", operation_id: "apply", action: "apply_files", status: "completed", result: {} },
      { kind: "operation", operation_id: "after", action: "verify", status: "completed", result: { exit_code: 0 } },
      { kind: "operation", operation_id: "browser", action: "browser_verify", status: "completed", result: { passed: true } },
    ],
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.ok(final.missing_required_departments.some((item) => item.key === "reproduction_first"));
});


test("mission id alone cannot satisfy durable runtime proof", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Inspect invoice runtime" });
  const state = completedState({
    contract: null,
    repository_url: null,
    ref: null,
    base_commit: null,
    completed_operation_ids: null,
    created_at: null,
    updated_at: null,
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.ok(final.missing_required_departments.some((item) => item.key === "durable_runtime"));
});

test("broad program requires the real bounded Product Engineering portfolio contract", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Make the whole platform world-class" });
  const fake = completedState({
    program_plan: { active: true },
    product_portfolio: null,
    hidden_benchmark_certification: {
      contract: "AVANTIQO_CODE_AI_HIDDEN_BENCHMARK_V2",
      held_out: true,
      verified: true,
      case_count: 20,
      pass_rate: 0.95,
      independent_verification_required: true,
      candidate_self_report_authority: false,
    },
  });
  const fakeFinal = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state: fake } });
  assert.ok(fakeFinal.missing_required_departments.some((item) => item.key === "program_manager"));

  const real = completedState({
    product_portfolio: {
      contract: "AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_V1",
      portfolio_id: "product-portfolio:test",
      business_goal: "Make the whole platform world-class",
      repository_url: "https://github.com/churchillkaron/churchill-control-new",
      ref: "main",
      current_main_head: "b".repeat(40),
      roadmap: [{
        node_id: "portfolio-node:test",
        objective: "Harden Code Studio evidence gates",
        dependencies: [],
        evidence_paths: ["lib/code/runtime/CodeAIEngineeringOperatingSystemRuntime.js"],
        execution_serialized_by_main_only: true,
      }],
      executor_policy: {
        maximum_active_engineering_cycles: 1,
        parallel_code_execution_allowed: false,
        main_only: true,
        branch_or_worktree_fanout_allowed: false,
        automatic_commit_allowed: false,
        automatic_deploy_allowed: false,
        automatic_migration_execution_allowed: false,
      },
    },
    hidden_benchmark_certification: {
      contract: "AVANTIQO_CODE_AI_HIDDEN_BENCHMARK_V2",
      held_out: true,
      verified: true,
      case_count: 20,
      pass_rate: 0.95,
      independent_verification_required: true,
      candidate_self_report_authority: false,
    },
  });
  const realFinal = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state: real } });
  assert.ok(!realFinal.missing_required_departments.some((item) => item.key === "program_manager"));
});

test("multi-repository department requires verified independent heads and dependency order", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Coordinate multi-repo changes across API and web" });
  const fake = completedState({ multi_repository_coordination: { all_verified: true } });
  const fakeFinal = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state: fake } });
  assert.ok(fakeFinal.missing_required_departments.some((item) => item.key === "scm_multi_repo"));

  const real = completedState({
    multi_repository_coordination: {
      contract: "AVANTIQO_CODE_AI_MULTI_REPOSITORY_MISSION_V1",
      repositories: [
        { id: "api", repository_url: "https://github.com/x/api", base_commit: "a".repeat(40), verified: true },
        { id: "web", repository_url: "https://github.com/x/web", base_commit: "b".repeat(40), verified: true },
      ],
      dependency_order: ["api", "web"],
      independent_heads_required: true,
      independent_verification_required: true,
      all_verified: true,
      commit_authority: false,
      merge_authority: false,
      deploy_authority: false,
    },
  });
  const realFinal = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state: real } });
  assert.ok(!realFinal.missing_required_departments.some((item) => item.key === "scm_multi_repo"));
});

test("architecture brain cannot certify a changed path without observed source content", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Refactor invoice runtime" });
  const state = completedState({
    files_changed: ["lib/unobserved.js"],
    source_changes: [],
    source_read_evidence: [],
    evidence: [{ kind: "operation", operation_id: "post-verify", action: "verify", status: "completed", result: { exit_code: 0 } }],
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.ok(final.missing_required_departments.some((item) => item.key === "architecture_brain"));
});


test("stale independent review fingerprint cannot satisfy high-risk multi-agent gate", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Fix broken invoice authorization" });
  const state = completedState({
    final_independent_review_gate: {
      contract: "AVANTIQO_CODE_AI_FINAL_INDEPENDENT_REVIEW_V1",
      verified: true,
      fingerprint_matches: false,
      required_approvals: 2,
      observed_approvals: 2,
      blocking_finding_count: 0,
      blocker: null,
    },
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.ok(final.missing_required_departments.some((item) => item.key === "multi_agent_team"));
});


test("spoofed engineering memory and skill contracts cannot satisfy learning departments", () => {
  const prepared = prepareCodeAIEngineeringOperatingSystem({ objective: "Inspect invoice runtime" });
  const state = completedState({
    verified_engineering_memory: { contract: "FAKE", evaluated: true, current_head_revalidation_required: true },
    formed_engineering_skills: { contract: "FAKE", evaluated: true, lifecycle_evaluated: true, automatic_knowledge_promotion: false },
  });
  const final = finalizeCodeAIEngineeringOperatingSystem({ prepared_control: prepared.control, result: { success: true, state } });
  assert.ok(final.missing_required_departments.some((item) => item.key === "engineering_memory"));
  assert.ok(final.missing_required_departments.some((item) => item.key === "self_improvement"));
});
