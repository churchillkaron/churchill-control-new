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
test("ambiguity recovery ignores a later invalid contract package when an earlier valid package exists", () => {
  const valid = JSON.stringify({
    contract: "AVANTIQO_CODE_AI_WORK_PACKAGE_V1",
    phase: "implementation",
    summary: "usable package",
    operations: [
      { action: "search", description: "find source", input: { query: "orders" } },
    ],
  });
  const invalid = JSON.stringify({
    contract: "AVANTIQO_CODE_AI_WORK_PACKAGE_V1",
    phase: "implementation",
    summary: "invalid final draft",
    operations: [
      { action: "invented_action", description: "bad", input: {} },
    ],
  });

  const parsed = parseCodeAIWorkPackage(`Draft:\n${valid}\nFinal:\n${invalid}`);
  assert.equal(parsed.summary, "usable package");
  assert.equal(parsed.operations[0].action, "search");
});
test("ambiguity recovery skips later apply_files package with non-executable input shape", () => {
  const valid = JSON.stringify({
    contract: "AVANTIQO_CODE_AI_WORK_PACKAGE_V1",
    phase: "discovery",
    summary: "usable discovery",
    operations: [
      { action: "read", description: "read source", input: { file_path: "src/orders.js" } },
    ],
  });
  const invalid = JSON.stringify({
    contract: "AVANTIQO_CODE_AI_WORK_PACKAGE_V1",
    phase: "implementation",
    summary: "bad patch shape",
    operations: [
      {
        action: "apply_files",
        description: "bad",
        input: { file_path: "src/orders.js", patch: "@@ broken @@" },
      },
    ],
  });

  const parsed = parseCodeAIWorkPackage(`Draft:\n${valid}\nFinal:\n${invalid}`);
  assert.equal(parsed.summary, "usable discovery");
  assert.equal(parsed.operations[0].action, "read");
});
