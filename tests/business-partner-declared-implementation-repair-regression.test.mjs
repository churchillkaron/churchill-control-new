import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  "lib/operator/runtime/OperatorTurnRuntimeCore.js",
  "utf8",
);

test("declared implementation failures enter Product Engineering before surfacing", () => {
  assert.match(
    source,
    /catch \(executionError\)[\s\S]*attemptDeclaredImplementationRepair\(\{[\s\S]*error: executionError/,
  );
  assert.match(
    source,
    /implementationRepair\?\.repaired_and_resumed === true[\s\S]*result = implementationRepair\.retry_result/,
  );
});
