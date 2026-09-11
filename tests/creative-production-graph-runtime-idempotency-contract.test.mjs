import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync(new URL("../lib/creative/production-graph/runtime/ProductionGraphRuntime.js", import.meta.url), "utf8");
const repository = fs.readFileSync(new URL("../lib/creative/production-graph/repositories/ProductionGraphRepository.js", import.meta.url), "utf8");

test("production graph create checks handoff identity before insert", () => {
  assert.match(runtime, /const existing = await Repository\.getByHandoffKey/);
  assert.match(runtime, /if \(existing\) return existing/);
  assert.match(runtime, /production_handoff_key: handoffKey/);
});

test("concurrent unique violation resolves to raced existing graph", () => {
  assert.match(runtime, /error\?\.code.*23505/);
  assert.match(runtime, /const raced = await Repository\.getByHandoffKey/);
  assert.match(runtime, /if \(raced\) return raced/);
});

test("repository lookup is organization and project scoped", () => {
  assert.match(repository, /\.eq\("organization_id", organization_id\)/);
  assert.match(repository, /\.eq\("creative_project_id", creative_project_id\)/);
  assert.match(repository, /metadata->>production_handoff_key/);
});
