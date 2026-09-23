import assert from "node:assert/strict";
import test from "node:test";
import {
  compileImageProviderReferences,
} from "../lib/creative/image/runtime/CreativeImageProviderReferenceCompilerRuntime.js";
import {
  applyCreativeVideoNativeControls,
} from "../lib/creative/video/runtime/CreativeVideoNativeControlRuntime.js";

function ref(role,id){
  return {url:"storage://asset/"+id,role,asset_node_id:id};
}

test("compiler preserves storage and asset-id references, not only URLs",()=>{
  const result=compileImageProviderReferences({
    source_assets:[
      {asset_id:"asset-123",role:"IDENTITY_KEYFRAME_REFERENCE"},
      {storage_reference:"storage://ref/world",role:"CLOSING_KEYFRAME_REFERENCE"},
    ],
  });
  assert.equal(result.source_asset_count,2);
  assert.equal(result.compiled_asset_count,2);
});

test("compiler preserves aliased hero-continuity authority on one URL",()=>{
  const same="storage://asset/hero";
  const result=compileImageProviderReferences({
    source_assets:[
      {url:same,role:"IMAGE_STUDIO_SELECTED_HERO_FRAME",asset_node_id:"hero"},
      {url:same,role:"IMAGE_STUDIO_CONTINUITY_REFERENCE",asset_node_id:"continuity"},
    ],
  });
  assert.equal(result.provider_transport_safe,true);
  assert.equal(result.source_assets.length,1);
  assert.deepEqual(
    new Set(result.source_assets[0].role_aliases),
    new Set([
      "IMAGE_STUDIO_SELECTED_HERO_FRAME",
      "IMAGE_STUDIO_CONTINUITY_REFERENCE",
    ]),
  );
  assert.equal(result.missing_mandatory_roles.length,0);
});

test("compiler reserves transport but keeps essential geometry and material groups",()=>{
  const source=[
    ref("IMAGE_STUDIO_SELECTED_HERO_FRAME","hero"),
    ref("IMAGE_STUDIO_CONTINUITY_REFERENCE","continuity"),
    ref("IMAGE_STUDIO_PERFORMANCE_REFERENCE","performance"),
    ref("IMAGE_STUDIO_CONTACT_DETAIL_REFERENCE","contact"),
    ref("IMAGE_STUDIO_CHARACTER_FRONT","cf"),
    ref("IMAGE_STUDIO_CHARACTER_LEFT_THREE_QUARTER","cl"),
    ref("IMAGE_STUDIO_THREAT_FRONT","tf"),
    ref("IMAGE_STUDIO_THREAT_LEFT_THREE_QUARTER","tl"),
    ref("IMAGE_STUDIO_MATERIAL_TRUTH_WET_SKIN","skin"),
    ref("IMAGE_STUDIO_MATERIAL_TRUTH_WET_METAL","metal"),
    ref("IMAGE_STUDIO_MATERIAL_TRUTH_GROUND","ground"),
  ];
  const result=compileImageProviderReferences({
    task:{input:{requirements:{subject:"runner and drone in rain",action:"runs through wet forest"}}},
    source_assets:source,
  });
  assert.equal(result.provider_transport_safe,true);
  assert.equal(result.compiled_asset_count,10);
  assert.equal(result.provider_total_reference_limit,12);
  assert.equal(result.native_video_reference_reserve,2);
  assert.deepEqual(result.missing_mandatory_groups,[]);
  const roles=result.source_assets.map(item=>item.role);
  assert.ok(roles.some(role=>role.startsWith("IMAGE_STUDIO_CHARACTER_")));
  assert.ok(roles.some(role=>role.startsWith("IMAGE_STUDIO_THREAT_")));
  assert.ok(roles.some(role=>role.startsWith("IMAGE_STUDIO_MATERIAL_TRUTH_")));
});

test("compiler fails closed when user forces a budget below required authority groups",()=>{
  const result=compileImageProviderReferences({
    max_assets:4,
    source_assets:[
      ref("IMAGE_STUDIO_SELECTED_HERO_FRAME","hero"),
      ref("IMAGE_STUDIO_CONTINUITY_REFERENCE","continuity"),
      ref("IMAGE_STUDIO_PERFORMANCE_REFERENCE","performance"),
      ref("IMAGE_STUDIO_CONTACT_DETAIL_REFERENCE","contact"),
      ref("IMAGE_STUDIO_CHARACTER_FRONT","cf"),
      ref("IMAGE_STUDIO_THREAT_FRONT","tf"),
      ref("IMAGE_STUDIO_MATERIAL_TRUTH_WET_METAL","metal"),
    ],
  });
  assert.equal(result.provider_transport_safe,false);
  assert.ok(result.missing_mandatory_groups.length>0);
});

