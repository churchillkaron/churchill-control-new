import test from "node:test";
import assert from "node:assert/strict";

import {
  parseCodeAIWorkPackage,
  CODE_AI_WORK_PACKAGE_CONTRACT,
} from "../lib/code/runtime/CodeAIWorkPackageCoreRuntime.js";

test("Code rejects patch-shaped apply_files planner output", () => {
  const payload = JSON.stringify({
    contract: CODE_AI_WORK_PACKAGE_CONTRACT,
    phase: "implementation",
    operations: [
      {
        action: "apply_files",
        input: {
          file_path: "tmp/example.js",
          start_line: 2,
          end_line: 4,
          patch: "+ return true;",
        },
      },
      {
        action: "verify",
        input: { command: "node", args: ["--check", "tmp/example.js"] },
      },
      { action: "diff", input: {} },
    ],
  });
  assert.throws(
    () => parseCodeAIWorkPackage(payload),
    /CODE_AI_WORK_PACKAGE_APPLY_FILES_CONTRACT_INVALID/,
  );
});

test("Code accepts complete-file apply_files planner output", () => {
  const payload = JSON.stringify({
    contract: CODE_AI_WORK_PACKAGE_CONTRACT,
    phase: "implementation",
    operations: [
      {
        action: "apply_files",
        input: {
          files: [{ path: "tmp/example.js", content: "export default true;\n" }],
        },
      },
      {
        action: "verify",
        input: { command: "node", args: ["--check", "tmp/example.js"] },
      },
      { action: "diff", input: {} },
    ],
  });
  const parsed = parseCodeAIWorkPackage(payload);
  assert.equal(parsed.operations[0].action, "apply_files");
  assert.deepEqual(parsed.operations[0].input.files, [
    { path: "tmp/example.js", content: "export default true;\n" },
  ]);
});
