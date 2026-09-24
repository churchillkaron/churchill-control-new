import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { resolveCodeAIWorkPackageOperationLimit } from "../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js";

const source = fs.readFileSync(
  new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url),
  "utf8",
);

test("read-only work packages have a six-operation hard ceiling", () => {
  assert.equal(resolveCodeAIWorkPackageOperationLimit(
    "Read-only inspect two files. Do not modify files.",
    {},
  ), 6);
  assert.equal(resolveCodeAIWorkPackageOperationLimit(
    "Update the implementation and verify it.",
    {},
  ), 12);
});

test("planner prompt and execution enforcement share the dynamic operation limit", () => {
  assert.match(source, /Maximum model-supplied operations in one package: \$\{packageOperationLimit\}/);
  assert.match(source, /max_package_operations: packageOperationLimit/);
  assert.match(source, /modelOperationCount > packageOperationLimit/);
  assert.match(source, /codeAIWorkPackageModelOperationCount\(workPackage\)/);
});
