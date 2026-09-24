import test from "node:test";
import assert from "node:assert/strict";
import { parseCodeAIPlannerOutput } from "../lib/code/runtime/CodeAIPlannerDecisionParser.js";

test("planner normalizes one legacy work-package operation into the current decision shape", () => {
  const raw = JSON.stringify({
    contract: "AVANTIQO_CODE_AI_WORK_PACKAGE_V1",
    phase: "implementation",
    summary: "Repair the bounded invoice total defect.",
    operations: [{
      action: "apply_files",
      description: "Apply bounded repair",
      input: { files: [{ path: "invoice-total.mjs", content: "export const x = 1;\n" }] },
    }],
    verification: [{ action: "verify", input: { command: "node", args: ["--check", "invoice-total.mjs"] } }],
  });
  const result = parseCodeAIPlannerOutput(raw);
  assert.equal(result.parsed.action, "apply_files");
  assert.equal(result.parsed.input.files[0].path, "invoice-total.mjs");
  assert.equal(result.normalization.mode, "single_legacy_work_package_operation");
  assert.equal(result.normalization.source_contract, "AVANTIQO_CODE_AI_WORK_PACKAGE_V1");
});

test("planner does not collapse multi-operation legacy packages into one mutation", () => {
  const raw = JSON.stringify({
    contract: "AVANTIQO_CODE_AI_WORK_PACKAGE_V1",
    operations: [
      { action: "apply_files", input: { files: [{ path: "a.js", content: "a" }] } },
      { action: "verify", input: { command: "node", args: ["--check", "a.js"] } },
    ],
  });
  const result = parseCodeAIPlannerOutput(raw);
  assert.equal(result.parsed.action, undefined);
  assert.equal(result.normalization.mode, "single_json_value");
});
