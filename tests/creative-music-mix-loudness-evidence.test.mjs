import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const evidence=fs.readFileSync("lib/creative/music/runtime/CreativeMusicMixEvidenceRuntime.js","utf8");
const engineer=fs.readFileSync("lib/creative/music/runtime/CreativeMusicMixEngineerRuntime.js","utf8");
const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicMixEngineerPanel.jsx","utf8");

test("mix evidence carries loudness/true-peak measurements as analysis evidence only",()=>{
  assert.match(evidence,/integrated_lufs:loudness.integrated_lufs/);
  assert.match(evidence,/true_peak_dbtp:loudness.true_peak_dbtp/);
  assert.match(evidence,/loudness_range_lu:loudness.loudness_range_lu/);
  assert.match(engineer,/integrated_lufs:r.integrated_lufs/);
  assert.match(engineer,/true_peak_dbtp:r.true_peak_dbtp/);
  assert.match(panel,/LUFS \{row\.evidence\.integrated_lufs/);
  assert.match(panel,/dBTP/);
  assert.match(panel,/LRA/);
});
