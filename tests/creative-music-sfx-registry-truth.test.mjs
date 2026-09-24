import test from "node:test";import assert from "node:assert/strict";import fs from "node:fs";
const registry=fs.readFileSync("lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime.js","utf8");
const registration=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js","utf8");
const local=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoSfxLocalQueueProvider.js","utf8");
const runner=fs.readFileSync("scripts/local-node/avantiqo-node01-sfx-runner.py","utf8");
test("SFX registry states exact certification gate rather than vague readiness dependency",()=>{assert.match(registry,/\["sfx"[\s\S]*"ai\.sfx\.generate", "CERTIFICATION_GATED"\]/);assert.doesNotMatch(registry,/\["sfx"[\s\S]*READINESS_DEPENDENT/);});
test("owned SFX runtime is implemented on Node01 and production routing stays certification bound",()=>{assert.match(registration,/OpenMOSS-Team\/MOSS-SoundEffect-v2\.0/);assert.match(registration,/implemented_capabilities:LOCAL_CAPABILITIES/);assert.match(registration,/local_only_execution:true/);assert.match(local,/CAPABILITY = "ai\.sfx\.generate"/);assert.match(local,/OpenMOSS-Team\/MOSS-SoundEffect-v2\.0/);assert.match(runner,/OPENMOSS_GGML_CPU_V1/);});
