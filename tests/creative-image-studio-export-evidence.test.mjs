import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Image Studio persists deterministic renderer evidence with the canonical master asset",()=>{
  const source=fs.readFileSync("app/api/workspace/creative/image-studio/export/route.js","utf8");
  assert.match(source,/function imageStudioRenderEvidence/);
  assert.match(source,/source_orientation:rendered\.source_orientation/);
  assert.match(source,/color_management:rendered\.color_management/);
  assert.match(source,/typography:rendered\.typography/);
  assert.match(source,/masks:rendered\.masks/);
  assert.match(source,/render_evidence: renderEvidence/);
});

test("Image Studio export record keeps queryable format color space and density plus full render proof",()=>{
  const source=fs.readFileSync("app/api/workspace/creative/image-studio/export/route.js","utf8");
  assert.match(source,/format:rendered\.format/);
  assert.match(source,/color_space:rendered\.color_management\?\.output_color_space/);
  assert.match(source,/density_dpi:rendered\.color_management\?\.output_density_dpi/);
  const occurrences=(source.match(/render_evidence: renderEvidence/g)||[]).length;
  assert.ok(occurrences>=2);
});

test("render evidence selection never persists the master byte buffer",()=>{
  const source=fs.readFileSync("app/api/workspace/creative/image-studio/export/route.js","utf8");
  const start=source.indexOf("function imageStudioRenderEvidence");
  const end=source.indexOf("async function persistMaster",start);
  const helper=source.slice(start,end);
  assert.doesNotMatch(helper,/rendered\.bytes/);
});
