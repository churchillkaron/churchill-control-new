import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "lib/platform/service-runtime/execution/ServiceExecutionRuntime.js",
  "utf8",
);

test("service execution imports its creative provider claim runtime", () => {
  assert.match(
    source,
    /import\s*\{\s*CreativeProviderExecutionClaimRuntime,?\s*\}\s*from\s*["']\.\/CreativeProviderExecutionClaimRuntime\.js["'];/,
  );
});
