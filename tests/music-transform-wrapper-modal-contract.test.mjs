import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const extend = await readFile("scripts/run-avantiqo-music-extend-controlled-benchmark-local.mjs", "utf8");
const remix = await readFile("scripts/run-avantiqo-music-remix-variation-certification-local.mjs", "utf8");
test("transform operator wrappers use the canonical Modal benchmark only", () => {
  assert.match(extend, /ai\.audio\.extend/); assert.match(extend, /MUSICAL_CONTINUITY/);
  assert.match(remix, /ai\.audio\.remix/); assert.match(remix, /MUSICAL_VARIATION/);
  for (const source of [extend, remix]) {
    assert.match(source, /benchmark-avantiqo-music-transform\.mjs/);
    assert.doesNotMatch(source, /RUNPOD|SAFE_LEASE|run-avantiqo-music-transform-certification/i);
  }
});
