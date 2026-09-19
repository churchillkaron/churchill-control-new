import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { analyzeMusicMixEngineer } from "../lib/creative/music/runtime/CreativeMusicMixEngineerRuntime.js";

function track(id, type, name) {
  return { id, type, name, mute:false, solo:false, gain_db:0, pan:0, channel_strip:{ high_pass_hz:20, low_shelf_db:0, presence_db:0, high_shelf_db:0, compressor:{} }, inserts:[], sends:[] };
}

test("Mix Engineer creates a bounded vocal pocket only from measured overlap proxy", () => {
  const session={ tracks:[track("vox","vocal","Lead Vocal"),track("keys","keys","Piano") ] };
  const evidence={ contract:"AVANTIQO_MUSIC_MIX_EVIDENCE_V2", simultaneous_masking_measured:false, tracks:[{track_id:"vox",measured:true},{track_id:"keys",measured:true}], relationships:[{track_a_id:"vox",track_b_id:"keys",presence_overlap_score:0.91,low_overlap_score:0.2,level_proximity_score:0.8}] };
  const plan=analyzeMusicMixEngineer(session,evidence);
  const keys=plan.track_decisions.find(row=>row.track_id==="keys");
  assert.equal(plan.simultaneous_masking_measured,false);
  assert.ok(plan.relationship_decisions.some(row=>row.type==="VOCAL_MASKING_PROXY"));
  assert.ok(keys.channel_strip.presence_db < 0);
  assert.ok(keys.decisions.includes("create measured vocal presence pocket"));
});

test("Mix Engineer separates bass and drums only when low-band overlap proxy is strong", () => {
  const session={ tracks:[track("bass","bass","Bass"),track("drums","drums","Drums") ] };
  const evidence={ contract:"AVANTIQO_MUSIC_MIX_EVIDENCE_V2", simultaneous_masking_measured:false, tracks:[{track_id:"bass",measured:true},{track_id:"drums",measured:true}], relationships:[{track_a_id:"bass",track_b_id:"drums",presence_overlap_score:0.2,low_overlap_score:0.88,level_proximity_score:0.7}] };
  const plan=analyzeMusicMixEngineer(session,evidence);
  const bass=plan.track_decisions.find(row=>row.track_id==="bass");
  const drums=plan.track_decisions.find(row=>row.track_id==="drums");
  assert.ok(plan.relationship_decisions.some(row=>row.type==="LOW_END_MASKING_PROXY"));
  assert.ok(bass.decisions.includes("reduce bass/kick low-band overlap proxy"));
  assert.ok(drums.channel_strip.high_pass_hz >= 32);
});

test("Workstation explains that relationship evidence is a proxy, not simultaneous masking", () => {
  const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicMixEngineerPanel.jsx","utf8");
  assert.match(panel,/Inter-track relationships/);
  assert.match(panel,/temporal spectral competition, not psychoacoustic masking/i);
});
