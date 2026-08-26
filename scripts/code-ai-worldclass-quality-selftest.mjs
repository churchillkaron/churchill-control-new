import { assessCodeAIWorldClassQuality } from "../lib/code/runtime/CodeAIWorldClassRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_SELFTEST_V2";

function operation(id, action, index) {
  return {
    at: new Date(1_700_000_000_000 + index * 1000).toISOString(),
    kind: "operation",
    operation_id: id,
    action,
    status: "completed",
  };
}

function verifyState({ path, sequence, tests }) {
  return {
    contract: "AVANTIQO_CODE_AI_MISSION_V1",
    status: "completed",
    files_changed: [path],
    source_changes: [{ path, content: "export const value = 1;\n" }],
    patch: `diff --git a/${path} b/${path}\n+export const value = 1;\n`,
    evidence: sequence.map((entry, index) => operation(entry.id, entry.action, index)),
    verification: tests.map((test) => ({ operation_id: test.operation_id, passed: true })),
    tests: tests.map((test) => ({
      operation_id: test.operation_id,
      command: test.command,
      args: test.args,
      exit_code: 0,
    })),
  };
}

function assert(condition, code, evidence) {
  if (!condition) {
    throw new Error(`${code}:${JSON.stringify(evidence || null)}`);
  }
}

const standardPass = assessCodeAIWorldClassQuality(verifyState({
  path: "lib/example.js",
  sequence: [
    { id: "edit", action: "apply_files" },
    { id: "verify", action: "verify" },
    { id: "review", action: "diff" },
  ],
  tests: [{ operation_id: "verify", command: "node", args: ["--check", "lib/example.js"] }],
}));
assert(standardPass.verified === true, "STANDARD_FRESH_VERIFICATION_SHOULD_PASS", standardPass);
assert(standardPass.required_verification_gates === 1, "STANDARD_GATE_COUNT_INVALID", standardPass);
assert(standardPass.fresh_verification_family_count === 1, "STANDARD_FAMILY_COUNT_INVALID", standardPass);

const staleFail = assessCodeAIWorldClassQuality(verifyState({
  path: "lib/example.js",
  sequence: [
    { id: "verify-old", action: "verify" },
    { id: "edit", action: "apply_files" },
    { id: "review", action: "diff" },
  ],
  tests: [{ operation_id: "verify-old", command: "npm", args: ["test"] }],
}));
assert(staleFail.verified === false, "STALE_VERIFICATION_MUST_FAIL", staleFail);
assert(
  staleFail.blockers.some((item) => item.startsWith("CODE_AI_WORLDCLASS_FRESH_VERIFICATION_GATES_REQUIRED")),
  "STALE_VERIFICATION_BLOCKER_REQUIRED",
  staleFail,
);

const highSingleFail = assessCodeAIWorldClassQuality(verifyState({
  path: "app/api/example/route.js",
  sequence: [
    { id: "edit", action: "apply_files" },
    { id: "verify-1", action: "verify" },
    { id: "review", action: "diff" },
  ],
  tests: [{ operation_id: "verify-1", command: "node", args: ["--check", "app/api/example/route.js"] }],
}));
assert(highSingleFail.risk === "high", "HIGH_RISK_CLASSIFICATION_REQUIRED", highSingleFail);
assert(highSingleFail.required_verification_gates === 2, "HIGH_RISK_DOUBLE_GATE_REQUIRED", highSingleFail);
assert(highSingleFail.verified === false, "HIGH_RISK_SINGLE_GATE_MUST_FAIL", highSingleFail);

