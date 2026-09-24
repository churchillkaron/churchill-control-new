import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cert = await readFile("scripts/certify-code-ai-autonomous-planner-service-runtime-live.mjs", "utf8");
const runner = await readFile("scripts/run-code-ai-autonomous-planner-certification-local.mjs", "utf8");

test("live autonomous planner certification is pinned to owned local Node01 execution", () => {
  assert.match(cert, /AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED = "true"/);
  assert.match(cert, /AVANTIQO_LOCAL_CODE_ENABLED = "true"/);
  assert.doesNotMatch(cert, /RUNPOD_API_KEY|RUNPOD_AVANTIQO_CODE_ENDPOINT_ID/);
  assert.match(cert, /implementation_required: true/);
  assert.match(cert, /allowed_edit_paths: ALLOWED_FILES/);
  assert.match(cert, /authoritative_verification_command: "node"/);
  assert.match(cert, /authoritative_verification_args: \[VERIFIER\]/);
});

test("safe certification runner invokes the maintained live cert directly and pins remote main", () => {
  assert.match(runner, /git[\s\S]*ls-remote[\s\S]*refs\/heads\/main/);
  assert.match(runner, /certify-code-ai-autonomous-planner-service-runtime-live\.mjs/);
  assert.doesNotMatch(runner, /certify:code-ai-autonomous-planner/);
});
