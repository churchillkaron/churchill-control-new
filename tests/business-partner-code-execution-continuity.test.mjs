import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

async function evidenceRuntime() {
  const code = source(
    "lib/operator/runtime/OperatorCodeExecutionEvidenceRuntime.js",
  );
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  return import(url);
}

function verifiedAutonomousResult(overrides = {}) {
  return {
    execution: {
      status: "completed",
      capability: {
        key: "platform.product_engineering_cycle.execute",
        mode: "write",
      },
      result: {
        mission: {
          steps: [
            {
              id: "engineer_next_gap",
              status: "completed",
              verification: {
                status: "VERIFIED_COMPLETED",
                verified: true,
                execution_key: "product-cycle:12345678-1234-1234-1234-123456789abc",
                execution_state: {
                  contract: "AVANTIQO_CODE_AI_AUTONOMOUS_EXECUTION_STATE_V1",
                  attestation_verified: true,
                  result_success: true,
                  result_status: "completed",
                  state_status: "completed",
                  mission_id: "mission-verified-1",
                  objective: "Repair the selected repository-grounded gap",
                  repository_url:
                    "https://github.com/churchillkaron/churchill-control-new.git",
                  ref: "main",
                  base_commit: "1111111111111111111111111111111111111111",
                  files_changed: {
                    total_count: 2,
                    showing: 2,
                    sample: ["lib/example.js", "tests/example.test.mjs"],
                  },
                  source_change_count: 2,
                  verification_passed: true,
                  product_completion_criteria_count: 2,
                  product_completion_criteria_verified: true,
                  failure_count: 0,
                  ...overrides,
                },
              },
            },
          ],
        },
      },
    },
    provider_evidence: {},
    operator_catalog: {},
  };
}

function verifiedCommitReceipt({
  executionKey,
  baseCommit,
  commitSha,
} = {}) {
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

function verifiedCommitMission({
  executionKey = "product-cycle:12345678-1234-1234-1234-123456789abc",
  baseCommit = "1111111111111111111111111111111111111111",
  commitSha = "2222222222222222222222222222222222222222",
  verifierExecutionKey = executionKey,
  verifierBaseCommit = baseCommit,
  verifierCommitSha = commitSha,
  verifyCapabilityKey = "platform.code_ai_commit_status.verify",
} = {}) {
  return {
    execution: {
      status: "completed",
      capability: {
        key: "platform.operator_mission.execute",
        mode: "write",
      },
      result: {
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
                capability_key: verifyCapabilityKey,
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
            result: {
              verified: true,
              branch: "main",
              execution_key: executionKey,
              previous_commit: baseCommit,
              commit_sha: commitSha,
            },
          },
          {
            id: "commit_verified_changes",
            capability_key: "platform.code_ai_commit.execute",
            status: "completed",
            verification: verifiedCommitReceipt({
              executionKey: verifierExecutionKey,
              baseCommit: verifierBaseCommit,
              commitSha: verifierCommitSha,
            }),
          },
          {
            id: "reassess_verified_main",
            capability_key: "platform.product_autonomy_continuation.assess",
            status: "completed",
            result: { status: "ASSESSED" },
          },
        ],
      },
    },
    provider_evidence: {},
    operator_catalog: {},
  };
}

test("verified Code AI read-back becomes the Operator business-effect receipt", async () => {
  const { withOperatorCodeExecutionEvidence } = await evidenceRuntime();
  const projected = withOperatorCodeExecutionEvidence(
    verifiedAutonomousResult(),
  );

  assert.equal(projected.execution.business_effect_verified, true);
  assert.equal(projected.execution.post_action_verification.status, "completed");
  assert.equal(
    projected.execution.post_action_verification.assertion.method,
    "code_autonomous_server_state_readback",
  );
  assert.equal(
    projected.execution.code_execution_evidence.execution_key,
    "product-cycle:12345678-1234-1234-1234-123456789abc",
  );
  assert.equal(
    projected.execution.code_execution_evidence.repository_url,
    "https://github.com/churchillkaron/churchill-control-new.git",
  );
  assert.equal(
    projected.execution.code_execution_evidence.mission_id,
    "mission-verified-1",
  );
  assert.deepEqual(
    projected.execution.code_execution_evidence.files_changed,
    ["lib/example.js", "tests/example.test.mjs"],
  );
});

