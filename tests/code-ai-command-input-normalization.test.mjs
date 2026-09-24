import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeCodeAIMissionCommandInput,
} from "../lib/code/runtime/CodeAIMissionRuntime.js";

test("Code normalizes a planner full command string into executable and args", () => {
  const normalized = normalizeCodeAIMissionCommandInput({
    command: "node --test tmp/code-worldclass-cert/math.test.mjs",
  });
  assert.equal(normalized.command, "node");
  assert.deepEqual(normalized.args, ["--test", "tmp/code-worldclass-cert/math.test.mjs"]);
  assert.equal(normalized.cwd, ".");
});

test("Code avoids duplicating a working-directory prefix already present in args", () => {
  const normalized = normalizeCodeAIMissionCommandInput({
    command: "node --test tmp/code-worldclass-cert/math.test.mjs",
    working_directory: "tmp/code-worldclass-cert",
  });
  assert.equal(normalized.command, "node");
  assert.deepEqual(normalized.args, ["--test", "tmp/code-worldclass-cert/math.test.mjs"]);
  assert.equal(normalized.cwd, ".");
});

test("Code preserves a legitimate cwd when args are relative to that cwd", () => {
  const normalized = normalizeCodeAIMissionCommandInput({
    command: "node --test math.test.mjs",
    working_directory: "tmp/code-worldclass-cert",
  });
  assert.equal(normalized.command, "node");
  assert.deepEqual(normalized.args, ["--test", "math.test.mjs"]);
  assert.equal(normalized.cwd, "tmp/code-worldclass-cert");
});

test("Code preserves a bounded verifier environment map through command normalization", () => {
  const env = { AVANTIQO_NEXT_DIST_DIR: ".next-code-verify" };
  const normalized = normalizeCodeAIMissionCommandInput({
    command: "npm run build",
    env,
  });
  assert.equal(normalized.command, "npm");
  assert.deepEqual(normalized.args, ["run", "build"]);
  assert.deepEqual(normalized.env, env);
});