const highSameFamilyFail = assessCodeAIWorldClassQuality(verifyState({
  path: "app/api/example/route.js",
  sequence: [
    { id: "edit", action: "apply_files" },
    { id: "verify-1", action: "verify" },
    { id: "verify-2", action: "verify" },
    { id: "review", action: "diff" },
  ],
  tests: [
    { operation_id: "verify-1", command: "node", args: ["--check", "app/api/example/route.js"] },
    { operation_id: "verify-2", command: "node", args: ["--check", "app/api/example/helper.js"] },
  ],
}));
assert(highSameFamilyFail.fresh_verification_gate_count === 2, "HIGH_RISK_TWO_COMMANDS_EXPECTED", highSameFamilyFail);
assert(highSameFamilyFail.fresh_verification_family_count === 1, "HIGH_RISK_SAME_FAMILY_EXPECTED", highSameFamilyFail);
assert(highSameFamilyFail.verified === false, "HIGH_RISK_SAME_FAMILY_MUST_FAIL", highSameFamilyFail);

const highDoublePass = assessCodeAIWorldClassQuality(verifyState({
  path: "app/api/example/route.js",
  sequence: [
    { id: "edit", action: "apply_files" },
    { id: "verify-1", action: "verify" },
    { id: "verify-2", action: "verify" },
    { id: "review", action: "diff" },
  ],
  tests: [
    { operation_id: "verify-1", command: "node", args: ["--check", "app/api/example/route.js"] },
    { operation_id: "verify-2", command: "npm", args: ["test"] },
  ],
}));
assert(highDoublePass.verified === true, "HIGH_RISK_DOUBLE_FRESH_GATE_SHOULD_PASS", highDoublePass);
assert(highDoublePass.fresh_verification_gate_count === 2, "HIGH_RISK_DISTINCT_COMMANDS_REQUIRED", highDoublePass);
assert(highDoublePass.fresh_verification_family_count === 2, "HIGH_RISK_DISTINCT_FAMILIES_REQUIRED", highDoublePass);
assert(highDoublePass.explicit_final_diff_review === true, "FINAL_DIFF_REVIEW_REQUIRED", highDoublePass);

const criticalTriplePass = assessCodeAIWorldClassQuality(verifyState({
  path: "lib/security/authorization.js",
  sequence: [
    { id: "edit", action: "apply_files" },
    { id: "verify-1", action: "verify" },
    { id: "verify-2", action: "verify" },
    { id: "verify-3", action: "verify" },
    { id: "review", action: "diff" },
  ],
  tests: [
    { operation_id: "verify-1", command: "node", args: ["--check", "lib/security/authorization.js"] },
    { operation_id: "verify-2", command: "npm", args: ["test"] },
    { operation_id: "verify-3", command: "npm", args: ["run", "lint"] },
  ],
}));
assert(criticalTriplePass.risk === "critical", "CRITICAL_RISK_CLASSIFICATION_REQUIRED", criticalTriplePass);
assert(criticalTriplePass.required_verification_gates === 3, "CRITICAL_TRIPLE_GATE_REQUIRED", criticalTriplePass);
assert(criticalTriplePass.fresh_verification_family_count === 3, "CRITICAL_THREE_FAMILIES_REQUIRED", criticalTriplePass);
assert(criticalTriplePass.verified === true, "CRITICAL_TRIPLE_FAMILY_SHOULD_PASS", criticalTriplePass);

const noReviewFail = assessCodeAIWorldClassQuality(verifyState({
  path: "lib/example.js",
  sequence: [
    { id: "edit", action: "apply_files" },
    { id: "verify", action: "verify" },
  ],
  tests: [{ operation_id: "verify", command: "npm", args: ["test"] }],
}));
assert(noReviewFail.verified === false, "MISSING_FINAL_DIFF_REVIEW_MUST_FAIL", noReviewFail);
assert(
  noReviewFail.blockers.includes("CODE_AI_WORLDCLASS_FINAL_DIFF_REVIEW_REQUIRED"),
  "FINAL_DIFF_REVIEW_BLOCKER_REQUIRED",
  noReviewFail,
);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  cases: {
    standard_fresh_verification_passes: true,
    stale_verification_rejected: true,
    high_risk_single_verification_rejected: true,
    high_risk_same_family_double_check_rejected: true,
    high_risk_two_independent_families_pass: true,
    critical_three_independent_families_pass: true,
    missing_final_diff_review_rejected: true,
  },
  provider_calls_executed: false,
  provider_spend_performed: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
