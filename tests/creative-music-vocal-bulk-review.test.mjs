import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const tuningRoute = fs.readFileSync(new URL("../app/api/creative/music/vocal-tuning-plan/route.js", import.meta.url), "utf8");
const timingRoute = fs.readFileSync(new URL("../app/api/creative/music/vocal-timing-plan/route.js", import.meta.url), "utf8");
const tuningPanel = fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicVocalTuningPlanPanel.jsx", import.meta.url), "utf8");
const timingPanel = fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicVocalTimingPlanPanel.jsx", import.meta.url), "utf8");

test("pitch bulk review approves only existing proposed segments without rendering audio", () => {
  assert.match(tuningRoute, /action === "approve_all_proposed"/);
  assert.match(tuningRoute, /approveMusicVocalTuningSegment\(reviewed, text\(segment\.id\), \{ approved: true \}\)/);
  assert.match(tuningRoute, /audio_changed: false/);
  assert.match(tuningRoute, /provider_job_submitted: false/);
  assert.match(tuningPanel, /Approve all proposed/);
  assert.match(tuningPanel, /does not replace the final human listening approval/);
});

test("timing bulk review approves only eligible safe proposals without audio mutation", () => {
  assert.match(timingRoute, /action === "review_all_safe"/);
  assert.match(timingRoute, /phrase\.eligible !== true/);
  assert.match(timingRoute, /reviewMusicVocalTimingPhrase\(reviewed, text\(phrase\.id\), \{ approved: true \}\)/);
  assert.match(timingRoute, /audio_changed: false/);
  assert.match(timingPanel, /Approve all safe moves/);
  assert.match(timingPanel, /does not stretch phrases, render audio, or replace final listening review/);
});
