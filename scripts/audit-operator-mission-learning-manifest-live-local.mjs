import assert from "node:assert/strict";

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "audit-service-role-key-not-used";

const {
  OPERATOR_MISSION_OUTCOME_LEARNING_MANIFEST_CONTRACT,
  resolveOperatorMissionOutcomeLearningProjection,
} = await import(
  "../lib/operator/runtime/OperatorMissionOutcomeLearningManifestRuntime.js"
);

const exactSteps = [
  {
    id: "inspect-before",
    capability_key: "platform.code_ai_commit_status.verify",
    payload: { execution_key: "audit-execution-key" },
  },
  {
    id: "commit-final",
    capability_key: "platform.code_ai_commit.execute",
    payload: {
      execution_key: "audit-execution-key",
      commit_message: "audit only",
    },
    verify_after: {
      capability_key: "platform.code_ai_commit_status.verify",
      payload: { execution_key: "audit-execution-key" },
    },
  },
];

const resolved = await resolveOperatorMissionOutcomeLearningProjection({
  steps: exactSteps,
});
assert.ok(resolved);
assert.equal(
  resolved.declaration_contract,
  OPERATOR_MISSION_OUTCOME_LEARNING_MANIFEST_CONTRACT,
);
assert.equal(resolved.declaration_source, "FINAL_CAPABILITY_MANIFEST");
assert.equal(
  resolved.declared_verification_capability_key,
  "platform.code_ai_commit_status.verify",
);
assert.equal(resolved.governance.capability_manifest_declaration_required, true);
assert.equal(resolved.governance.exact_declared_verifier_required, true);
assert.equal(resolved.governance.static_verifier_identity_required, true);
assert.equal(resolved.governance.static_verifier_identity_verified, true);
assert.equal(resolved.governance.dynamic_verifier_identity_allowed, false);
assert.equal(resolved.governance.planner_supplied_learning_projection_allowed, false);
assert.equal(resolved.governance.model_invented_learning_projection_allowed, false);
assert.equal(resolved.pattern.mission_family, "engineering.code-commit");
assert.equal(resolved.pattern.intervention_code, "verified-main-commit");
assert.equal(resolved.outcome_contract.status, "OUTCOME_CONTRACT_READY");
assert.deepEqual(
  resolved.mappings.map((mapping) => mapping.source_path),
  ["verified", "verified"],
);
assert.ok(
  resolved.mappings.every(
    (mapping) => mapping.source_step_id === "commit-final",
  ),
);

await assert.rejects(
  () =>
    resolveOperatorMissionOutcomeLearningProjection({
      steps: [
        exactSteps[0],
        {
          ...exactSteps[1],
          verify_after: {
            capability_key: "platform.system.inspectHealth",
            payload: {},
          },
        },
      ],
    }),
  /EXACT_DECLARED_VERIFIER_REQUIRED/,
);

await assert.rejects(
  () =>
    resolveOperatorMissionOutcomeLearningProjection({
      steps: [
        exactSteps[0],
        {
          ...exactSteps[1],
          verify_after: {
            capability_key: "platform.code_ai_commit_status.verify",
            payload: { execution_key: "audit-different-key" },
          },
        },
      ],
    }),
  /STATIC_VERIFIER_IDENTITY_REQUIRED/,
);

await assert.rejects(
  () =>
    resolveOperatorMissionOutcomeLearningProjection({
      steps: [
        exactSteps[0],
        {
          ...exactSteps[1],
          verify_after: {
            capability_key: "platform.code_ai_commit_status.verify",
            payload: {},
          },
        },
      ],
    }),
  /STATIC_VERIFIER_IDENTITY_REQUIRED/,
);

await assert.rejects(
  () =>
    resolveOperatorMissionOutcomeLearningProjection({
      steps: [
        exactSteps[0],
        {
          ...exactSteps[1],
          payload: { commit_message: "audit only" },
        },
      ],
    }),
  /STATIC_VERIFIER_IDENTITY_REQUIRED/,
);

const undeclared = await resolveOperatorMissionOutcomeLearningProjection({
  steps: [
    exactSteps[0],
    {
      id: "undeclared-final",
      capability_key: "platform.system.inspectHealth",
      payload: {},
      verify_after: {
        capability_key: "platform.system.inspectHealth",
        payload: {},
      },
    },
  ],
});
assert.equal(undeclared, null);

console.log(
  JSON.stringify(
    {
      success: true,
      status: "AVANTIQO_OPERATOR_MISSION_LEARNING_LIVE_MANIFEST_CERTIFIED",
      contract: OPERATOR_MISSION_OUTCOME_LEARNING_MANIFEST_CONTRACT,
      verified: {
        live_capability_loader_discovers_declaration: true,
        code_ai_commit_is_first_manifest_declared_learning_capability: true,
        exact_code_ai_commit_status_verifier_required: true,
        static_verifier_identity_required_before_learning: true,
        matching_static_verifier_identity_certified: true,
        mismatched_verifier_identity_rejected: true,
        missing_verifier_identity_rejected: true,
        missing_writer_identity_rejected: true,
        dynamic_verifier_identity_not_admitted: true,
        server_injects_final_step_identity: true,
        planner_or_model_does_not_supply_projection: true,
        undeclared_capability_produces_no_learning_projection: true,
        no_business_action_executed: true,
        no_model_gpu_or_provider_call: true,
      },
    },
    null,
    2,
  ),
);
