import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicRecordingStudioPanel.jsx","utf8");
const route=fs.readFileSync("app/api/creative/music/auto-studio/route.js","utf8");

test("Recording Studio visibly separates quarantined saves from normal success",()=>{
  assert.match(panel,/quarantined_from_active_multitrack === true/);
  assert.match(panel,/QC reasons:/);
  assert.match(panel,/Promote quarantined take/);
  assert.match(panel,/I reviewed the quarantine reasons/);
  assert.match(panel,/Optional reason for override/);
  assert.match(panel,/saved\?\.quarantined_from_active_multitrack === true \? <div/);
  assert.match(panel,/: saved \? <div className="mt-4 rounded-xl border border-emerald/);
});

test("promotion UI uses server-provided exact revision and explicit acknowledgement",()=>{
  assert.match(route,/current_multitrack_revision: currentMultitrackRevision/);
  assert.match(panel,/expected_revision: saved.current_multitrack_revision/);
  assert.match(panel,/acknowledge_quarantine_reasons: true/);
  assert.match(panel,/override_note: overrideNote/);
  assert.match(panel,/disabled=\{busy \|\| !quarantineAck\}/);
});
