import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { withOperatorCodeExecutionEvidence } from "../lib/operator/runtime/OperatorCodeExecutionEvidenceRuntime.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

async function evidenceRuntime() {
  return { withOperatorCodeExecutionEvidence };
}

function ubteEnvelope({ domain, capability, action, result }) {
  return {
    success: true,
    context: {
      organizationId: "9a148429-b6a0-4bc6-ac83-a35c64fb7045",
      requestId: "request-1",
      correlationId: "correlation-1",
    },
    domain,
    capability,
    action,
    result,
  };
}

function verifiedCommitReceipt({ executionKey, baseCommit, commitSha }) {
  return {
    status: "VERIFIED_COMMITTED",
    verified: true,
    execution_key: executionKey,
    verification_source: "SERVER_OWNED_COMMIT_EXECUTION_STATE",
    commit: {
      contract: "AVANTIQO_CODE_AI_COMMIT_EXECUTION_STATE_V1",
      success: true,
      verified: true,
      repository: "churchillkaron/churchill-control-new",
      branch: "main",
      previous_commit: baseCommit,
      commit_sha: commitSha,
      tree_sha: "3333333333333333333333333333333333333333",
      file_count: 2,
    },
  };
}

function wrappedMission({
  executionKey = "product-cycle:12345678-1234-1234-1234-123456789abc",
  baseCommit = "1111111111111111111111111111111111111111",
  commitSha = "2222222222222222222222222222222222222222",
  verifierExecutionKey = executionKey,
  verifierCommitSha = commitSha,
} = {}) {
  const actionResult = ubteEnvelope({
    domain: "platform",
    capability: "code_ai_commit",
    action: "execute",
    result: {
      success: true,
      verified: true,
      repository: "churchillkaron/churchill-control-new",
      branch: "main",
      execution_key: executionKey,
      previous_commit: baseCommit,
      commit_sha: commitSha,
    },
  });
  const verificationResult = ubteEnvelope({
    domain: "platform",
    capability: "code_ai_commit_status",
    action: "verify",
    result: verifiedCommitReceipt({
      executionKey: verifierExecutionKey,
      baseCommit,
      commitSha: verifierCommitSha,
    }),
  });
  const mission = {
    status: "completed",
    mission_mode: "durable_registered_sequence",
    mission_state: {
      status: "completed",
      steps: [
        {
          id: "commit_verified_changes",
          capability_key: "platform.code_ai_commit.execute",
          payload: { execution_key: executionKey },
          verify_after: {
            capability_key: "platform.code_ai_commit_status.verify",
            payload: { execution_key: executionKey },
          },
        },
        {
          id: "reassess_verified_main",
          capability_key: "platform.product_autonomy_continuation.assess",
          payload: { execution_key: executionKey },
        },
      ],
    },
    steps: [
      {
        id: "commit_verified_changes",
        capability_key: "platform.code_ai_commit.execute",
        status: "action_completed",
        result: actionResult,
      },
      {
        id: "commit_verified_changes",
        capability_key: "platform.code_ai_commit.execute",
        status: "completed",
        verification: verificationResult,
      },
      {
        id: "reassess_verified_main",
        capability_key: "platform.product_autonomy_continuation.assess",
        status: "completed",
        result: ubteEnvelope({
          domain: "platform",
          capability: "product_autonomy_continuation",
          action: "assess",
          result: { status: "ASSESSED" },
        }),
      },
    ],
  };

  return {
    execution: {
      status: "completed",
      capability: {
        key: "platform.operator_mission.execute",
        mode: "write",
      },
      result: ubteEnvelope({
        domain: "platform",
        capability: "operator_mission",
        action: "execute",
        result: mission,
      }),
    },
    provider_evidence: {},
    operator_catalog: {},
  };
}

test("real UBTE-wrapped Code persistence mission earns exact verified completion", async () => {
  const { withOperatorCodeExecutionEvidence } = await evidenceRuntime();
  const projected = withOperatorCodeExecutionEvidence(wrappedMission());

  assert.equal(projected.execution.business_effect_verified, true);
  assert.equal(projected.execution.post_action_verification.status, "completed");
  assert.equal(projected.execution.code_execution_evidence.kind, "commit");
  assert.equal(
    projected.execution.code_execution_evidence.base_commit,
    "1111111111111111111111111111111111111111",
  );
  assert.equal(
    projected.execution.code_execution_evidence.commit_sha,
    "2222222222222222222222222222222222222222",
  );
  assert.equal(
    projected.operator_catalog.code_commit_mission_binding_verified,
    true,
  );
});

test("UBTE-wrapped verifier identity mismatch remains fail-closed", async () => {
  const { withOperatorCodeExecutionEvidence } = await evidenceRuntime();
  const projected = withOperatorCodeExecutionEvidence(
    wrappedMission({
      verifierExecutionKey:
        "product-cycle:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    }),
  );

  assert.equal(projected.execution.business_effect_verified, undefined);
  assert.equal(projected.execution.code_execution_evidence, undefined);
});

test("UBTE-wrapped verifier commit mismatch remains fail-closed", async () => {
  const { withOperatorCodeExecutionEvidence } = await evidenceRuntime();
  const projected = withOperatorCodeExecutionEvidence(
    wrappedMission({
      verifierCommitSha: "4444444444444444444444444444444444444444",
    }),
  );

  assert.equal(projected.execution.business_effect_verified, undefined);
  assert.equal(projected.execution.code_execution_evidence, undefined);
});
