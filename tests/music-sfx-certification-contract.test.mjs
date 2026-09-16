import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const run=await readFile("scripts/run-avantiqo-music-sfx-certification-local.mjs","utf8");
const review=await readFile("scripts/prepare-avantiqo-music-sfx-human-review.mjs","utf8");
test("SFX certification is single-job Modal direct and spend bounded",()=>{
  assert.match(run,/avantiqo-sfx-owned/); assert.match(run,/FUNCTION_NAME="generate"/); assert.match(run,/provider_jobs_submitted:1/);
  assert.match(run,/SPEND_CEILING_THB_REQUIRED/); assert.match(run,/SPEND_CEILING_WATCHDOG/); assert.match(run,/production_routing_allowed:false/);
});
test("SFX certification uses controlled fixture and exact owned model",()=>{
  assert.match(run,/harsh digital bedside alarm clock/); assert.match(run,/OpenMOSS-Team\/MOSS-SoundEffect-v2\.0/); assert.match(run,/avantiqo-sfx-v1/);
});
test("SFX human review requires 92 average quality evidence",()=>{
  assert.match(review,/minimum_average_score:92/); assert.match(review,/automatic_human_approval_forbidden:true/); assert.match(review,/prompt_fidelity/); assert.match(review,/commercial_music_studio_readiness/);
});
