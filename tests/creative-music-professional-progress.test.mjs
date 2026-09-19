import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const panel = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicProfessionalReleasePanel.jsx", "utf8");
const route = fs.readFileSync("app/api/creative/music/professional-release/route.js", "utf8");
test("Professional Release exposes customer progress and auto-polls only durable pending work", () => {
  assert.match(panel, /Production progress/);
  assert.match(panel, /Avantiqo working/);
  assert.match(panel, /Needs you/);
  assert.match(panel, /progressPercent/);
  assert.match(panel, /action: "poll_pending"/);
  assert.match(panel, /setInterval/);
  assert.match(panel, /pending_execution\?\.usage_id/);
  assert.match(route, /professional_stem_pending/);
  assert.match(route, /pollPendingStage/);
  assert.match(route, /authorized_stage: "STEM_SEPARATION"/);
  assert.match(route, /if \(!pending\?\.usage_id\) return status\(body\)/);
});
