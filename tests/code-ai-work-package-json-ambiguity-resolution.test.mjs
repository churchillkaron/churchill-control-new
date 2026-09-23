import test from "node:test";
import assert from "node:assert/strict";

import { parseCodeAIWorkPackage } from "../lib/code/runtime/CodeAIWorkPackageCoreRuntime.js";

test("multiple valid work-package JSON objects resolve to the final valid package", () => {
  const first = JSON.stringify({
    contract: "AVANTIQO_CODE_AI_WORK_PACKAGE_V1",
    phase: "implementation",
    summary: "first draft",
    operations: [
      { id: "first-search", action: "search", description: "first", input: { query: "old" } },
    ],
  });
  const final = JSON.stringify({
    contract: "AVANTIQO_CODE_AI_WORK_PACKAGE_V1",
    phase: "implementation",
    summary: "final answer",
    operations: [
      { id: "final-search", action: "search", description: "final", input: { query: "restart recovery" } },
    ],
  });

  const parsed = parseCodeAIWorkPackage(`Draft:\n${first}\nFinal:\n${final}`);
  assert.equal(parsed.summary, "final answer");
  assert.equal(parsed.operations[0].action, "search");
  assert.equal(parsed.operations[0].input.query, "restart recovery");
});
