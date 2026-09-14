import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { evaluateMusicDailies } from "../lib/creative/music/runtime/CreativeMusicCreativeDevelopmentRuntime.js";
import { buildMusicDailiesRepairBrief } from "../lib/creative/music/runtime/CreativeMusicDailiesContractRuntime.js";

const intended = {
  emotional_arc: "quiet to powerful", arrangement_arc: "sparse to wide",
  motif_and_hook_system: "three-note motif", performance_direction: { feel: "human" },
  sonic_identity: "organic futuristic", dynamic_arc: ["low", "high"],
};
const rendered = { ...intended };
const families = ["MUSICALITY", "PERFORMANCE", "SONIC_IDENTITY", "TECHNICAL", "TRANSLATION", "INTENT_FIDELITY"];

test("Music Dailies approve only complete 90+ independent reviews", () => {
  const reviews = families.map((family) => ({ family, score: 94, passed: true, evidence: [`${family} evidence`] }));
  const report = evaluateMusicDailies({ intended, rendered, reviews });
  assert.equal(report.passed, true);
  assert.equal(report.status, "APPROVED_FOR_MIX");
});

test("Music Dailies create surgical repair brief without discarding approved direction", () => {
  const reviews = families.map((family) => ({
    family, score: family === "PERFORMANCE" ? 84 : 94,
    passed: family !== "PERFORMANCE", evidence: [`${family} evidence`],
    repair: family === "PERFORMANCE" ? ["Repair timing in the second chorus only."] : [],
    regions: family === "PERFORMANCE" ? [{ start_seconds: 42, end_seconds: 58, evidence: "Second chorus loses timing and energy." }] : [],
  }));
  const report = evaluateMusicDailies({ intended, rendered, reviews });
  const brief = buildMusicDailiesRepairBrief({ report, reviews, binding: { direction_hash: "dir", preproduction_hash: "pre" } });
  assert.equal(report.passed, false);
  assert.equal(brief.preserve_approved_direction, true);
  assert.equal(brief.do_not_regenerate_unfailed_dimensions, true);
  assert.equal(brief.repairs.length, 1);
  assert.equal(brief.regions.length, 1);
  assert.equal(brief.regions[0].start_seconds, 42);
  assert.equal(brief.exact_region_evidence_required_for_musical_repair, true);
});

test("Business Partner catalog exposes Music Dailies review", async () => {
  const source = await readFile(new URL("../lib/creative/runtime/CreativeRuntime.js", import.meta.url), "utf8");
  assert.match(source, /reviewWorldClassDailies/);
  assert.match(source, /reviewWorldClassMusicDailies/);
});

test("world-class execution automatically runs Music Dailies after mastering", async () => {
  const executionSource = await readFile(new URL("../lib/creative/music/runtime/CreativeMusicWorldClassExecutionRuntime.js", import.meta.url), "utf8");
  const finishingSource = await readFile(new URL("../lib/creative/music/runtime/CreativeMusicFinishingRuntime.js", import.meta.url), "utf8");
  assert.match(executionSource, /runMusicDailiesListening/);
  assert.match(executionSource, /dailies: dailies/);
  assert.match(finishingSource, /master_report: masterReport/);
});

test("Music Dailies persist exact failed time regions for surgical repair", async () => {
  const listeningSource = await readFile(new URL("../lib/creative/music/runtime/CreativeMusicDailiesListeningRuntime.js", import.meta.url), "utf8");
  const analysisSource = await readFile(new URL("../lib/creative/music/runtime/CreativeMusicMusicalAnalysisRuntime.js", import.meta.url), "utf8");
  assert.match(listeningSource, /regions:/);
  assert.match(listeningSource, /dynamic_sections/);
  assert.match(analysisSource, /AVANTIQO_MUSIC_DYNAMIC_SECTION_ANALYSIS_V1/);
  assert.match(analysisSource, /section_analysis_ready: true/);
});

test("Business Partner exposes fail-closed surgical Music repair planning", async () => {
  const runtimeSource = await readFile(new URL("../lib/creative/runtime/CreativeRuntime.js", import.meta.url), "utf8");
  const repairSource = await readFile(new URL("../lib/creative/music/runtime/CreativeMusicSurgicalRepairRuntime.js", import.meta.url), "utf8");
  assert.match(runtimeSource, /planWorldClassSurgicalRepair/);
  assert.match(repairSource, /EXACT_FAILED_REGION_REQUIRED/);
  assert.match(repairSource, /AI_AUDIO_EDIT_/);
  assert.match(repairSource, /preserve_outside_region: true/);
  assert.match(repairSource, /rerun_dailies_after_execution: true/);
});


test("Music Dailies requires independent translation review", () => {
  const reviews = families.filter((family) => family !== "TRANSLATION").map((family) => ({ family, score: 94, passed: true, evidence: [`${family} evidence`] }));
  const report = evaluateMusicDailies({ intended, rendered, reviews });
  assert.equal(report.passed, false);
  assert.ok(report.failures.includes("MUSIC_DAILIES_REVIEW_REQUIRED:TRANSLATION"));
});
