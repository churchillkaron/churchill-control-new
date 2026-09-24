import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(
  new URL("../app/(system)/workspace/[organizationId]/administration/compute/page.jsx", import.meta.url),
  "utf8",
);

test("compute page preserves last known-good capacity across transient live failures", () => {
  assert.match(page, /avantiqo\.compute\.last-good:/);
  assert.match(page, /sessionStorage\.getItem\(cacheKey\)/);
  assert.match(page, /sessionStorage\.setItem\(cacheKey, JSON\.stringify\(json\)\)/);
  assert.match(page, /Showing the last known-good snapshot/);
  assert.match(page, /Capacity is unknown; it is not being reported as zero/);
  assert.match(page, /Last known online/);
});

test("compute metrics never coerce missing live data to fake zero capacity", () => {
  assert.match(page, /label="Nodes online" value=\{data \?/);
  assert.match(page, /label="Local GPU" value=\{data \?/);
  assert.match(page, /label="Local CPU" value=\{data \?/);
  assert.match(page, /label="Queue" value=\{data \?/);
  assert.doesNotMatch(page, /nodes_online \|\| 0/);
  assert.doesNotMatch(page, /nodes_total \|\| 0/);
});
