import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../lib/operator/runtime/OperatorCapabilityCatalog.js", import.meta.url),
  "utf8",
);

test("Operator capability discovery is bounded-parallel and deterministic", () => {
  assert.match(source, /CATALOG_LOAD_CONCURRENCY = 16/);
  assert.match(source, /async function boundedParallelMap/);
  assert.match(source, /boundedParallelMap\(domainNames/);
  assert.match(source, /boundedParallelMap\(candidates/);
  assert.match(source, /loaded\.filter\(Boolean\)\.sort\(\(a, b\) => a\.key\.localeCompare\(b\.key\)\)/);
});

test("parallel discovery preserves cache and capability safety metadata", () => {
  assert.match(source, /CACHE_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(source, /operator_enabled: operatorEnabled/);
  assert.match(source, /transactional: manifest\?\.transactional === true/);
  assert.match(source, /requires_confirmation:/);
  assert.match(source, /permissions: values\(manifest\?\.permissions\)/);
  assert.match(source, /context_scope: normalizeContextScope/);
});
