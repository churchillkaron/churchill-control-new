import assert from "node:assert/strict";
import fs from "node:fs";

const camera = fs.readFileSync("lib/creative/director/runtime/CreativeCameraGrammarRuntime.js", "utf8");
const temporal = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");
const impact = fs.readFileSync("lib/creative/director/runtime/CreativeCinematicImpactRuntime.js", "utf8");

assert.match(camera, /"platform"/);
assert.match(camera, /"platform_motivation"/);
assert.match(camera, /CAMERA_PLATFORM_MOTIVATION_REQUIRED/);
assert.match(temporal, /Never default a sequence to one camera platform/);
assert.match(temporal, /Aerial is not synonymous with drone/);
assert.match(impact, /CAMERA_PLATFORM_DIVERSITY_TOO_LOW/);
assert.match(impact, /DOMINANT_CAMERA_PLATFORM_REPEATED_TOO_OFTEN/);
assert.match(impact, /DEFAULT_PUSH_ZOOM_LANGUAGE_OVERUSED/);
console.log("CREATIVE_CAMERA_PLATFORM_DIVERSITY_CONTRACT=PASS");
