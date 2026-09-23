import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../lib/code/runtime/CodeAIMissionRuntime.js", import.meta.url),
  "utf8",
);

test("planner pseudo-file reads resolve from repository guidance evidence", () => {
  assert.match(source, /VIRTUAL_REPOSITORY_GUIDANCE_FIELDS/);
  assert.match(source, /"verification_commands_text"/);
  assert.match(source, /"instructions_text"/);
  assert.match(source, /"ci_workflows_text"/);
  assert.match(source, /"monorepo_summary"/);
  assert.match(source, /function virtualRepositoryGuidanceRead/);
  assert.match(source, /const virtualEvidence = virtualRepositoryGuidanceRead\(operation, state\)/);
  assert.match(source, /kind: "virtual_repository_guidance_read"/);
});

test("virtual guidance reads happen before filesystem reads", () => {
  const virtualIndex = source.indexOf("const virtualEvidence = virtualRepositoryGuidanceRead(operation, state)");
  const fileReadIndex = source.indexOf("return await workspace.read(operation.input)", virtualIndex);
  assert.ok(virtualIndex >= 0 && fileReadIndex > virtualIndex);
});
