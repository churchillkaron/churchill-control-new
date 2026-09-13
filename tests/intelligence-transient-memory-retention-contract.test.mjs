import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/operator/runtime/IntelligenceMemoryRuntime.js", import.meta.url),
  "utf8",
);

test("physical retention cleanup only targets old archived transient project memory", () => {
  assert.match(runtime, /purgeArchivedTransientMemory/);
  assert.match(runtime, /365 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(runtime, /\.eq\("active", false\)/);
  assert.match(runtime, /\.eq\("source", "operator_project_state"\)/);
  assert.match(runtime, /\.in\("memory_type", \["completed_step", "blocker", "fact"\]\)/);
  assert.match(runtime, /\.is\("forgotten_at", null\)/);
  assert.match(runtime, /durability:metadata->>durability/);
  assert.match(runtime, /row\?\.durability, 80\) !== "durable"/);
  assert.match(runtime, /Math\.min\(100, Number\(limit\) \|\| 100\)/);
});

test("cleanup is piggybacked on real archival rather than ordinary turns", () => {
  assert.match(runtime, /const purge = archivedCount > 0/);
  assert.match(runtime, /purgeArchivedTransientMemory\(\{ organization, scopes \}\)/);
  assert.match(runtime, /purge_scanned: purge\.scanned/);
  assert.match(runtime, /purged: purge\.purged/);
});
