import test from "node:test";import assert from "node:assert/strict";import fs from "node:fs";
const registry=fs.readFileSync("lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime.js","utf8");
const registration=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js","utf8");
const modal=fs.readFileSync("services/avantiqo-sfx-modal/modal_app.py","utf8");
const runner=fs.readFileSync("scripts/run-avantiqo-music-sfx-certification-matrix-local.mjs","utf8");
test("SFX registry states exact certification gate rather than vague readiness dependency",()=>{assert.match(registry,/\["sfx"[\s\S]*"ai\.sfx\.generate", "CERTIFICATION_GATED"\]/);assert.doesNotMatch(registry,/\["sfx"[\s\S]*READINESS_DEPENDENT/);});
test("owned SFX runtime is implemented and production routing is certification-evidence bound",()=>{assert.match(registration,/OpenMOSS-Team\/MOSS-SoundEffect-v2\.0/);assert.match(registration,/sfxCertificationEvidenceFingerprint/);assert.match(registration,/production_routing_allowed: sfxRuntimeAvailable/);assert.match(modal,/MOSS-SoundEffect-v2\.0|MOSS_SOUNDEFFECT/);assert.match(runner,/CERTIFICATION_MATRIX/);});
