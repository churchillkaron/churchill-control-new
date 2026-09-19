import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const compiler=fs.readFileSync("lib/creative/image/runtime/CreativeImageProviderReferenceCompilerRuntime.js","utf8");
const native=fs.readFileSync("lib/creative/video/runtime/CreativeVideoNativeControlRuntime.js","utf8");
const gate=fs.readFileSync("lib/creative/production-graph/runtime/CreativeVisualProductionExecutionGate.js","utf8");

test("Image Studio compiles provider reference budget",()=>{ assert.match(compiler,/CREATIVE_IMAGE_PROVIDER_REFERENCE_LIMIT = 10/); assert.match(compiler,/PRIMARY_HERO/); assert.match(compiler,/CONTINUITY/); assert.match(compiler,/PERFORMANCE/); assert.match(compiler,/PHYSICAL_CONTACT/); assert.match(compiler,/provider_transport_safe/); });
test("camera-aware compiler chooses relevant identity views",()=>{ assert.match(compiler,/IMAGE_STUDIO_CHARACTER/); assert.match(compiler,/IMAGE_STUDIO_THREAT/); assert.match(compiler,/rear|behind|back/); assert.match(compiler,/profile|side|lateral|oblique/); });
test("native video control enforces owned 12-reference ceiling",()=>{ assert.match(native,/providerReferencePriority/); assert.match(native,/unique\.slice\(0, 12\)/); assert.match(native,/image_reference_transport_limit: imageReferenceTransportBounded \? 12/); assert.match(native,/image_reference_transport_safe/); });
test("visual gate binds provider reference manifest",()=>{ assert.match(gate,/CreativeImageProviderReferenceCompilerRuntime/); assert.match(gate,/image_provider_reference_manifest/); assert.match(gate,/IMAGE_STUDIO_PROVIDER_REFERENCE_TRANSPORT_UNSAFE/); });
