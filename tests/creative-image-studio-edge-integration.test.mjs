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


test("matte choke shrinks alpha while expansion grows it",()=>{
  const raw=Buffer.from([
    0,0,0,0, 100,100,100,255, 0,0,0,0,
  ]);
  const choked=applyImageStudioEdgeIntegration(raw,3,1,4,{edge_integration:{matte_choke_px:1}});
  const expanded=applyImageStudioEdgeIntegration(raw,3,1,4,{edge_integration:{matte_choke_px:-1}});
  assert.equal(choked.bytes[7],0);
  assert.equal(expanded.bytes[3],255);
  assert.equal(expanded.bytes[11],255);
});

test("edge morphology uses separable linear-time passes for large masters",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioEdgeIntegrationRuntime.js","utf8");
  assert.match(source,/separableAlpha/);
  assert.match(source,/extremaLine/);
  assert.match(source,/blurLine/);
});

test("matte expansion propagates interior RGB into newly revealed alpha",()=>{
  const raw=Buffer.from([
    0,0,0,0, 210,80,40,255, 0,0,0,0,
  ]);
  const out=applyImageStudioEdgeIntegration(raw,3,1,4,{edge_integration:{matte_choke_px:-1}});
  assert.deepEqual([...out.bytes.slice(0,3)],[210,80,40]);
  assert.deepEqual([...out.bytes.slice(8,11)],[210,80,40]);
  assert.equal(out.propagated_pixel_count,2);
  assert.equal(out.edge_color_propagation,true);
});

test("edge softening does not introduce black RGB under new translucent pixels",()=>{
  const raw=Buffer.from([
    180,120,60,255, 0,0,0,0,
  ]);
  const out=applyImageStudioEdgeIntegration(raw,2,1,4,{edge_integration:{edge_soften_px:1}});
  assert.ok(out.bytes[7]>0&&out.bytes[7]<255);
  assert.deepEqual([...out.bytes.slice(4,7)],[180,120,60]);
  assert.equal(out.propagated_pixel_count,1);
});

test("edge color propagation never paints pixels that remain fully transparent",()=>{
  const raw=Buffer.from([
    200,50,20,255, 0,0,0,0, 7,8,9,0,
  ]);
  const out=applyImageStudioEdgeIntegration(raw,3,1,4,{edge_integration:{edge_soften_px:1}});
  assert.deepEqual([...out.bytes.slice(8,12)],[7,8,9,0]);
});

test("edge color propagation uses linear-time flood storage instead of radius-squared sampling",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioEdgeIntegrationRuntime.js","utf8");
  assert.match(source,/new Int32Array\(pixelCount\)/);
  assert.match(source,/while\(head<tail\)/);
  assert.match(source,/propagated_pixel_count/);
});

test("decontamination prefers the nearest equally opaque interior color",()=>{
  const raw=Buffer.from([
    240,30,30,255,
    0,0,0,0,
    20,220,20,100,
    30,30,240,255,
    0,0,0,0,
  ]);
  const out=applyImageStudioEdgeIntegration(raw,5,1,4,{edge_integration:{decontaminate_strength:1}});
  const edge=[...out.bytes.slice(8,11)];
  assert.ok(edge[2]>edge[0],`expected nearer blue interior to dominate, got ${edge.join(",")}`);
});
