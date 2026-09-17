import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildProfessionalPremasterListeningRepairPlan } from "../lib/creative/music/runtime/CreativeMusicPremasterListeningRepairRuntime.js";

const mix=fs.readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalMixRuntime.js","utf8");
const finalization=fs.readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalFinalizationRuntime.js","utf8");
const route=fs.readFileSync("app/api/creative/music/professional-release/route.js","utf8");
const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicProfessionalReleasePanel.jsx","utf8");

test("supported listening findings become bounded non-mutating repair actions",()=>{
  const plan=buildProfessionalPremasterListeningRepairPlan({mix_asset_id:"mix-1",dailies:{repair_brief:{direction_hash:"d",preproduction_hash:"p",repairs:[
    {family:"TECHNICAL",instruction:"Reduce upper-mid harshness and listening fatigue."},
    {family:"PERFORMANCE",instruction:"Bring the lead vocal forward and clearer."},
    {family:"SONIC_IDENTITY",instruction:"Use more depth and space around the vocal."},
  ],regions:[{family:"TECHNICAL",start_seconds:10,end_seconds:20}]}}});
  assert.equal(plan.status,"SAFE_REPAIR_PLAN_READY");
  assert.equal(plan.mutation_authorized,false);
  assert.equal(plan.requires_explicit_apply,true);
  assert.ok(plan.actions.some(row=>row.code==="LISTENING_REDUCE_HARSHNESS"&&row.change_db===-0.75));
  assert.ok(plan.actions.some(row=>row.code==="LISTENING_VOCAL_FORWARD"&&row.gain_db===0.4));
  assert.ok(plan.actions.some(row=>row.code==="LISTENING_MORE_DEPTH"&&row.reverb_delta_db===0.5));
});

test("unsupported artistic prose remains listening-only",()=>{
  const plan=buildProfessionalPremasterListeningRepairPlan({mix_asset_id:"mix-1",dailies:{repair_brief:{repairs:[{family:"MUSICALITY",instruction:"Make the chorus feel more emotionally inevitable."}]}}});
  assert.equal(plan.status,"NO_SAFE_AUTOMATIC_REPAIR");
  assert.equal(plan.actions.length,0);
  assert.equal(plan.unsupported.length,1);
});

test("failed premaster listening persists a repair plan but does not mutate",()=>{
  assert.match(finalization,/buildProfessionalPremasterListeningRepairPlan/);
  assert.match(finalization,/repair_plan:repairPlan/);
  assert.match(finalization,/mastering_authorized:passed/);
});

test("explicit listening repair creates a new revision and invalidates stale lineage",()=>{
  assert.match(mix,/applyProfessionalPremasterListeningRepair/);
  assert.match(mix,/professional_mix_passed:false/);
  assert.match(mix,/professional_mix_asset_id:null/);
  assert.match(mix,/professional_premaster_qc_passed:false/);
  assert.match(mix,/requires_fresh_technical_qc:true/);
  assert.match(mix,/requires_fresh_listening:true/);
  assert.match(mix,/PREMASTER_LISTENING_REPAIR_SNAPSHOT_V1/);
});

test("API and customer UI expose explicit listening repair",()=>{
  assert.match(route,/repair_premaster_listening/);
  assert.match(route,/premaster_listening_repair/);
  assert.match(panel,/Apply listening repair/);
  assert.match(panel,/reviewer note\(s\) remain listening-only/);
});