test("crowded closing-frame authority keeps every required category inside ten Image Studio references",()=>{
  const source=[
    ref("IMAGE_STUDIO_SELECTED_HERO_FRAME","hero"),
    ref("IMAGE_STUDIO_CONTINUITY_REFERENCE","continuity"),
    ref("IMAGE_STUDIO_PERFORMANCE_REFERENCE","performance"),
    ref("IMAGE_STUDIO_CONTACT_DETAIL_REFERENCE","contact"),
    ref("IMAGE_STUDIO_CHARACTER_FRONT","cf"),
    ref("IMAGE_STUDIO_CHARACTER_LEFT_THREE_QUARTER","cl"),
    ref("IMAGE_STUDIO_THREAT_FRONT","tf"),
    ref("IMAGE_STUDIO_THREAT_LEFT_THREE_QUARTER","tl"),
    ref("CLOSING_KEYFRAME_REFERENCE","endpoint1"),
    ref("CLOSING_KEYFRAME_REFERENCE","endpoint2"),
    ref("CLOSING_KEYFRAME_REFERENCE","endpoint3"),
    ref("IMAGE_STUDIO_MATERIAL_TRUTH_WET_METAL","metal"),
    ref("IMAGE_STUDIO_MATERIAL_TRUTH_GROUND","ground"),
  ];
  const result=compileImageProviderReferences({
    task:{input:{requirements:{subject:"runner hunted by drone in rain",action:"runs across wet ground"}}},
    source_assets:source,
  });
  assert.equal(result.compiled_asset_count,10);
  assert.equal(result.provider_transport_safe,true);
  assert.deepEqual(result.missing_mandatory_groups,[]);
  const roles=result.source_assets.map(item=>item.role);
  assert.ok(roles.some(role=>role.startsWith("IMAGE_STUDIO_CHARACTER_")));
  assert.ok(roles.some(role=>role.startsWith("IMAGE_STUDIO_THREAT_")));
  assert.ok(roles.some(role=>role.startsWith("IMAGE_STUDIO_MATERIAL_TRUTH_")));
  assert.ok(roles.includes("CLOSING_KEYFRAME_REFERENCE"));
});

test("native video control preserves mandatory Image Studio authority ahead of optional keyframes",()=>{
  const imageRefs=[
    ref("IMAGE_STUDIO_SELECTED_HERO_FRAME","hero"),
    ref("IMAGE_STUDIO_CONTINUITY_REFERENCE","continuity"),
    ref("IMAGE_STUDIO_PERFORMANCE_REFERENCE","performance"),
    ref("IMAGE_STUDIO_CONTACT_DETAIL_REFERENCE","contact"),
    ref("IMAGE_STUDIO_CHARACTER_FRONT","character"),
    ref("IMAGE_STUDIO_THREAT_FRONT","threat"),
    ref("IMAGE_STUDIO_MATERIAL_TRUTH_WET_METAL","metal"),
  ];
  const manifest=compileImageProviderReferences({source_assets:imageRefs});
  assert.equal(manifest.provider_transport_safe,true);
  const output=applyCreativeVideoNativeControls({
    source_assets:manifest.source_assets,
    image_provider_reference_manifest:manifest,
    shot_bible:{
      contract:"CREATIVE_SHOT_BIBLE_V1",
      frame_plan:{
        opening_frame:"storage://frame/open",
        closing_frame:"storage://frame/close",
        keyframes:Array.from({length:6},(_,index)=>({
          reference:"storage://frame/key-"+index,
          frame_fraction:(index+1)/7,
        })),
      },
      output:{duration_seconds:5,frame_rate:24,aspect_ratio:"16:9"},
    },
  });
  const transported=new Set(output.source_assets.map(item=>item.url||item.asset_id));
  for(const mandatory of manifest.source_assets.filter(item=>
    manifest.mandatory_roles.some(role=>
      item.role===role || item.role_aliases?.includes(role)
    )
  )){
    assert.ok(transported.has(mandatory.url));
  }
  assert.equal(
    output.metadata.creative_video_native_control.missing_mandatory_image_authority_count,
    0,
  );
  assert.ok(output.source_assets.length<=12);
});
