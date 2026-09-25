import test from "node:test";
import assert from "node:assert/strict";
import { buildImageVisualBible } from "../lib/creative/image/runtime/CreativeImageVisualBibleRuntime.js";

const approved=(id,name,cls,key)=>({ id,name,status:"APPROVED",url:`https://example.com/${id}.png`,technical:{checksum:id},review:{approved:true},metadata:{visual_bible_class:cls,visual_bible_identity_key:key,image_asset_perceptual_qc_sealed:true,release_approved:true} });

test("visual bible locks recurring ad subjects and locations independently of shot generation",()=>{
  const bible=buildImageVisualBible({asset_nodes:[approved("car","Hero car","VEHICLE","hero-car"),approved("monaco","Monaco location","LOCATION","monaco-harbour")],requirements:{required_classes:["VEHICLE","LOCATION"]}});
  assert.equal(bible.ready,true);
  assert.equal(bible.entities.length,2);
  assert.ok(bible.entities.every((entity)=>entity.locked));
  assert.equal(bible.policies.video_studio_consumes_approved_visual_authority,true);
  assert.ok(bible.bible_digest);
});

test("visual bible supports feature-film scale classes without becoming a video-owned system",()=>{
  const nodes=[
    approved("anna","Anna","CHARACTER","anna"),
    approved("coat","Anna red coat","WARDROBE","anna-red-coat"),
    approved("house","Family house","LOCATION","family-house"),
    approved("letter","Letter","PROP","letter-01"),
    approved("wall","Aged plaster","MATERIAL","aged-plaster"),
  ];
  const bible=buildImageVisualBible({asset_nodes:nodes,requirements:{required_classes:["CHARACTER","WARDROBE","LOCATION","PROP","MATERIAL"]}});
  assert.equal(bible.ready,true);
  assert.equal(bible.entities.length,5);
  assert.equal(bible.policies.image_studio_owns_visual_authority_materialization,true);
});

test("visual bible fails readiness when required visual class has no approved authority",()=>{
  const bible=buildImageVisualBible({asset_nodes:[approved("anna","Anna","CHARACTER","anna")],requirements:{required_classes:["CHARACTER","LOCATION"]}});
  assert.equal(bible.ready,false);
  assert.deepEqual(bible.missing_required_classes,["LOCATION"]);
});

test("visual bible rejects two simultaneous explicit authorities for one identity",()=>{
  const a=approved("a","Hero car","VEHICLE","hero-car"); a.metadata.visual_bible_authoritative=true;
  const b=approved("b","Hero car alt","VEHICLE","hero-car"); b.metadata.visual_bible_authoritative=true;
  const bible=buildImageVisualBible({asset_nodes:[a,b]});
  assert.equal(bible.ready,false);
  assert.equal(bible.conflicting_authorities.length,1);
});
