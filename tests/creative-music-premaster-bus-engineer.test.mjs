import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildMusicPremasterBusDecision } from "../lib/creative/music/runtime/CreativeMusicPremasterBusEngineerRuntime.js";

test("premaster bus repair is bounded and never adds loudness makeup",()=>{
  const decision=buildMusicPremasterBusDecision({failures:["low_end_balance","upper_mid_control"],metrics:{low_end_vs_body_db:7.2,harshness_vs_body_db:9.5,crest_factor_db:12},headroom_db:5},{eq:{low_shelf_db:0,presence_db:0},compressor:{enabled:false}});
  assert.equal(decision.status,"TECHNICAL_BUS_REPAIR_READY");
  assert.equal(decision.processing.eq.low_shelf_db,-0.5);
  assert.equal(decision.processing.eq.presence_db,-0.5);
  assert.equal(decision.processing.compressor.makeup_db??0,0);
  assert.equal(decision.release_limiter_forbidden,true);
});

test("low crest forbids additional master glue",()=>{
  const decision=buildMusicPremasterBusDecision({failures:["dynamic_life"],metrics:{crest_factor_db:4.8},headroom_db:5},{compressor:{enabled:true,ratio:1.8,makeup_db:1}});
  assert.equal(decision.processing.compressor.enabled,false);
  assert.ok(decision.changes.some(x=>x.code==="MASTER_GLUE_BYPASS"));
});

test("healthy premaster only proposes optional glue audition",()=>{
  const decision=buildMusicPremasterBusDecision({failures:[],metrics:{crest_factor_db:12},headroom_db:6},{compressor:{enabled:false}});
  assert.equal(decision.status,"GLUE_AUDITION_OPTIONAL");
  assert.equal(decision.glue_audition.automatic_apply,false);
  assert.equal(decision.glue_audition.compressor.makeup_db,0);
});

test("professional premaster QC persists bus decision and repair applies it",()=>{
  const src=fs.readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalMixRuntime.js","utf8");
  assert.match(src,/buildMusicPremasterBusDecision/);
  assert.match(src,/bus_decision:busDecision/);
  assert.match(src,/TECHNICAL_BUS_REPAIR_READY/);
  assert.match(src,/target:"MASTER_BUS"/);
});

test("professional release status exposes bus decision and UI explains glue remains a listening decision",()=>{
  const route=fs.readFileSync("app/api/creative/music/professional-release/route.js","utf8");
  const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicProfessionalReleasePanel.jsx","utf8");
  assert.match(route,/bus_decision: source\.metadata\?\.professional_premaster_qc\?\.bus_decision/);
  assert.match(panel,/Master-bus correction/);
  assert.match(panel,/never auto-compressed/);
});
