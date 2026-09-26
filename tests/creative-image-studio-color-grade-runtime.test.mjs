import test from "node:test";
import assert from "node:assert/strict";
import { normalizeImageStudioColorGrade, imageStudioColorGradeIsIdentity, applyImageStudioColorGrade } from "../lib/creative/stills/runtime/CreativeImageStudioColorGradeRuntime.js";

test("color grade normalizes balance mixer and selective ranges with identity defaults",()=>{
  const grade=normalizeImageStudioColorGrade({});
  assert.equal(grade.channel_mixer.RED.r,100);
  assert.equal(grade.channel_mixer.GREEN.g,100);
  assert.equal(grade.channel_mixer.BLUE.b,100);
  assert.equal(grade.selective_color.REDS.cyan,0);
  assert.equal(imageStudioColorGradeIsIdentity(grade),true);
});

test("color balance can target shadows without changing alpha",()=>{
  const raw=Buffer.from([30,30,30,77,220,220,220,88]);
  const out=applyImageStudioColorGrade(raw,2,1,4,{color_balance:{SHADOWS:{cyan_red:100}}});
  assert.ok(out.bytes[0]>30);
  assert.equal(out.bytes[3],77);
  assert.equal(out.bytes[7],88);
});

test("channel mixer supports governed cross-channel remapping",()=>{
  const raw=Buffer.from([200,20,10,255]);
  const out=applyImageStudioColorGrade(raw,1,1,4,{channel_mixer:{RED:{r:0,g:100,b:0},preserve_luminosity:false}});
  assert.equal(out.bytes[0],20);
});

test("selective color targets hue family rather than all pixels equally",()=>{
  const raw=Buffer.from([255,0,0,255,0,255,0,255]);
  const out=applyImageStudioColorGrade(raw,2,1,4,{selective_color:{REDS:{cyan:100}}});
  assert.ok(out.bytes[0]<255);
  assert.equal(out.bytes[4],0);
  assert.equal(out.bytes[5],255);
});


test("Image Studio exposes professional color balance mixer and selective color controls", async()=>{
  const fs=await import("node:fs");
  const editor=fs.readFileSync("components/creative/specialist/ImageStudioColorGradeEditor.jsx","utf8");
  const inspector=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  assert.match(editor,/Professional color grade/);
  assert.match(editor,/Balance/);
  assert.match(editor,/Mixer/);
  assert.match(editor,/Selective/);
  assert.match(editor,/Cyan ↔ Red/);
  assert.match(editor,/Preserve luminosity/);
  assert.match(editor,/WHITES/);
  assert.match(editor,/BLACKS/);
  assert.match(inspector,/ImageStudioColorGradeEditor/);
});

test("deterministic export declares and activates Color Grade V1", async()=>{
  const fs=await import("node:fs");
  const exporter=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  const adjustment=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioAdjustmentRuntime.js","utf8");
  assert.match(exporter,/imageStudioColorGradeIsIdentity/);
  assert.match(exporter,/CREATIVE_IMAGE_STUDIO_COLOR_GRADE_V1/);
  assert.match(exporter,/color_balance: true/);
  assert.match(exporter,/channel_mixer: true/);
  assert.match(exporter,/selective_color: true/);
  assert.match(adjustment,/applyImageStudioColorGrade/);
  assert.match(adjustment,/CREATIVE_IMAGE_STUDIO_ADJUSTMENT_V3/);
});
