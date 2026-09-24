import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const HASH="bf32e15105a09c0f7dddd2b67346146334d6f3ecb399ed7638eba2ab07cbf5f4";
const registration=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js","utf8");
const runner=fs.readFileSync("services/avantiqo-music-local/vocal_role_separator_runner.py","utf8");
const installer=fs.readFileSync("scripts/install-avantiqo-music-research-runtimes-node01.ps1","utf8");
const benchmark=fs.readFileSync("scripts/benchmark-avantiqo-music-vocal-role-node01.mjs","utf8");

test("KARA2 provenance pins exact upstream weight and MIT attribution end to end",()=>{
  for(const source of [registration,runner,installer,benchmark]) assert.match(source,new RegExp(HASH));
  assert.match(registration,/VOCAL_ROLE_SEPARATOR_MODEL_LICENSE = "MIT"/);
  assert.match(registration,/attribution_required:\s*true/);
  assert.match(runner,/STAGE2_LICENSE = "MIT"/);
  assert.match(installer,/kara2_model_license = 'MIT'/);
});

test("runtime refuses a non-pinned KARA2 file before separation",()=>{
  assert.match(runner,/sha256_file\(kara_model\)/);
  assert.match(runner,/KARA2_HASH_MISMATCH/);
  assert.match(installer,/VOCAL_ROLE_KARA2_HASH_MISMATCH/);
});

test("license closure does not promote quality certification",()=>{
  assert.match(registration,/production_routing_allowed:\s*false/);
  assert.match(runner,/human_listening_review_required.*True/s);
  assert.match(runner,/production_certified.*False/s);
  assert.match(benchmark,/human_review_status:"PENDING"/);
  assert.match(benchmark,/role_quality_certified:false/);
});
