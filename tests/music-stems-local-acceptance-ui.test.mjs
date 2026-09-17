import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const route = await readFile("app/api/creative/music/stems/route.js", "utf8");
const panel = await readFile("components/creative/ProductionStudio/workspaces/MusicStemsPanel.jsx", "utf8");
test("standard stems use governed local acceptance without weakening production certification", () => {
  assert.match(route, /BENCHMARK_REVIEW_PREVIEW/);
  assert.match(route, /external_fallback_allowed: false/);
  assert.match(route, /production_certified: productionCertified/);
  assert.match(route, /local_acceptance: localAcceptance/);
  assert.match(route, /demucs-htdemucs-ft/);
});
test("stems UI executes, polls and exposes customer files", () => {
  assert.match(panel, /action: "execute"/);
  assert.match(panel, /action: "status"/);
  assert.match(panel, /setInterval\(poll, 3000\)/);
  assert.match(panel, /stemFiles/);
  assert.match(panel, /Local test ready/);
});
test("vocal role separation remains outside standard local Demucs execution", () => {
  assert.match(panel, /separationMode !== "STANDARD_STEMS"/);
  assert.match(panel, /Research \/ benchmark required/);
  assert.match(panel, /Dedicated vocal-role separator/);
});
