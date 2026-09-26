import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeImageStudioEdgeIntegration, applyImageStudioEdgeIntegration } from "../lib/creative/stills/runtime/CreativeImageStudioEdgeIntegrationRuntime.js";

test("edge integration settings are bounded and explicit",()=>{
  const e=normalizeImageStudioEdgeIntegration({edge_integration:{matte_choke_px:99,edge_soften_px:99,despill_mode:"green",despill_strength:2,decontaminate_strength:-1}});
  assert.equal(e.matte_choke_px,8);
  assert.equal(e.edge_soften_px,12);
  assert.equal(e.despill_mode,"GREEN");
  assert.equal(e.despill_strength,1);
  assert.equal(e.decontaminate_strength,0);
});

test("green despill reduces contaminated semi-transparent edge without changing alpha",()=>{
  const raw=Buffer.from([120,240,120,120]);
  const out=applyImageStudioEdgeIntegration(raw,1,1,4,{edge_integration:{despill_mode:"GREEN",despill_strength:1}});
  assert.ok(out.bytes[1]<240);
  assert.equal(out.bytes[3],120);
});

test("edge decontamination borrows color from strongest interior neighbor",()=>{
  const raw=Buffer.from([
    220,10,10,255,
    10,220,10,100,
  ]);
  const out=applyImageStudioEdgeIntegration(raw,2,1,4,{edge_integration:{decontaminate_strength:1}});
  assert.ok(out.bytes[4]>10);
  assert.ok(out.bytes[5]<220);
  assert.equal(out.bytes[7],100);
});

test("export applies edge integration after masking and before grade",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(source,/applyImageStudioEdgeIntegration/);
  assert.match(source,/CREATIVE_IMAGE_STUDIO_EDGE_INTEGRATION_V1/);
});

test("inspector exposes matte choke soften despill and decontamination controls",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  for(const label of ["Matte choke px","Edge soften px","Despill strength %","Decontaminate %"])assert.match(source,new RegExp(label));
  assert.match(source,/Despill mode/);
});
