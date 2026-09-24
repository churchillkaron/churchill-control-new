import test from "node:test";
import assert from "node:assert/strict";

import {
  CODE_AI_ENGINEERING_OPERATING_SYSTEM_CONTRACT,
  classifyCodeAIEngineeringMission,
  prepareCodeAIEngineeringOperatingSystem,
  finalizeCodeAIEngineeringOperatingSystem,
} from "../lib/code/runtime/CodeAIEngineeringOperatingSystemRuntime.js";

function completedState(overrides = {}) {
  return {
    mission_id: "code-mission-test",
    objective: "Fix broken customer invoice form",
    base_commit: "a".repeat(40),
    files_changed: ["app/invoices/page.jsx"],
    source_changes: [{ path: "app/invoices/page.jsx", operation: "write", content: "export default function Page(){}" }],
    verification: [{ passed: true, family: "browser" }],
    tests: [{ exit_code: 0, command: "node", args: ["--test", "tests/invoice.test.mjs"] }],
    evidence: [
      { kind: "operation", action: "verify", status: "completed", result: { exit_code: 1 } },
      { kind: "causal_hypothesis_record", hypotheses: ["auth", "state", "contract"] },
      { kind: "operation", action: "apply_files", status: "completed", result: {} },
      { kind: "operation", action: "verify", status: "completed", result: { exit_code: 0 } },
      { kind: "operation", action: "browser_verify", status: "completed", result: { passed: true } },
    ],
    employee_completion: {
      verified: true,
      behavioral_verification: { verified: true },
      final_review: { complete: true },
    },
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
    hypothesis_debugging: { hypotheses: ["auth", "state", "contract"] },
    reproduction: { before_failure_observed: true, after_pass_observed: true },
    security_review: { passed: true, scope: "authorization and tenant isolation" },
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
