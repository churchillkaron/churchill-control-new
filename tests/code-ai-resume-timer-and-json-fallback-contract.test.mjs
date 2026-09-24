import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { parseCodeAIWorkPackage } from "../lib/code/runtime/CodeAIWorkPackageCoreRuntime.js";

const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");
const live = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");

test("resumed Code passes reset the visible pass timer", () => {
  assert.match(ide, /const taskStartedAt = Date\.now\(\)/);
  assert.match(ide, /setMissionStartedAt\(taskStartedAt\)/);
  assert.doesNotMatch(ide, /requestedResumeMissionId && current \? current : taskStartedAt/);
});

test("multiple contract packages fall through to specific validation instead of JSON ambiguity", () => {
  const oversizedOps = Array.from({ length: 13 }, (_, index) => ({
    action: "search",
    description: `search ${index}`,
    input: { query: `q${index}` },
  }));
  const first = JSON.stringify({
    contract: "AVANTIQO_CODE_AI_WORK_PACKAGE_V1",
    phase: "implementation",
    summary: "draft",
    operations: [{ action: "search", description: "one", input: { query: "one" } }],
  });
  const final = JSON.stringify({
    contract: "AVANTIQO_CODE_AI_WORK_PACKAGE_V1",
    phase: "implementation",
    summary: "oversized final",
    operations: oversizedOps,
  });

  assert.throws(
    () => parseCodeAIWorkPackage(`Draft:\n${first}\nFinal:\n${final}`),
    /CODE_AI_WORK_PACKAGE_OPERATION_LIMIT_EXCEEDED:13/,
  );
  assert.match(live, /modelOperationCount > packageOperationLimit/);
  assert.match(live, /CODE_AI_WORK_PACKAGE_OPERATION_LIMIT_EXCEEDED:\$\{modelOperationCount\}/);
});

test("JSON ambiguity remains repairable if no contract candidate can be selected", () => {
  assert.match(live, /reason === "CODE_AI_WORK_PACKAGE_JSON_AMBIGUOUS"/);
  assert.match(live, /compactJsonOnly[\s\S]*CODE_AI_WORK_PACKAGE_JSON_AMBIGUOUS/);
});
