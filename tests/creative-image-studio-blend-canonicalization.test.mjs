import test from "node:test";
import assert from "node:assert/strict";
import { IMAGE_STUDIO_BLEND_MODES, normalizeImageStudioEffects } from "../lib/creative/stills/runtime/CreativeImageStudioEffectsRuntime.js";

test("supported blend modes remain canonical across preview and export",()=>{
  for(const mode of IMAGE_STUDIO_BLEND_MODES){
    const normalized=normalizeImageStudioEffects({blend_mode:mode});
    assert.equal(normalized.blend_mode,mode);
    assert.ok(normalized.css_blend_mode);
    assert.ok(normalized.sharp_blend_mode);
  }
});

test("unknown persisted blend mode fails safe to canonical normal",()=>{
  const normalized=normalizeImageStudioEffects({blend_mode:"VIVID_LIGHT"});
  assert.equal(normalized.blend_mode,"normal");
  assert.equal(normalized.css_blend_mode,"normal");
  assert.equal(normalized.sharp_blend_mode,"over");
});

test("blend normalization is case-insensitive but returns canonical lowercase state",()=>{
  const normalized=normalizeImageStudioEffects({blend_mode:"MuLtIpLy"});
  assert.equal(normalized.blend_mode,"multiply");
  assert.equal(normalized.css_blend_mode,"multiply");
  assert.equal(normalized.sharp_blend_mode,"multiply");
});
