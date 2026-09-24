import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProviderRegistration.js", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProvider.js", "utf8");

test("owned Image advertises only currently implemented local capabilities", () => {
  for (const capability of ["ai.image.generate", "ai.image.upscale", "ai.image.analyze", "document.ocr", "document.classify"]) {
    assert.match(registration, new RegExp(capability.replaceAll(".", "\\.")));
  }
  assert.match(registration, /IMPLEMENTED_CAPABILITIES = Object\.freeze\(\[/);
  assert.match(registration, /semantic_editing: false/);
  assert.match(registration, /owned_depth_estimation: false/);
  assert.match(registration, /owned_material_estimation: capabilities\.includes\("creative\.materials\.estimate"\)/);
  assert.match(registration, /owned_super_resolution: capabilities\.includes\("ai\.image\.upscale"\)/);
  assert.match(registration, /owned_visual_analysis: capabilities\.includes\("ai\.image\.analyze"\)/);
});

test("owned Image analysis is local structured document vision", () => {
  assert.match(provider, /\["ai\.image\.analyze", "document\.ocr", "document\.classify", "creative\.materials\.estimate"\]/);
  assert.match(provider, /AvantiqoDocumentVisionLocalQueueProvider/);
  assert.match(provider, /AVANTIQO_DOCUMENT_VISION_LOCAL_NODE_UNAVAILABLE/);
});
