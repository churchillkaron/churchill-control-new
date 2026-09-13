import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { classifyMusicRepair } from "../lib/creative/music/runtime/CreativeMusicRepairContractRuntime.js";

test("technical Music Dailies failures route to local finishing correction", () => {
  const result = classifyMusicRepair({ dailies: {
    report: { failures: ["MUSIC_DAILIES_REJECTED:TECHNICAL"] },
    repair_brief: { repairs: [{ family: "TECHNICAL", instruction: "Correct loudness and true peak." }] },
  } });
  assert.equal(result.route, "LOCAL_FINISHING_REPAIR");
  assert.equal(result.zero_cost_local_repair_allowed, true);
});

test("musical failures require governed surgical correction", () => {
  const result = classifyMusicRepair({ dailies: {
    report: { failures: ["MUSIC_DAILIES_REJECTED:MUSICALITY"] },
    repair_brief: { repairs: [{ family: "MUSICALITY", instruction: "Repair the weak motif development." }] },
  } });
  assert.equal(result.route, "SURGICAL_MUSICAL_REPAIR");
  assert.equal(result.paid_generation_repair_requires_authority, true);
  assert.equal(result.preserve_approved_direction, true);
});

test("world-class execution connects Dailies to final tribunal", () => {
  const source = fs.readFileSync(new URL("../lib/creative/music/runtime/CreativeMusicWorldClassExecutionRuntime.js", import.meta.url), "utf8");
  assert.match(source, /runMusicDailiesListening/);
  assert.match(source, /runMusicFinalTribunal/);
  assert.match(source, /repair: automaticRepair \|\| tribunal\?\.repair/);
});
