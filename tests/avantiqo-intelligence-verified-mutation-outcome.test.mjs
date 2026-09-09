import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  executionMemoryVerificationState,
  shouldLearnCompletedExecutionMemory,
  shouldRetireExecutionBlockerMemory,
} from "../lib/operator/runtime/IntelligenceExecutionMemoryPolicy.js";

const operatorTurn = fs.readFileSync(
  "lib/operator/runtime/OperatorTurnRuntime.js",
  "utf8",
);

test("failed write verification is never classified as verified completion", () => {
  const execution = {
    status: "completed",
    capability: { mode: "write", key: "example.write" },
    post_action_verification: {
      status: "failed",
      reason: "READBACK_MISMATCH",
    },
  };

  assert.deepEqual(executionMemoryVerificationState(execution), {
    completed: true,
    mutating: true,
    verification_present: true,
    verification_status: "failed",
    business_effect_verified: false,
    cognitive_binding_required: false,
    cognitive_verification_attested: false,
    cognitive_verification_provenance: null,
  });
  assert.equal(shouldLearnCompletedExecutionMemory(execution), false);
  assert.equal(shouldRetireExecutionBlockerMemory(execution), false);
});

test("verified write may become durable completed execution memory", () => {
  const execution = {
    status: "completed",
    capability: { mode: "write", key: "example.write" },
    post_action_verification: {
      status: "completed",
      business_effect_verified: true,
      assertion: { passed: true, method: "stable_business_identity_match" },
    },
  };

  assert.equal(shouldLearnCompletedExecutionMemory(execution), true);
  assert.equal(shouldRetireExecutionBlockerMemory(execution), true);
});

test("cognitive mutation memory requires its sealed verification attestation", () => {
  const base = {
    status: "completed",
    capability: { mode: "write", key: "example.write" },
    post_action_verification: {
      status: "completed",
      capability_key: "example.read",
      business_effect_verified: true,
      assertion: { passed: true, method: "stable_business_identity_match" },
      cognitive_execution_binding_required: true,
    },
  };

  assert.equal(shouldLearnCompletedExecutionMemory(base), false);
  assert.equal(shouldRetireExecutionBlockerMemory(base), false);

  const attested = structuredClone(base);
  attested.post_action_verification.cognitive_verification_attestation = {
    contract: "AVANTIQO_COGNITIVE_MUTATION_VERIFICATION_ATTESTATION_V1",
    plan_id: "plan-1",
    step_id: "step-1",
    capability_key: "example.write",
    execution_scope: { organization_id: "org-1", entity_id: "entity-1" },
    payload_fingerprint: "a".repeat(64),
    verification_capability_key: "example.read",
    business_effect_verified: true,
    assertion: { passed: true },
    authorization_effect: "NONE",
  };

  assert.equal(shouldLearnCompletedExecutionMemory(attested), true);
  assert.equal(shouldRetireExecutionBlockerMemory(attested), true);
});

test("unverified mutation call is not durable business-effect proof", () => {
  const execution = {
    status: "completed",
    capability: { mode: "write", key: "example.write" },
  };

  assert.equal(shouldLearnCompletedExecutionMemory(execution), false);
  assert.equal(shouldRetireExecutionBlockerMemory(execution), false);
});

test("successful reads remain completed without mutation verification semantics", () => {
  const execution = {
    status: "completed",
    capability: { mode: "read", key: "example.read" },
  };

  assert.equal(shouldLearnCompletedExecutionMemory(execution), true);
  assert.equal(shouldRetireExecutionBlockerMemory(execution), true);
});

test("Operator outward truth blocks completed mutations whose verification failed", () => {
  assert.match(operatorTurn, /AVANTIQO_OPERATOR_VERIFIED_MUTATION_OUTCOME_V3/);
  assert.match(
    operatorTurn,
    /const verifiedResult = withVerifiedMutationOutcome\([\s\S]*evidencedResult,[\s\S]*effectiveOptions\.projectState/,
  );
  assert.match(operatorTurn, /status:\s*"blocked"/);
  assert.match(operatorTurn, /action_call_completed:\s*true/);
  assert.match(operatorTurn, /business_effect_verified:\s*false/);
  assert.match(operatorTurn, /mutation_replay_allowed:\s*false/);
  assert.match(operatorTurn, /verification_required_before_completion:\s*true/);
});

test("unverified mutation cannot advance durable project progress", () => {
  assert.match(operatorTurn, /rollbackUnverifiedProjectProgress/);
  assert.match(
    operatorTurn,
    /completed_steps:\s*Array\.isArray\(prior\.completed_steps\)/,
  );
  assert.match(operatorTurn, /progress_summary:\s*prior\.progress_summary \?\? null/);
  assert.match(operatorTurn, /next_step:\s*prior\.next_step \?\? null/);
  assert.match(operatorTurn, /project_progress_advanced:\s*false/);
});
