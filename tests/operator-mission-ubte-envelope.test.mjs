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

async function envelopeRuntime() {
  const code = source(
    "lib/operator/runtime/OperatorMissionEnvelopeRuntime.js",
  );
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  return import(url);
}

function pausedMission(overrides = {}) {
  return {
    status: "paused",
    pause_reason: "verification",
    reason: "OPERATOR_MISSION_VERIFICATION_FAILED",
    mission_mode: "durable_registered_sequence",
    all_steps_preflighted: true,
    total_steps: 2,
    completed_steps: 0,
    remaining_steps: 2,
    current_step_id: "commit_verified_changes",
    steps: [{ id: "commit_verified_changes", status: "action_completed" }],
    mission_state: {
      status: "verifying",
      completed_step_ids: [],
      current_step_id: "commit_verified_changes",
      steps: [
        {
          id: "commit_verified_changes",
          capability_key: "platform.code_ai_commit.execute",
          status: "verifying",
        },
      ],
    },
    resume_payload: {
      steps: [
        {
          id: "commit_verified_changes",
          capability_key: "platform.code_ai_commit.execute",
        },
        {
          id: "reassess_verified_main",
          capability_key: "platform.product_autonomy_continuation.assess",
        },
      ],
      resume: {
        current_step_id: "commit_verified_changes",
        completed_step_ids: [],
        current_step_confirmed: true,
        verification_pending: {
          step_id: "commit_verified_changes",
          capability_key: "platform.code_ai_commit_status.verify",
        },
      },
    },
    ...overrides,
  };
}

test("UBTE projects paused durable mission state without changing canonical result", async () => {
  const { projectOperatorMissionEnvelope } = await envelopeRuntime();
  const mission = pausedMission();
  const projected = projectOperatorMissionEnvelope({
    missionRoot: true,
    result: mission,
  });

  assert.equal(projected.mission_mode, "durable_registered_sequence");
  assert.equal(projected.status, "paused");
  assert.equal(projected.pause_reason, "verification");
  assert.equal(projected.current_step_id, "commit_verified_changes");
  assert.equal(projected.mission_state.status, "verifying");
  assert.equal(
    projected.resume_payload.resume.verification_pending.capability_key,
    "platform.code_ai_commit_status.verify",
  );
  assert.equal(mission.status, "paused");
  assert.equal(mission.mission_state.status, "verifying");
});

test("completed durable mission projects completed state", async () => {
  const { projectOperatorMissionEnvelope } = await envelopeRuntime();
  const projected = projectOperatorMissionEnvelope({
    missionRoot: true,
    result: pausedMission({
      status: "completed",
      pause_reason: null,
      reason: null,
      completed_steps: 2,
      remaining_steps: 0,
      current_step_id: null,
      mission_state: {
        status: "completed",
        completed_step_ids: [
          "commit_verified_changes",
          "reassess_verified_main",
        ],
        current_step_id: null,
        steps: [],
      },
      resume_payload: undefined,
    }),
  });

  assert.equal(projected.status, "completed");
  assert.equal(projected.completed_steps, 2);
  assert.equal(projected.remaining_steps, 0);
  assert.equal(projected.current_step_id, null);
  assert.equal(projected.mission_state.status, "completed");
  assert.equal(projected.resume_payload, undefined);
});

test("non-mission UBTE results receive no mission projection", async () => {
  const { projectOperatorMissionEnvelope } = await envelopeRuntime();

  assert.deepEqual(
    projectOperatorMissionEnvelope({
      missionRoot: false,
      result: pausedMission(),
    }),
    {},
  );
  assert.deepEqual(
    projectOperatorMissionEnvelope({
      missionRoot: true,
      result: { status: "completed", mission_mode: "other" },
    }),
    {},
  );
});

test("ExecutionEngine projects mission fields while preserving nested result", () => {
  const engine = source("lib/ubte/runtime/ExecutionEngine.js");

  assert.match(
    engine,
    /projectOperatorMissionEnvelope/,
  );
  assert.match(
    engine,
    /\.\.\.projectOperatorMissionEnvelope\(\{\s*missionRoot,\s*result\s*\}\),[\s\S]*\n\s*result,/,
  );
});

test("Operator Core consumes projected durable mission state before generic completion", () => {
  const core = source("lib/operator/runtime/OperatorTurnRuntimeCore.js");

  assert.match(
    core,
    /function isMissionExecutionResult\(capability, result\)[\s\S]*text\(result\?\.mission_mode\) === "durable_registered_sequence"/,
  );
  assert.match(
    core,
    /if \(isMissionExecutionResult\(capability, result\)\) \{[\s\S]*return missionResultTurn\(/,
  );
  assert.match(core, /const paused = text\(result\?\.status\) === "paused"/);
  assert.match(core, /pause_reason === "verification"/);
});
