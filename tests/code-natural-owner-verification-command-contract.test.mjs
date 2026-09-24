import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseCodeAIOwnerVerificationCommand,
  resolveCodeAIOwnerVerificationCommand,
} from "../lib/code/runtime/CodeAIOwnerVerificationCommandRuntime.js";

const live = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");

test("live work package uses canonical owner verification resolver", () => {
  assert.match(live, /resolveCodeAIOwnerVerificationCommand/);
  assert.doesNotMatch(live, /function naturalLanguageVerificationInput/);
  assert.doesNotMatch(live, /function legacyAuthoritativeVerificationInput/);
});

test("natural owner verification preserves dotted paths and follow-up prose boundaries", () => {
  const parsed = parseCodeAIOwnerVerificationCommand(
    "Run node --test tmp/code-worldclass-cert/math.test.mjs after the repair and inspect the final diff before finishing.",
  );
  assert.equal(parsed.command, "node");
  assert.deepEqual(parsed.args, ["--test", "tmp/code-worldclass-cert/math.test.mjs"]);
  assert.equal(parsed.source, "NATURAL_OWNER_VERIFICATION_COMMAND");
});

test("canonical parser supports common non-JavaScript verifier commands", () => {
  assert.deepEqual(
    parseCodeAIOwnerVerificationCommand("Verify with python3 -m pytest tests/test_orders.py").args,
    ["-m", "pytest", "tests/test_orders.py"],
  );
  assert.deepEqual(
    parseCodeAIOwnerVerificationCommand("Execute cargo test --package core").args,
    ["test", "--package", "core"],
  );
});

test("structured verifier wins and natural text cannot override it", () => {
  const resolved = resolveCodeAIOwnerVerificationCommand({
    objective: "Run npm test after repair.",
    objective_context: {
      authoritative_verification_command: "node",
      authoritative_verification_args: ["--test", "tests/exact.test.mjs"],
    },
  });
  assert.equal(resolved.command, "node");
  assert.deepEqual(resolved.args, ["--test", "tests/exact.test.mjs"]);
  assert.equal(resolved.source, "STRUCTURED_OBJECTIVE_CONTEXT");
});

test("owner verification parser rejects shell composition", () => {
  assert.equal(parseCodeAIOwnerVerificationCommand("Run npm test && npm run deploy"), null);
  assert.equal(parseCodeAIOwnerVerificationCommand("Run node test.mjs; rm -rf ."), null);
});
