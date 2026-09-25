import test from "node:test";
import assert from "node:assert/strict";
import { planCreativeStillWorldClassProduction } from "../lib/creative/stills/runtime/CreativeStillWorldClassPlanningRuntime.js";

test("premium ad with a persistent real world activates production design and location ownership",()=>{
  const plan=planCreativeStillWorldClassProduction({
    project:{name:"Luxury vehicle campaign in Monaco harbour"},
    brief:{creative_objective:"Premium photographic ad campaign with exact hero car, real location, persistent visual world and social variants"},
    deliverables:[{type:"CAMPAIGN",channels:["instagram","facebook"]}],
  });
  assert.equal(plan.controls.persistent_visual_bible,true);
  assert.equal(plan.controls.production_design_authority,true);
  assert.equal(plan.controls.location_authority,true);
  assert.ok(plan.active_role_ids.includes("production_designer"));
  assert.ok(plan.active_role_ids.includes("location_production_supervisor"));
  assert.ok(plan.active_role_ids.includes("cg_asset_supervisor"));
  assert.ok(plan.departments.some((d)=>d.id==="visual_bible"));
  assert.ok(plan.departments.some((d)=>d.id==="world_building"));
});

test("feature-film visual world uses same still authority architecture rather than a separate book-only path",()=>{
  const plan=planCreativeStillWorldClassProduction({
    project:{name:"Novel adaptation visual development"},
    brief:{creative_objective:"Feature film from a novel with recurring characters, wardrobe, locations, props and world continuity"},
  });
  assert.equal(plan.signals.persistent_world,true);
  assert.equal(plan.controls.persistent_visual_bible,true);
  assert.ok(plan.departments.some((d)=>d.id==="visual_bible"));
  assert.ok(plan.departments.some((d)=>d.id==="world_building"));
});
