import test from "node:test";
import assert from "node:assert/strict";
import { buildCreativeImageStudioOperatingState } from "../lib/creative/stills/runtime/CreativeImageStudioOperatingRuntime.js";

test("Image Studio keeps reference stage active until required persistent character and location authority exist",()=>{
  const state=buildCreativeImageStudioOperatingState({
    projectRuntime:{current:{id:"p",name:"Feature film character at a named location"}},
    strategyRuntime:{current:{id:"s"}},
    assetRuntime:{items:[{id:"ref",asset_type:"image",role:"STYLE_REFERENCE",url:"https://example.com/ref.png"}]},
  });
  assert.equal(state.world_class_plan.controls.persistent_visual_bible,true);
  assert.equal(state.quality.visual_bible_required,true);
  assert.equal(state.quality.visual_bible_ready,false);
  assert.equal(state.stages.find((stage)=>stage.id==="references").state,"ACTIVE");
});

test("Image Studio advances once required visual-bible authorities are approved",()=>{
  const node=(id,name,cls,key)=>({id,name,asset_type:"image",status:"APPROVED",url:`https://example.com/${id}.png`,review:{approved:true},metadata:{visual_bible_class:cls,visual_bible_identity_key:key,image_asset_perceptual_qc_sealed:true,release_approved:true,reference_role:"REFERENCE"}});
  const state=buildCreativeImageStudioOperatingState({
    projectRuntime:{current:{id:"p",name:"Feature film character at a named location"}},
    strategyRuntime:{current:{id:"s"}},
    assetRuntime:{items:[node("c","Anna","CHARACTER","anna"),node("l","Harbour","LOCATION","harbour")]},
  });
  assert.equal(state.quality.visual_bible_ready,true);
  assert.equal(state.visual_bible.ready,true);
  assert.notEqual(state.stages.find((stage)=>stage.id==="references").state,"ACTIVE");
});

test("Image Studio UI exposes visual bible authority instead of hiding continuity in backend", async()=>{
  const fs=await import("node:fs");
  const workspace=fs.readFileSync("components/creative/specialist/ImageStudioWorkspace.jsx","utf8");
  const panel=fs.readFileSync("components/creative/specialist/ImageStudioVisualBiblePanel.jsx","utf8");
  assert.match(workspace,/ImageStudioVisualBiblePanel/);
  assert.match(panel,/Persistent authority shared with Video Studio/);
  assert.match(panel,/Missing authority/);
  assert.match(panel,/Locked/);
});
