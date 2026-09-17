import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/creative/music/professional-release/route.js", "utf8");
const panel = readFileSync("components/creative/ProductionStudio/workspaces/MusicProfessionalReleasePanel.jsx", "utf8");

test("professional release exposes corrected vocal as an explicit human review candidate", () => {
  assert.match(route, /latestCorrectedVocal/);
  assert.match(route, /VOCAL_TUNING_RENDER/);
  assert.match(route, /professional_vocal_preparation\?\.restored_vocal_asset_id/);
  assert.match(route, /vocal_review_candidate/);
});

test("professional vocal approval requires explicit listening approval and authenticated reviewer evidence", () => {
  assert.match(route, /human_listening_review_approved !== true/);
  assert.match(route, /certifyProfessionalVocalProduction/);
  assert.match(route, /approved_by: access\?\.userEmail \|\| access\?\.userId/);
  assert.match(route, /action === "certify_vocal"/);
});

test("professional release panel cannot silently approve corrected vocals", () => {
  assert.match(panel, /action: "certify_vocal"/);
  assert.match(panel, /human_listening_review_approved: true/);
  assert.match(panel, /I listened — approve vocal/);
  assert.match(panel, /Listen in Vocal Studio before approving it for the commercial mix/);
});
