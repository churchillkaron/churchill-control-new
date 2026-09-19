import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const evidence=fs.readFileSync("lib/creative/music/runtime/CreativeMusicMixEvidenceRuntime.js","utf8");
const engineer=fs.readFileSync("lib/creative/music/runtime/CreativeMusicMixEngineerRuntime.js","utf8");
const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicMixEngineerPanel.jsx","utf8");

test("low-frequency stereo risk is measured and advisory only",()=>{
  assert.match(evidence,/low_stereo_correlation/);
  assert.match(evidence,/low_mono_fold_down_loss_db/);
  assert.match(evidence,/low_stereo_phase_risk_track_count/);
  assert.match(engineer,/TRACK_LOW_STEREO_PHASE_RISK/);
  assert.match(engineer,/will not force bass mono or alter polarity/);
  assert.match(panel,/low corr/);
  assert.match(panel,/low mono Δ/);
});