test("unattested or incompletely verified Code evidence never earns completion", async () => {
  const { withOperatorCodeExecutionEvidence } = await evidenceRuntime();

  const unattested = withOperatorCodeExecutionEvidence(
    verifiedAutonomousResult({ attestation_verified: false }),
  );
  assert.equal(unattested.execution.business_effect_verified, undefined);
  assert.equal(unattested.execution.post_action_verification, undefined);

  const unverifiedChange = withOperatorCodeExecutionEvidence(
    verifiedAutonomousResult({ verification_passed: false }),
  );
  assert.equal(unverifiedChange.execution.business_effect_verified, undefined);
  assert.equal(unverifiedChange.execution.post_action_verification, undefined);

  const unverifiedCriteria = withOperatorCodeExecutionEvidence(
    verifiedAutonomousResult({ product_completion_criteria_verified: false }),
  );
  assert.equal(unverifiedCriteria.execution.business_effect_verified, undefined);
  assert.equal(unverifiedCriteria.execution.post_action_verification, undefined);
});

test("Code-looking evidence from an unrelated capability is ignored", async () => {
  const { withOperatorCodeExecutionEvidence } = await evidenceRuntime();
  const unrelated = verifiedAutonomousResult();
  unrelated.execution.capability.key = "finance.invoice.create";

  const projected = withOperatorCodeExecutionEvidence(unrelated);
  assert.equal(projected.execution.business_effect_verified, undefined);
  assert.equal(projected.code_execution_evidence, undefined);
});

