import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const evidence=fs.readFileSync("lib/creative/music/runtime/CreativeMusicMixEvidenceRuntime.js","utf8");
const engineer=fs.readFileSync("lib/creative/music/runtime/CreativeMusicMixEngineerRuntime.js","utf8");
const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicMixEngineerPanel.jsx","utf8");

test("stereo evidence is measured and severe phase risk is advisory not blindly mutated",()=>{
  assert.match(evidence,/stereo_correlation/);
  assert.match(evidence,/mono_fold_down_loss_db/);
  assert.match(evidence,/corr<-.15\|\|loss<-4/);
  assert.match(engineer,/TRACK_STEREO_PHASE_RISK/);
  assert.match(engineer,/will not auto-narrow or alter polarity/);
  assert.match(panel,/corr \{row\.evidence\.stereo_correlation/);
  assert.match(panel,/mono Δ/);
});
