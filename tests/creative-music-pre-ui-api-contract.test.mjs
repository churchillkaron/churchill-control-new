import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("pre-UI Music APIs expose complete governed execution surfaces", async () => {
  const [stems, remix, tuning, elastic, release, sfx] = await Promise.all([
    read("app/api/creative/music/stems/route.js"), read("app/api/creative/music/remix/route.js"),
    read("app/api/creative/music/vocal-tuning-render/route.js"), read("app/api/creative/music/elastic-audio/route.js"),
    read("app/api/creative/music/release-render/route.js"), read("app/api/creative/music/sfx/route.js"),
  ]);
  assert.match(stems, /action === "execute"/); assert.match(stems, /settlePendingService/);
  assert.match(remix, /action === "execute"/); assert.match(remix, /expected_plan_fingerprint/);
  assert.match(tuning, /executeService/); assert.match(tuning, /approved_timing_plan/);
  assert.match(elastic, /executeService/); assert.match(elastic, /automatic_apply_forbidden/);
  assert.match(release, /finishRelease/); assert.match(release, /true_peak_certified/);
  assert.match(sfx, /ai\.sfx\.generate/); assert.match(sfx, /CREATIVE_MUSIC_SFX_CERTIFICATION_REQUIRED/); assert.match(sfx, /executeService/);
});
