import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const authority=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetAuthorityRuntime.js","utf8");
const graph=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetGraphRuntime.js","utf8");
const perceptual=fs.readFileSync("lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate.js","utf8");
const pack=fs.readFileSync("lib/creative/image/runtime/CreativeImageProductionPackageRuntime.js","utf8");
const gate=fs.readFileSync("lib/creative/production-graph/runtime/CreativeVisualProductionExecutionGate.js","utf8");

test("Image Studio creates performance and contact truth references",()=>{ assert.match(authority,/PERFORMANCE_REFERENCE/); assert.match(authority,/CONTACT_DETAIL_REFERENCE/); assert.match(graph,/PERFORMANCE_REFERENCE/); assert.match(graph,/CONTACT_DETAIL_REFERENCE/); assert.match(graph,/contactDetailExpected/); });
test("performance contact references have hard perceptual review",()=>{ assert.match(perceptual,/PERFORMANCE_REFERENCE: verify exact character identity/); assert.match(perceptual,/Reject stock fear faces/); assert.match(perceptual,/CONTACT_DETAIL_REFERENCE: verify physically credible contact/); assert.match(perceptual,/Reject floating contact/); });
test("human action production package requires performance truth",()=>{ assert.match(pack,/PRODUCTION_PACKAGE_PERFORMANCE_REFERENCE_REQUIRED/); assert.match(pack,/PRODUCTION_PACKAGE_CONTACT_REFERENCE_REQUIRED/); assert.match(pack,/performance_reference/); assert.match(pack,/contact_detail_reference/); });
test("video provider receives performance contact reference media",()=>{ assert.match(gate,/IMAGE_STUDIO_PERFORMANCE_REFERENCE/); assert.match(gate,/IMAGE_STUDIO_CONTACT_DETAIL_REFERENCE/); });
