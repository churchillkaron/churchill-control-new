import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("text export composites inside the sorted layer loop instead of forcing text to top",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  const loop=source.indexOf("for (const layer of visible)");
  const textBranch=source.indexOf('if (layer.layer_type === "TEXT")',loop);
  const imageComposite=source.indexOf("const subjectComposite=",textBranch);
  const baseComposite=source.indexOf("const base = sharp",imageComposite);
  assert.ok(loop>=0&&textBranch>loop&&imageComposite>textBranch&&baseComposite>imageComposite);
  assert.doesNotMatch(source,/const text = \[\]/);
  assert.doesNotMatch(source,/text\.join\(""\)/);
});

test("text export uses the same non-destructive effects and blend contract as image layers",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  const branch=source.slice(source.indexOf('if (layer.layer_type === "TEXT")'),source.indexOf('if (layer.layer_type === "ADJUSTMENT"'));
  assert.match(branch,/applyImageStudioEffects\(preparedText, layer\.style \|\| \{\}\)/);
  assert.match(branch,/blend: effectedText\.effects\.sharp_blend_mode/);
  assert.match(branch,/renderFontFaces\(fontBindings\)/);
  assert.match(branch,/textSvg\(layer, fontBindings\)/);
});

test("text export dimensions are resolved before layer compositing so text can rasterize in place",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  const width=source.indexOf("const width = Math.round(num(artboard.width");
  const loop=source.indexOf("for (const layer of visible)");
  assert.ok(width>=0&&width<loop);
});
