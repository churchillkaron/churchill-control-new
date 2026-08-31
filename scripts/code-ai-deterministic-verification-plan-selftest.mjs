import assert from "node:assert/strict";

import {
  planCodeAIDeterministicVerificationGates,
  CODE_AI_DETERMINISTIC_VERIFICATION_PLAN_CONTRACT,
} from "../lib/code/runtime/CodeAIDeterministicVerificationPlanRuntime.js";

function state(paths, extra = {}) {
  return {
    files_changed: paths,
    source_changes: paths.map((path) => ({ path, operation: "write", content: "x" })),
    repository_guidance: {},
    ...extra,
  };
}

function completedOperation(operation_id, action, result = null) {
  return {
    kind: "operation",
    operation_id,
    action,
    status: "completed",
    ...(result ? { result } : {}),
  };
}

const authoritativeTest = {
  command: "node",
  args: ["scripts/project-test.mjs"],
};

const standard = planCodeAIDeterministicVerificationGates({
  state: state(["lib/example.js"]),
  authoritative_verification: authoritativeTest,
});
assert.equal(standard.contract, CODE_AI_DETERMINISTIC_VERIFICATION_PLAN_CONTRACT);
assert.equal(standard.risk, "standard");
assert.equal(standard.path_risk, "standard");
assert.equal(standard.repository_impact_risk, "none");
assert.equal(standard.required_verification_gates, 1);
assert.equal(standard.planned_independent_gate_count, 0);
assert.equal(standard.expected_required_gate_count_satisfied, true);

const high = planCodeAIDeterministicVerificationGates({
  state: state(["app/api/example/route.js"]),
  authoritative_verification: authoritativeTest,
});
assert.equal(high.risk, "high");
assert.equal(high.required_verification_gates, 2);
assert.equal(high.planned_independent_gate_count, 1);
assert.deepEqual(high.planned_families, ["syntax"]);
assert.equal(high.operations[0].input.command, "node");
assert.deepEqual(high.operations[0].input.args, ["--check", "app/api/example/route.js"]);
assert.equal(high.expected_required_gate_count_satisfied, true);

const impactAwareHigh = planCodeAIDeterministicVerificationGates({
  state: state(["lib/example.js"], {
    evidence: [
      completedOperation("read-1", "read", { file_path: "app/api/orders/route.js" }),
      completedOperation("read-2", "read", { file_path: "components/orders/OrderTable.js" }),
      completedOperation("read-3", "read", { file_path: "lib/orders/runtime.js" }),
      completedOperation("read-4", "read", { file_path: "services/orders/worker.js" }),
      completedOperation("read-5", "read", { file_path: "config/orders/policy.js" }),
    ],
  }),
  authoritative_verification: authoritativeTest,
});
assert.equal(impactAwareHigh.path_risk, "standard");
assert.equal(impactAwareHigh.repository_impact_risk, "high");
assert.equal(impactAwareHigh.risk, "high");
assert.equal(impactAwareHigh.required_verification_gates, 2);
assert.equal(impactAwareHigh.planned_independent_gate_count, 1);
assert.deepEqual(impactAwareHigh.planned_families, ["syntax"]);
assert.equal(impactAwareHigh.expected_required_gate_count_satisfied, true);

const critical = planCodeAIDeterministicVerificationGates({
  state: state(["auth/session.js"]),
  authoritative_verification: authoritativeTest,
});
assert.equal(critical.risk, "critical");
assert.equal(critical.required_verification_gates, 3);
assert.equal(critical.planned_independent_gate_count, 2);
assert.deepEqual(critical.planned_families, ["syntax", "command:git"]);
assert.equal(critical.operations[1].input.command, "git");
assert.deepEqual(critical.operations[1].input.args, ["diff", "--check"]);
assert.equal(critical.expected_required_gate_count_satisfied, true);

const criticalTypescript = planCodeAIDeterministicVerificationGates({
  state: state(["auth/session.ts"]),
  authoritative_verification: authoritativeTest,
});
assert.equal(criticalTypescript.risk, "critical");
assert.equal(criticalTypescript.planned_independent_gate_count, 1);
assert.deepEqual(criticalTypescript.planned_families, ["command:git"]);
assert.equal(criticalTypescript.expected_required_gate_count_satisfied, false);

