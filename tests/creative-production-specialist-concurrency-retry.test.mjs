import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../lib/creative/production-graph/runtime/ProductionGraphRuntime.js", import.meta.url),
  "utf8",
);

test("production specialist wave retries bounded optimistic-concurrency conflicts against fresh graph state", () => {
  assert.match(source, /for \(let attempt = 1; attempt <= 4; attempt \+= 1\)/);
  assert.match(source, /Repository\.updateIfUnchanged\(id,[\s\S]*latest\.updated_at/);
  assert.match(source, /PRODUCTION_GRAPH_CONCURRENT_UPDATE_CONFLICT/);
  assert.match(source, /latest = await Repository\.getById\(id\)/);
  assert.match(source, /if \(!latest\) throw new Error\("PRODUCTION_GRAPH_NOT_FOUND"\)/);
  assert.match(source, /mergeSpecialistWaveState\([\s\S]*latestMetadata\.production_specialist_wave_audit/);
});
