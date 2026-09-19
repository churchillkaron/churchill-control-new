import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runAutomaticMusicRepair } from "../lib/creative/music/runtime/CreativeMusicAutomaticRepairRuntime.js";

test("automatic repair does nothing when Dailies already passed", async () => {
  const result = await runAutomaticMusicRepair({ dailies: { report: { passed: true } } });
  assert.equal(result.status, "NO_REPAIR_REQUIRED");
  assert.equal(result.attempts, 0);
});

test("musical failure never auto-spends on repair", async () => {
  const result = await runAutomaticMusicRepair({ dailies: {
    report: { passed: false, failures: ["MUSIC_DAILIES_REJECTED:MUSICALITY"] },
    repair_brief: { repairs: [{ family: "MUSICALITY", instruction: "Rewrite the melody" }] },
  }});
  assert.equal(result.status, "GOVERNED_SURGICAL_REPAIR_REQUIRED");
  assert.equal(result.classification.paid_generation_repair_requires_authority, true);
  assert.equal(result.release_ready, false);
});

test("world-class execution invokes automatic repair only after Dailies reject", () => {
  const source = fs.readFileSync(new URL("../lib/creative/music/runtime/CreativeMusicWorldClassExecutionRuntime.js", import.meta.url), "utf8");
  assert.match(source, /runAutomaticMusicRepair/);
  assert.match(source, /tribunal\?\.status === "DAILIES_REPAIR_REQUIRED"/);
  assert.match(source, /finalTribunal = automaticRepair\?\.tribunal \|\| tribunal/);
});
