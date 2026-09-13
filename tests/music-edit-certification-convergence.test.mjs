import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const enginePath = new URL("../lib/creative/runtime/engines/MusicEngine.js", import.meta.url);
const studioPath = new URL("../lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime.js", import.meta.url);
const readinessPath = new URL("../app/api/creative/music/readiness/route.js", import.meta.url);

test("Music edit certification has a real configuration path instead of a permanent benchmark dead-end", () => {
  const engine = fs.readFileSync(enginePath, "utf8");
  assert.match(engine, /AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES/);
  assert.match(engine, /resolvedCertification\(ADVANCED_CAPABILITIES\.edit\)/);
  assert.match(engine, /configuredCertifiedAudioCapabilities\(\)\.has\(contract\.capability\)/);
});

test("World-class Music Studio reflects certified audio edit capability dynamically", () => {
  const studio = fs.readFileSync(studioPath, "utf8");
  assert.match(studio, /configuredAudioCertificationStatus/);
  assert.match(studio, /AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES/);
});

test("Music readiness reports edit benchmark gating from real provider pricing state", () => {
  const readiness = fs.readFileSync(readinessPath, "utf8");
  assert.match(readiness, /ownedCapability\(rows, "ai\.audio\.edit"\)/);
  assert.match(readiness, /edit\.ready \? "CERTIFIED" : "BENCHMARK_REQUIRED"/);
  assert.doesNotMatch(readiness, /edit: \{ capability: "ai\.audio\.edit", ready: false, status: "PLANNING_ONLY" \}/);
});
