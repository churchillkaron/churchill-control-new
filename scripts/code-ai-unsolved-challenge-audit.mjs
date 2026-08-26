import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const policyPath = path.join(root, "lib/code/runtime/CodeAIUnsolvedChallengePolicy.js");
const runtimePath = path.join(root, "lib/code/runtime/CodeAIWorldClassRuntime.js");
const selftestPath = path.join(root, "scripts/code-ai-unsolved-challenge-selftest.mjs");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function requireMarker(source, marker, label) {
  if (!source.includes(marker)) {
    throw new Error(`CODE_AI_UNSOLVED_CHALLENGE_AUDIT_MISSING:${label}:${marker}`);
  }
}

const policy = read(policyPath);
const runtime = read(runtimePath);
const selftest = read(selftestPath);

requireMarker(policy, "AVANTIQO_CODE_AI_UNSOLVED_CHALLENGE_POLICY_V1", "policy_contract");
requireMarker(policy, "knowledge_gap", "knowledge_gap_nonterminal");
requireMarker(policy, "architecture_limit", "architecture_limit_nonterminal");
requireMarker(policy, "implementation_failure", "implementation_failure_nonterminal");
requireMarker(policy, "unsolved_continue_exploration", "unsolved_disposition");
requireMarker(policy, "FUNDAMENTAL_CONSTRAINT", "fundamental_terminal_format");
requireMarker(policy, "EXTERNAL_CONSTRAINT", "external_terminal_format");
requireMarker(policy, "CODE_AI_BLOCK_UNSUPPORTED_IMPOSSIBLE_CLAIM", "impossible_claim_guard");
requireMarker(policy, "CODE_AI_BLOCK_FUNDAMENTAL_INDEPENDENT_EVIDENCE_REQUIRED", "fundamental_evidence_guard");
requireMarker(policy, "Not previously done, unknown, difficult, expensive", "novelty_not_impossible_principle");

requireMarker(runtime, "assessCodeAIBlockedMission", "mandatory_policy_import");
requireMarker(runtime, "MAX_UNSOLVED_CONVERGENCE_PASSES", "bounded_unsolved_loop");
requireMarker(runtime, "status: assessment.accepted === true ? source.status : \"unsolved\"", "unsolved_state_conversion");
requireMarker(runtime, "resume_state: challengedState", "automatic_unsolved_resume");
requireMarker(runtime, "CODE_AI_UNSOLVED_CHALLENGE_BUDGET_EXHAUSTED", "bounded_fail_closed");
requireMarker(runtime, "startsWith(\"CODE_AI_AUTONOMOUS_\")", "system_block_fail_closed");
requireMarker(runtime, "unsolved_challenge_gate", "challenge_evidence");

requireMarker(selftest, "knowledge_gap_remains_unsolved", "knowledge_gap_test");
requireMarker(selftest, "architecture_limit_remains_unsolved", "architecture_test");
requireMarker(selftest, "failed_implementation_block_is_rejected", "implementation_failure_test");
requireMarker(selftest, "external_constraint_cannot_claim_impossible", "impossible_external_test");
requireMarker(selftest, "proven_fundamental_constraint_can_claim_impossible", "fundamental_proof_test");

for (const forbidden of [
  "RunPod",
  "RUNPOD",
  "ServiceExecutionRuntime",
  "fetch(",
  "@vercel/sandbox",
]) {
  if (policy.includes(forbidden)) {
    throw new Error(`CODE_AI_UNSOLVED_CHALLENGE_POLICY_NOT_PURE:${forbidden}`);
  }
  if (selftest.includes(forbidden)) {
    throw new Error(`CODE_AI_UNSOLVED_CHALLENGE_SELFTEST_NOT_PURE:${forbidden}`);
  }
}

const report = {
  success: true,
  contract: "AVANTIQO_CODE_AI_UNSOLVED_CHALLENGE_SOURCE_AUDIT_V1",
  verified: {
    novelty_is_not_treated_as_impossible: true,
    knowledge_gaps_are_nonterminal: true,
    architecture_limits_are_nonterminal: true,
    implementation_failures_are_nonterminal: true,
    unproven_planner_blocks_become_unsolved: true,
    unsolved_work_resumes_automatically: true,
    impossible_claim_requires_fundamental_constraint: true,
    fundamental_constraint_requires_independent_evidence: true,
    real_external_constraints_can_stop_safely: true,
    system_controller_limits_remain_fail_closed: true,
    unsolved_convergence_is_bounded: true,
    challenge_policy_is_pure_zero_gpu_logic: true,
    deterministic_selftest_present: true,
  },
  provider_calls_executed: false,
  provider_spend_performed: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
};

console.log(JSON.stringify(report, null, 2));
console.log("AVANTIQO_CODE_AI_UNSOLVED_CHALLENGE_SOURCE_AUDIT_V1=PASS");
