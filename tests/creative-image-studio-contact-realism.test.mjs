import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeImageStudioContactRealism, applyImageStudioLightWrap, imageStudioShadowSpec } from "../lib/creative/stills/runtime/CreativeImageStudioContactRealismRuntime.js";

test("contact realism settings remain bounded for production masters",()=>{
  const s=normalizeImageStudioContactRealism({contact_realism:{light_wrap_strength:2,light_wrap_width_px:100,shadow_enabled:true,shadow_opacity:2,shadow_blur_px:500,shadow_offset_x:900,shadow_scale_y:0}});
  assert.equal(s.light_wrap_strength,1);
  assert.equal(s.light_wrap_width_px,32);
  assert.equal(s.shadow_opacity,1);
  assert.equal(s.shadow_blur_px,160);
  assert.equal(s.shadow_offset_x,500);
  assert.equal(s.shadow_scale_y,.03);
});

test("light wrap changes semi-transparent boundary color but preserves alpha",()=>{
  const raw=Buffer.from([
    40,40,40,255,
    40,40,40,120,
  ]);
  const out=applyImageStudioLightWrap(raw,2,1,4,{contact_realism:{light_wrap_strength:1,light_wrap_width_px:1,light_wrap_color:"#ffffff"}});
  assert.ok(out.bytes[4]>40);
  assert.equal(out.bytes[7],120);
});

test("ground shadow spec is explicit and deterministic",()=>{
  const shadow=imageStudioShadowSpec({contact_realism:{shadow_enabled:true,shadow_opacity:.4,shadow_blur_px:30,shadow_offset_x:12,shadow_offset_y:20,shadow_scale_y:.2,shadow_color:"#102030"}});
  assert.equal(shadow.enabled,true);
  assert.deepEqual(shadow.color,{r:16,g:32,b:48});
  assert.equal(shadow.scale_y,.2);
});

test("export integrates light wrap and ground shadow before subject composite",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(source,/applyImageStudioLightWrap/);
  assert.match(source,/imageStudioShadowSpec/);
  assert.match(source,/CREATIVE_IMAGE_STUDIO_CONTACT_REALISM_V1/);
  assert.match(source,/subjectComposite/);
  assert.match(source,/shadowComposite/);
});

test("inspector exposes contact realism controls",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  for(const label of ["Light wrap %","Wrap width px","Shadow opacity %","Shadow blur px","Shadow offset X","Shadow offset Y","Shadow vertical scale %"])assert.match(source,new RegExp(label));
  assert.match(source,/Ground shadow/);
});
