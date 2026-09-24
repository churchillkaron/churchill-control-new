import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/platform/capabilities/createCodeAIAutonomousCapability.js", import.meta.url), "utf8");

test("autonomous capability binds owner verifier through the canonical resolver before engineering rewriting", () => {
  assert.match(source, /resolveCodeAIOwnerVerificationCommand/);
  assert.match(source, /function authoritativeVerificationBinding\(baseContext = \{\}, objective = ""\)/);
  assert.match(source, /\.\.\.authoritativeVerificationBinding\(baseObjectiveContext, payload\.objective\)/);
  assert.match(source, /authoritative_verification_command: \{ type: "string", maxLength: 300 \}/);
  assert.match(source, /authoritative_verification_args:/);
  assert.match(source, /authoritative_verification_source: resolved\.source/);
});

test("capability no longer maintains a competing natural-language parser", () => {
  assert.doesNotMatch(source, /function naturalOwnerVerificationCommand/);
  assert.doesNotMatch(source, /\brun\\s\+\(node\|npm\|npx/);
});
