import assert from "node:assert/strict";
import test from "node:test";

import {
  activeOperatorMissionExecutionId,
  attachOperatorMissionExecutionId,
  resolveOperatorMissionExecutionId,
  runWithOperatorMissionExecutionId,
} from "../lib/operator/runtime/OperatorMissionExecutionContext.js";

test("mission execution identity survives resume", () => {
  assert.equal(
    resolveOperatorMissionExecutionId({
      resume: { mission_execution_id: "mission_exec_123" },
    }),
    "mission_exec_123",
  );
});

test("conflicting mission execution identities fail closed", () => {
  assert.throws(
    () =>
      resolveOperatorMissionExecutionId({
        mission_execution_id: "mission_exec_a",
        resume: { mission_execution_id: "mission_exec_b" },
      }),
    /OPERATOR_MISSION_EXECUTION_ID_MISMATCH/,
  );
});

test("nested mission children inherit the exact active execution identity", async () => {
  assert.equal(activeOperatorMissionExecutionId(), null);
  await runWithOperatorMissionExecutionId("mission_exec_nested", async () => {
    await Promise.resolve();
    assert.equal(activeOperatorMissionExecutionId(), "mission_exec_nested");
  });
  assert.equal(activeOperatorMissionExecutionId(), null);
});

test("paused mission results persist execution identity into resume state", () => {
  const attached = attachOperatorMissionExecutionId(
    {
      status: "paused",
      mission_state: { status: "verifying" },
      resume_payload: {
        steps: [{ id: "step_1" }],
        resume: { current_step_id: "step_1" },
      },
    },
    "mission_exec_resume",
  );

  assert.equal(attached.mission_execution_id, "mission_exec_resume");
  assert.equal(attached.mission_state.mission_execution_id, "mission_exec_resume");
  assert.equal(
    attached.resume_payload.resume.mission_execution_id,
    "mission_exec_resume",
  );
});
