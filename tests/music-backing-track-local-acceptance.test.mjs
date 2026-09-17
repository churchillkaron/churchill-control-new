import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const route = fs.readFileSync("app/api/creative/music/studio/route.js", "utf8");
const panel = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicBackingTrackPanel.jsx", "utf8");
test("Backing Track uses governed owned-only local acceptance without weakening production certification", () => {
  assert.match(route, /BENCHMARK_REVIEW_PREVIEW/);
  assert.match(route, /benchmark_only: true/);
  assert.match(route, /owned_only_required: true/);
  assert.match(route, /external_fallback_allowed: false/);
  assert.match(route, /studio_preproduction_review: true/);
  assert.match(route, /allowed_providers: \["avantiqo-audio"\]/);
  assert.match(route, /capability: "ai.audio.stems"/);
  assert.match(route, /local_only: true/);
  assert.match(route, /process\.env\.NODE_ENV === "production"/);
  assert.match(route, /production_certified: plan\.executable === true/);
  assert.match(panel, /Local test ready/);
  assert.match(panel, /Commercial production certification remains separate/);
});
