import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CREATIVE_IMAGE_STUDIO_SOURCE_MATERIALIZATION_CONTRACT,
  resolveImageStudioSourceUrl,
} from "../lib/creative/stills/runtime/CreativeImageStudioSourceMaterializationRuntime.js";

test("source materialization preserves governed contract and http sources",async()=>{
  assert.equal(CREATIVE_IMAGE_STUDIO_SOURCE_MATERIALIZATION_CONTRACT,"CREATIVE_IMAGE_STUDIO_SOURCE_MATERIALIZATION_V1");
  assert.equal(await resolveImageStudioSourceUrl({value:"https://cdn.example/source.png"}),"https://cdn.example/source.png");
  assert.equal(await resolveImageStudioSourceUrl({value:"http://cdn.example/source.png"}),"http://cdn.example/source.png");
});

test("storage source is signed in exact organization scope before render",async()=>{
  let call=null;
  const signed=await resolveImageStudioSourceUrl({
    organization_id:"org-1",
    value:"storage://creative-assets/org-1/project/source.png",
    signer:async(args)=>{call=args;return "https://signed.example/source.png?token=1";},
  });
  assert.equal(signed,"https://signed.example/source.png?token=1");
  assert.deepEqual(call,{organization_id:"org-1",reference:"storage://creative-assets/org-1/project/source.png",expires_in:900});
});

test("storage source fails closed without organization scope or valid signed url",async()=>{
  await assert.rejects(()=>resolveImageStudioSourceUrl({value:"storage://creative-assets/org-1/source.png",signer:async()=> "https://signed.example/x"}),/SOURCE_ORGANIZATION_REQUIRED/);
  await assert.rejects(()=>resolveImageStudioSourceUrl({organization_id:"org-1",value:"storage://creative-assets/org-1/source.png",signer:async()=> "storage://still-private"}),/SOURCE_SIGNED_URL_REQUIRED/);
});

test("unsupported source schemes remain blocked",async()=>{
  for(const value of ["file:///tmp/source.png","data:image/png;base64,abc","javascript:alert(1)",""]){
    await assert.rejects(()=>resolveImageStudioSourceUrl({organization_id:"org-1",value}),/SOURCE_URL_UNSUPPORTED/);
  }
});

test("deterministic export resolves asset reference before network fetch",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(source,/resolveImageStudioSourceUrl\(\{organization_id,value:sourceReference\}\)/);
  assert.match(source,/const input = await fetchImage\(url\)/);
});
