import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const evidence=fs.readFileSync("lib/creative/music/runtime/CreativeMusicMixEvidenceRuntime.js","utf8");
const engineer=fs.readFileSync("lib/creative/music/runtime/CreativeMusicMixEngineerRuntime.js","utf8");
const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicMixEngineerPanel.jsx","utf8");

test("intermittent harshness is measured as an advisory risk, not blindly auto-EQed",()=>{
  assert.match(evidence,/median_harshness_vs_body_db/);
  assert.match(evidence,/p90_harshness_vs_body_db/);
  assert.match(evidence,/p90_excursion_db/);
  assert.match(evidence,/excessive_harsh_window_count/);
  assert.match(evidence,/p90>-4&&excursion>=6/);
  assert.match(engineer,/TRACK_INTERMITTENT_HARSHNESS_RISK/);
  assert.match(engineer,/will not apply dynamic EQ automatically without listening review/);
  assert.match(panel,/harsh P90/);
});
