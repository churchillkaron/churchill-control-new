import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildCreativeStillFinishingChain } from "../lib/creative/stills/runtime/CreativeStillFinishingChainRuntime.js";
import { planCreativeStillWorldClassProduction } from "../lib/creative/stills/runtime/CreativeStillWorldClassPlanningRuntime.js";

test("premium advertising still requires retouch, composite, color DI and master finishing as governed stages",()=>{
  const plan=planCreativeStillWorldClassProduction({brief:{creative_objective:"premium photographic advertising campaign with exact product and social variants"},deliverables:[{type:"advert",channels:["instagram","facebook"]}]});
  const chain=buildCreativeStillFinishingChain({plan,tasks:[]});
  assert.equal(chain.passed,false);
  for(const id of ["retouch","composite","color_di","master_finish"]){
    assert.equal(chain.stages.find((s)=>s.id===id)?.required,true);
  }
});

test("finishing chain passes only with separate stage evidence",()=>{
  const plan={signals:{photographic:true,multi_format:true},controls:{premium_advertising_benchmark:true}};
  const tasks=[
    {id:"r",status:"COMPLETED",title:"Retouch hero still"},
    {id:"c",status:"COMPLETED",title:"Final composite"},
    {id:"d",status:"COMPLETED",title:"Color DI grade"},
    {id:"m",status:"COMPLETED",title:"Final master delivery variants"},
  ];
  const chain=buildCreativeStillFinishingChain({plan,tasks});
  assert.equal(chain.passed,true);
  assert.ok(chain.final_chain_digest);
});

test("post production supervisor is eligible for still work",()=>{
  const registry=fs.readFileSync("lib/creative/director/registry/CreativeAgencyRoleRegistry.js","utf8");
  assert.match(registry,/id: "post_production_supervisor"[\s\S]*applies_to: \["TEMPORAL", "STILL"\]/);
});

test("Image Studio operating state exposes finishing blockers and UI surface", async()=>{
  const fs=await import("node:fs");
  const operating=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioOperatingRuntime.js","utf8");
  const workspace=fs.readFileSync("components/creative/specialist/ImageStudioWorkspace.jsx","utf8");
  const panel=fs.readFileSync("components/creative/specialist/ImageStudioFinishingPanel.jsx","utf8");
  assert.match(operating,/finishing_chain: finishingChain/);
  assert.match(operating,/finishing_blockers: finishingChain\.failures/);
  assert.match(workspace,/ImageStudioFinishingPanel/);
  assert.match(panel,/Retouch → composite → color \/ DI → master/);
});
