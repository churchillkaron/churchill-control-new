import assert from "node:assert/strict";
import test from "node:test";
import {
  codeAIWorkPackageForbiddenModelActions,
  codeAIWorkPackageModelOperationCount,
  parseCodeAIWorkPackage,
} from "../lib/code/runtime/CodeAIWorkPackageCoreRuntime.js";

const authoritative = { command: "node", args: ["--test", "tests/exact.test.mjs"] };

function packageWith(operations) {
  return JSON.stringify({
    contract: "AVANTIQO_CODE_AI_WORK_PACKAGE_V1",
    phase: "implementation",
    summary: "repair",
    operations,
  });
}

test("controller-owned verify and diff do not violate mutation-first action policy", () => {
  const parsed = parseCodeAIWorkPackage(packageWith([
    {
      action: "apply_files",
      description: "repair source",
      input: { files: [{ path: "src/a.js", content: "export const a=1;\n" }] },
    },
  ]), { authoritative_verification: authoritative });

  assert.deepEqual(parsed.operations.map((operation) => operation.action), [
    "apply_files", "verify", "diff",
  ]);
  assert.deepEqual(
    codeAIWorkPackageForbiddenModelActions(parsed, ["apply_files"]),
    [],
  );
});

test("matching model verify is adopted as controller-authoritative during mutation-first phase", () => {
  const parsed = parseCodeAIWorkPackage(packageWith([
    {
      action: "apply_files",
      description: "repair source",
      input: { files: [{ path: "src/a.js", content: "export const a=1;\n" }] },
    },
    {
      action: "verify",
      description: "model verify",
      input: { command: "node", args: ["--test", "tests/exact.test.mjs"] },
    },
  ]), { authoritative_verification: authoritative });

  assert.deepEqual(
    codeAIWorkPackageForbiddenModelActions(parsed, ["apply_files"]),
    [],
  );
  assert.ok(parsed.controller_normalizations.some((entry) =>
    entry.kind === "ADOPT_MATCHING_VERIFY_AS_CONTROLLER_AUTHORITATIVE"
  ));
});

test("non-matching model verify cannot suppress exact controller-authoritative verification", () => {
  const parsed = parseCodeAIWorkPackage(packageWith([
    {
      action: "apply_files",
      description: "repair source",
      input: { files: [{ path: "src/a.js", content: "export const a=1;\n" }] },
    },
    {
      action: "verify",
      description: "different model verify",
      input: { command: "node", args: ["--check", "src/a.js"] },
    },
  ]), { authoritative_verification: authoritative });

  assert.equal(parsed.operations.filter((operation) => operation.action === "verify").length, 2);
  assert.deepEqual(parsed.operations.at(-2).input, authoritative);
  assert.deepEqual(
    codeAIWorkPackageForbiddenModelActions(parsed, ["apply_files"]),
    ["verify"],
  );
});

test("model-supplied diff remains forbidden even when controller owns appended verification", () => {
  const parsed = parseCodeAIWorkPackage(packageWith([
    {
      action: "apply_files",
      description: "repair source",
      input: { files: [{ path: "src/a.js", content: "export const a=1;\n" }] },
    },
    {
      action: "diff",
      description: "model diff",
      input: {},
    },
  ]), { authoritative_verification: authoritative });

  assert.deepEqual(
    codeAIWorkPackageForbiddenModelActions(parsed, ["apply_files"]),
    ["diff"],
  );
});
test("controller-owned finalization does not consume the model operation budget", () => {
  const operations = Array.from({ length: 12 }, (_, index) => ({
    action: "apply_files",
    description: `repair ${index + 1}`,
    input: {
      files: [{
        path: `src/file-${index + 1}.js`,
        content: `export const value${index + 1}=${index + 1};\n`,
      }],
    },
  }));
  const parsed = parseCodeAIWorkPackage(packageWith(operations), {
    authoritative_verification: authoritative,
  });
  assert.equal(parsed.operations.length, 14);
  assert.equal(codeAIWorkPackageModelOperationCount(parsed), 12);
});
