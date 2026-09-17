import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const continuation = fs.readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalContinuationRuntime.js", "utf8");
const finishing = fs.readFileSync("lib/creative/music/runtime/CreativeMusicFinishingRuntime.js", "utf8");

test("professional mastering retries only after durable repair-required evidence", () => {
  assert.match(continuation, /professional_mastering_evidence/);
  assert.match(continuation, /priorMastering\.mastering_passed===false/);
  assert.match(continuation, /MASTERING_REPAIR_REQUIRED/);
  assert.match(continuation, /retry_finishing:retryFinishing/);
});

test("master retry resets the existing failed finishing task rather than creating a parallel task", () => {
  assert.match(finishing, /finishTask\.status === "FAILED" && retryFailed/);
  assert.match(finishing, /ProductionTaskRuntime\.update\(finishTask\.id/);
  assert.match(finishing, /status: "WAITING"/);
  assert.match(finishing, /music_finish_retry_at/);
});
