import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { extractCodeAIExplicitRepositoryPaths } from "../lib/code/runtime/CodeAIReadOnlyIntentRuntime.js";

const capability = fs.readFileSync(
  new URL("../lib/platform/capabilities/createCodeAIAutonomousCapability.js", import.meta.url),
  "utf8",
);

test("owner-named repository paths are extracted deterministically", () => {
  assert.deepEqual(extractCodeAIExplicitRepositoryPaths(
    "Inspect lib/code/runtime/CodeAIEmployeeRuntime.js and app/api/operator/code/mission/route.js.",
    4,
  ), [
    "lib/code/runtime/CodeAIEmployeeRuntime.js",
    "app/api/operator/code/mission/route.js",
  ]);
});

test("autonomous capability binds natural-language paths into declared evidence slots", () => {
  assert.match(capability, /const ownerNamedEvidencePaths = extractCodeAIExplicitRepositoryPaths/);
  assert.match(capability, /evidence_path_1: text\(baseObjectiveContext\.evidence_path_1, 1000\) \|\| ownerNamedEvidencePaths\[0\]/);
  assert.match(capability, /evidence_path_4: text\(baseObjectiveContext\.evidence_path_4, 1000\) \|\| ownerNamedEvidencePaths\[3\]/);
});
