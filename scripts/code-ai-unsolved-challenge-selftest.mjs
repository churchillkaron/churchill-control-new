import {
  assessCodeAIBlockDecision,
  assessCodeAIBlockedMission,
} from "../lib/code/runtime/CodeAIUnsolvedChallengePolicy.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function stateWithEvidence(count = 1) {
  return {
    completed_operation_ids: Array.from({ length: count }, (_, index) => `op_${index + 1}`),
    evidence: [],
    verification: [],
    tests: [],
    failures: [],
    repairs: [],
  };
}

function plannerBlockedState({ description, reason = "", evidenceCount = 1 }) {
  const state = stateWithEvidence(evidenceCount);
  state.evidence.push({
    kind: "autonomous_planner",
    operation_id: null,
    decision: {
      action: "block",
      description,
      reason,
    },
  });
  return state;
}

const knowledgeGap = assessCodeAIBlockDecision({
  state: stateWithEvidence(1),
  decision: {
    description: "We do not know enough yet.",
    input: {
      constraint_type: "knowledge_gap",
      constraint_to_change: "Acquire missing technical evidence.",
      evidence_operation_ids: ["op_1"],
    },
  },
});
assert(knowledgeGap.accepted === false, "knowledge gap must remain unsolved");
assert(
  knowledgeGap.disposition === "unsolved_continue_exploration",
  "knowledge gap must continue exploration",
);

const architectureLimit = assessCodeAIBlockDecision({
  state: stateWithEvidence(1),
  decision: {
    description: "Current architecture cannot satisfy the target.",
    input: {
      constraint_type: "architecture_limit",
      constraint_to_change: "Try a different architecture.",
      evidence_operation_ids: ["op_1"],
    },
  },
});
assert(architectureLimit.accepted === false, "architecture limit must remain unsolved");

const externalConstraint = assessCodeAIBlockDecision({
  state: stateWithEvidence(1),
  decision: {
    description: "External service is unavailable.",
    input: {
      constraint_type: "external_dependency_constraint",
      constraint_to_change: "Restore or replace the external dependency.",
      evidence_operation_ids: ["op_1"],
    },
  },
});
assert(externalConstraint.accepted === true, "real external constraint should be accepted");

const unsupportedImpossible = assessCodeAIBlockDecision({
  state: stateWithEvidence(1),
  decision: {
    description: "This is impossible because the vendor API is unavailable.",
    input: {
      constraint_type: "external_dependency_constraint",
      constraint_to_change: "Restore or replace the external dependency.",
      evidence_operation_ids: ["op_1"],
    },
  },
});
assert(unsupportedImpossible.accepted === false, "external blocker must not authorize impossible claim");

const weakFundamental = assessCodeAIBlockDecision({
  state: stateWithEvidence(1),
  decision: {
    description: "A mathematical bound prevents the requested result.",
    input: {
      constraint_type: "mathematical_constraint",
      constraint_to_change: "Relax the contradictory mathematical requirement.",
      proof_summary: "Observed contradiction in the requested invariant.",
      evidence_operation_ids: ["op_1"],
    },
  },
});
assert(weakFundamental.accepted === false, "fundamental blocker requires independent evidence");

const provenFundamental = assessCodeAIBlockDecision({
  state: stateWithEvidence(2),
  decision: {
    description: "This objective is impossible under the stated mathematical requirements.",
    input: {
      constraint_type: "mathematical_constraint",
      constraint_to_change: "Relax one mutually contradictory invariant.",
      proof_summary: "Two independent checks establish the contradiction.",
      evidence_operation_ids: ["op_1", "op_2"],
    },
  },
});
assert(provenFundamental.accepted === true, "proven fundamental constraint should be accepted");
assert(provenFundamental.impossible_claim_authorized === true, "only proven fundamental constraint may authorize impossible claim");

const unmarkedBlockedMission = assessCodeAIBlockedMission({
  state: plannerBlockedState({
    description: "I tried the obvious implementation and it failed.",
    evidenceCount: 2,
  }),
  result: { reason: "I tried the obvious implementation and it failed." },
});
assert(unmarkedBlockedMission.accepted === false, "failed implementation must remain unsolved");
assert(
  unmarkedBlockedMission.disposition === "unsolved_continue_exploration",
  "failed implementation must force exploration",
);

const externalBlockedMission = assessCodeAIBlockedMission({
  state: plannerBlockedState({
    description: "EXTERNAL_CONSTRAINT:external_dependency_constraint: vendor endpoint is unavailable until credentials are restored.",
    evidenceCount: 1,
  }),
  result: {
    reason: "EXTERNAL_CONSTRAINT:external_dependency_constraint: vendor endpoint is unavailable until credentials are restored.",
  },
});
assert(externalBlockedMission.accepted === true, "evidence-backed external terminal marker should pass");

const externalImpossibleMission = assessCodeAIBlockedMission({
  state: plannerBlockedState({
    description: "EXTERNAL_CONSTRAINT:environment_constraint: this is impossible because the environment lacks the required hardware.",
    evidenceCount: 1,
  }),
  result: {
    reason: "EXTERNAL_CONSTRAINT:environment_constraint: this is impossible because the environment lacks the required hardware.",
  },
});
assert(externalImpossibleMission.accepted === false, "external terminal marker must not authorize impossible claim");

const fundamentalBlockedMission = assessCodeAIBlockedMission({
  state: plannerBlockedState({
    description: "FUNDAMENTAL_CONSTRAINT:physical_constraint: impossible under the stated propagation-speed requirement.",
    evidenceCount: 2,
  }),
  result: {
    reason: "FUNDAMENTAL_CONSTRAINT:physical_constraint: impossible under the stated propagation-speed requirement.",
  },
});
assert(fundamentalBlockedMission.accepted === true, "fundamental terminal marker with independent evidence should pass");

const report = {
  success: true,
  contract: "AVANTIQO_CODE_AI_UNSOLVED_CHALLENGE_SELFTEST_V1",
  cases: {
    knowledge_gap_remains_unsolved: true,
    architecture_limit_remains_unsolved: true,
    external_constraint_can_block: true,
    external_constraint_cannot_claim_impossible: true,
    fundamental_constraint_requires_independent_evidence: true,
    proven_fundamental_constraint_can_claim_impossible: true,
    failed_implementation_block_is_rejected: true,
    external_terminal_marker_accepted: true,
    external_impossible_claim_rejected: true,
    fundamental_terminal_marker_accepted: true,
  },
  pure_policy_import_only: true,
  provider_calls_executed: false,
  provider_spend_performed: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
};

console.log(JSON.stringify(report, null, 2));
console.log("AVANTIQO_CODE_AI_UNSOLVED_CHALLENGE_SELFTEST_V1=PASS");
