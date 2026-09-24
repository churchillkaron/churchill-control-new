import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const memory=fs.readFileSync("lib/creative/continuity/runtime/CreativeCinematicStateMemoryBootstrap.js","utf8");
const transport=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoCinematicStateMemoryBootstrap.js","utf8");
const local=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoLocalQueueProvider.js","utf8");

test("Cinema publishes only reviewed approved state into the continuity ledger",()=>{
  assert.match(memory,/CREATIVE_CINEMATIC_STATE_MEMORY_V1/);
  assert.match(memory,/CREATIVE_CINEMATIC_STATE_LEDGER_V1/);
  assert.match(memory,/reviewed_only:\s*true/);
  assert.match(memory,/failed_generation_excluded:\s*true/);
  assert.match(memory,/previous_authoritative_state_hash/);
  assert.match(memory,/chain_hash:\s*hash\(/);
});

test("later Cinema shots inherit bounded approved memory",()=>{
  assert.match(memory,/const MAX_RELEVANT_STATES = 3/);
  assert.match(memory,/approved_state_hash_history/);
  assert.match(memory,/do_not_rewrite_approved_neighbors:\s*true/);
});

test("reviewed state is transported into the active local video envelope",()=>{
  assert.match(transport,/AVANTIQO_CINEMATIC_STATE_MEMORY_TRANSPORT_V1/);
  assert.match(transport,/cinematic_state_memory_bound:\s*true/);
  assert.match(transport,/shot_specification: governedShotSpecification/);
  assert.match(local,/generation_envelope/);
  assert.match(local,/shot_bible/);
});