const pythonWithoutEvidence = planCodeAIDeterministicVerificationGates({
  state: state(["auth/session.py"]),
  authoritative_verification: { command: "pytest", args: ["tests"] },
});
assert.equal(pythonWithoutEvidence.python_runtime_evidence_present, false);
assert.ok(!pythonWithoutEvidence.planned_families.includes("syntax"));

const pythonWithEvidence = planCodeAIDeterministicVerificationGates({
  state: state(["auth/session.py"], {
    repository_guidance: {
      verification_commands_text: "pyproject.toml | test | pytest => python -m pytest",
    },
  }),
  authoritative_verification: { command: "pytest", args: ["tests"] },
});
assert.equal(pythonWithEvidence.python_runtime_evidence_present, true);
assert.ok(pythonWithEvidence.planned_families.includes("syntax"));
assert.equal(pythonWithEvidence.operations[0].input.command, "python");
assert.deepEqual(
  pythonWithEvidence.operations[0].input.args,
  ["-m", "compileall", "-q", "auth/session.py"],
);

const deletedJs = planCodeAIDeterministicVerificationGates({
  state: {
    files_changed: ["auth/removed.js"],
    source_changes: [{ path: "auth/removed.js", operation: "delete", content: null }],
    repository_guidance: {},
  },
  authoritative_verification: authoritativeTest,
});
assert.ok(!deletedJs.planned_families.includes("syntax"));
assert.deepEqual(deletedJs.planned_families, ["command:git"]);
assert.equal(deletedJs.expected_required_gate_count_satisfied, false);

const failedVerifierDebt = planCodeAIDeterministicVerificationGates({
  state: state(["lib/example.js"], {
    evidence: [
      completedOperation("verify_failed", "verify"),
      completedOperation("apply_fix", "apply_files"),
    ],
    tests: [{
      operation_id: "verify_failed",
      command: "node",
      args: ["--test", "tests/example.test.mjs"],
      exit_code: 1,
    }],
  }),
  authoritative_verification: authoritativeTest,
});
assert.equal(failedVerifierDebt.failed_verifier_debt_required, true);
assert.equal(failedVerifierDebt.failed_verifier_debt_verified, false);
assert.equal(failedVerifierDebt.unresolved_failed_verifier_count, 1);
assert.equal(failedVerifierDebt.exact_failed_verifier_replay_count, 1);
assert.equal(failedVerifierDebt.planned_failed_verifier_debt_count, 1);
assert.equal(failedVerifierDebt.operations[0].obligation, "FAILED_VERIFIER_DEBT");
assert.equal(failedVerifierDebt.operations[0].input.command, "node");
assert.deepEqual(
  failedVerifierDebt.operations[0].input.args,
  ["--test", "tests/example.test.mjs"],
);
assert.equal(failedVerifierDebt.all_known_deterministic_debt_planned, true);
assert.equal(failedVerifierDebt.unsafe_test_runner_guessing_performed, false);

for (const plan of [
  standard,
  high,
  impactAwareHigh,
  critical,
  criticalTypescript,
  pythonWithoutEvidence,
  pythonWithEvidence,
  deletedJs,
  failedVerifierDebt,
]) {
  assert.equal(plan.model_call_performed, false);
  assert.equal(plan.provider_call_performed, false);
  assert.equal(plan.source_mutation_authority, false);
  assert.equal(plan.verification_weakening_allowed, false);
  assert.equal(plan.authorization_effect, "NONE");
}

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_DETERMINISTIC_VERIFICATION_PLAN_SELFTEST_V3",
  planner_contract: CODE_AI_DETERMINISTIC_VERIFICATION_PLAN_CONTRACT,
  standard_extra_gate_count: standard.planned_independent_gate_count,
  high_extra_gate_count: high.planned_independent_gate_count,
  impact_aware_high_extra_gate_count: impactAwareHigh.planned_independent_gate_count,
  critical_extra_gate_count: critical.planned_independent_gate_count,
  quality_and_planner_risk_are_aligned: true,
  repository_impact_can_raise_verification_depth: true,
  failed_verifier_debt_replayed_exactly: true,
  unsupported_critical_fabricated_coverage: false,
  python_runtime_requires_repository_evidence: true,
  deleted_files_excluded_from_syntax_checks: true,
  unsafe_test_runner_guessing_performed: false,
  provider_call_performed_by_selftest: false,
  provider_spend_performed_by_selftest: false,
  source_mutation_performed_by_selftest: false,
  production_deploy_performed: false,
}, null, 2));