test("Business Partner projects Code evidence before generic deterministic completion", () => {
  const runtime = source("lib/operator/runtime/OperatorTurnRuntime.js");
  assert.match(
    runtime,
    /const result = await runGovernedOperatorTurn\(effectiveOptions\);[\s\S]*const evidencedResult = withOperatorCodeExecutionEvidence\(result\);[\s\S]*const verifiedResult = withVerifiedMutationOutcome\(\s*evidencedResult,/,
  );
});

test("Code evidence remains inside persisted execution and survives conversation restore", () => {
  const route = source("app/api/operator/turn/route.js");
  const conversation = source(
    "lib/operator/runtime/IntelligenceConversationRuntime.js",
  );
  const home = source("components/operator/HomeAvantiqoIntelligence.jsx");

  assert.match(route, /execution:\s*object\(result\?\.execution\)/);
  assert.match(
    conversation,
    /\.select\("id, role, source, content, decision, evidence, execution, navigation, created_at"\)/,
  );
  assert.match(home, /execution:\s*turn\?\.execution\s*\|\|\s*\{\}/);
  assert.match(home, /governance:\s*turn\.role === "assistant"\s*\? executionEvidence\(turn\)\s*:\s*null/);
});

test("embedded Code persistence is promoted into server-authoritative resumable mission state", () => {
  const legacy = source("lib/operator/runtime/OperatorTurnRuntimeLegacy.js");
  const route = source("app/api/operator/turn/route.js");
  const conversation = source(
    "lib/operator/runtime/IntelligenceConversationRuntime.js",
  );

  assert.match(
    legacy,
    /pending_execution:\s*\{[\s\S]*capability_key:\s*OPERATOR_MISSION_KEY,[\s\S]*payload:\s*object\(mission\.resume_payload\),[\s\S]*resume_kind:\s*"mission"/,
  );
  assert.match(
    route,
    /const agreementState = object\(memory\.agreementState\)/,
  );
  assert.match(
    conversation,
    /p_agreement_state:\s*persistedAgreementState/,
  );
  assert.match(
    conversation,
    /agreementState:\s*object\(conversation\.agreement_state\)/,
  );
});

test("post-refresh commit confirmation resumes the exact stored mission payload", () => {
  const core = source("lib/operator/runtime/OperatorTurnRuntimeCore.js");

  assert.match(
    core,
    /pending\?\.resume_kind === "mission"[\s\S]*missionResumeProjectionMatches\(pending, activeRun\)/,
  );
  assert.match(
    core,
    /payload:\s*pending\.payload,[\s\S]*runtimeMetadata:\s*missionResume[\s\S]*operatorMissionResume:\s*true,[\s\S]*operatorMissionConfirmed:\s*isAffirmative\(message\)/,
  );
});

test("Business Partner keeps pending Code commit confirmation visible ahead of prior verified engineering", () => {
  const home = source("components/operator/HomeAvantiqoIntelligence.jsx");
  const pendingBranch = home.indexOf(
    "if (text(pendingExecution?.capability_key))",
  );
  const verifiedBranch = home.indexOf(
    "execution?.business_effect_verified === true",
  );

  assert.ok(pendingBranch >= 0, "pending execution branch must exist");
  assert.ok(verifiedBranch >= 0, "verified execution branch must exist");
  assert.ok(
    pendingBranch < verifiedBranch,
    "pending persistence must render before prior verified engineering state",
  );
  assert.match(home, /function pendingCodeCommitIntent\(/);
  assert.match(home, /platform\.code_ai_commit\.execute/);
  assert.match(home, /platform\.code_ai_commit_status\.verify/);
  assert.match(home, /label:\s*"Awaiting confirmation"/);
  assert.match(home, /pendingCommit\.executionKey/);
  assert.match(home, /codeEvidence\.repository_url/);
  assert.match(home, /codeEvidence\.base_commit/);
});

test("verified Code commit mission earns completion only from its exact commit and verifier pair", async () => {
  const { withOperatorCodeExecutionEvidence } = await evidenceRuntime();
  const projected = withOperatorCodeExecutionEvidence(verifiedCommitMission());

  assert.equal(projected.execution.business_effect_verified, true);
  assert.equal(projected.execution.post_action_verification.status, "completed");
  assert.equal(projected.execution.code_execution_evidence.kind, "commit");
  assert.equal(
    projected.execution.code_execution_evidence.execution_key,
    "product-cycle:12345678-1234-1234-1234-123456789abc",
  );
  assert.equal(
    projected.execution.code_execution_evidence.repository_url,
    "churchillkaron/churchill-control-new",
  );
  assert.equal(
    projected.execution.code_execution_evidence.base_commit,
    "1111111111111111111111111111111111111111",
  );
  assert.equal(
    projected.execution.code_execution_evidence.previous_commit,
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

test("mismatched Code commit mission evidence never earns Verified complete", async () => {
  const { withOperatorCodeExecutionEvidence } = await evidenceRuntime();

  const wrongVerifier = withOperatorCodeExecutionEvidence(
    verifiedCommitMission({
      verifyCapabilityKey: "platform.unrelated.verify",
    }),
  );
  assert.equal(wrongVerifier.execution.business_effect_verified, undefined);
  assert.equal(wrongVerifier.execution.code_execution_evidence, undefined);

  const wrongExecutionKey = withOperatorCodeExecutionEvidence(
    verifiedCommitMission({
      verifierExecutionKey:
        "product-cycle:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    }),
  );
  assert.equal(wrongExecutionKey.execution.business_effect_verified, undefined);
  assert.equal(wrongExecutionKey.execution.code_execution_evidence, undefined);

  const wrongCommitSha = withOperatorCodeExecutionEvidence(
    verifiedCommitMission({
      verifierCommitSha: "4444444444444444444444444444444444444444",
    }),
  );
  assert.equal(wrongCommitSha.execution.business_effect_verified, undefined);
  assert.equal(wrongCommitSha.execution.code_execution_evidence, undefined);
});

test("Business Partner verified Code badge renders durable base and resulting commit proof", () => {
  const home = source("components/operator/HomeAvantiqoIntelligence.jsx");
  const evidence = source(
    "lib/operator/runtime/OperatorCodeExecutionEvidenceRuntime.js",
  );

  assert.match(home, /label:\s*"Verified complete"/);
  assert.match(home, /codeEvidence\.base_commit/);
  assert.match(home, /codeEvidence\.commit_sha/);
  assert.match(evidence, /base_commit:\s*baseCommit/);
  assert.match(evidence, /function missionCommitReceiptMatches\(/);
  assert.match(evidence, /platform\.code_ai_commit\.execute/);
  assert.match(evidence, /platform\.code_ai_commit_status\.verify/);
});
