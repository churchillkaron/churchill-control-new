import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildMusicProfessionalProductionManifest, nextMusicProfessionalProductionAction } from "../lib/creative/music/runtime/CreativeMusicProfessionalProductionRuntime.js";

test("premaster listening is a distinct required gate before mastering",()=>{
  const evidence={source_generated:true,stems_ready:true,vocal_production_passed:true,mix_passed:true,premaster_qc_passed:true,premaster_listening_passed:false};
  const manifest=buildMusicProfessionalProductionManifest({input:{instrumental:false},evidence});
  const ids=manifest.stages.map(x=>x.id);
  assert.ok(ids.indexOf("PREMASTER_QC") < ids.indexOf("PREMASTER_LISTENING"));
  assert.ok(ids.indexOf("PREMASTER_LISTENING") < ids.indexOf("MASTERING"));
  assert.equal(nextMusicProfessionalProductionAction({input:{instrumental:false},evidence}).stage_id,"PREMASTER_LISTENING");
});

test("mastering stays blocked until current premaster listening passes",()=>{
  const finalization=fs.readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalFinalizationRuntime.js","utf8");
  const mix=fs.readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalMixRuntime.js","utf8");
  assert.match(finalization,/CREATIVE_MUSIC_PRO_MASTER_PREMASTER_LISTENING_REQUIRED/);
  assert.match(finalization,/professional_premaster_listening_passed:passed/);
  assert.match(mix,/professional_premaster_listening_passed:false/);
  assert.match(mix,/professional_premaster_listening:null/);
});

test("premaster listening reuses independent rendered-audio dailies and stays separate from final dailies",()=>{
  const finalization=fs.readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalFinalizationRuntime.js","utf8");
  const continuation=fs.readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalContinuationRuntime.js","utf8");
  const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicProfessionalReleasePanel.jsx","utf8");
  assert.match(finalization,/runMusicDailiesListening\(\{ organization_id:organizationId, creative_project_id:projectId, asset:mixAsset/);
  assert.match(finalization,/AVANTIQO_MUSIC_PROFESSIONAL_PREMASTER_LISTENING_V1/);
  assert.match(continuation,/next.stage_id==="PREMASTER_LISTENING"/);
  assert.match(panel,/Listen to pre-master/);
  assert.match(panel,/pre-master listening/);
});
