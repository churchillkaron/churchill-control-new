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
const rendered = { musical_analysis: {}, melodic_intelligence: {}, form_intelligence: {}, rhythm_intelligence: {}, dynamic_sections: [], master_report: {}, perceptual_translation: {} };
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
  assert.match(executionSource, /dailies,/);
  assert.match(finishingSource, /master_report: masterReport/);
});

test("Music Dailies runs independent reviewer families concurrently", async () => {
  const listeningSource = await readFile(new URL("../lib/creative/music/runtime/CreativeMusicDailiesListeningRuntime.js", import.meta.url), "utf8");
  assert.match(listeningSource, /const reviews = await Promise\.all/);
  assert.match(listeningSource, /REVIEWERS\.map/);
  assert.doesNotMatch(listeningSource, /for \(const \[family, mandate\] of REVIEWERS\)/);
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


test("Music Dailies keeps approved intent separate from rendered evidence", async () => {
  const source = await readFile(new URL("../lib/creative/music/runtime/CreativeMusicDailiesListeningRuntime.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /music_emotional_arc\) \|\| text\(binding\.direction_contract\?\.emotional_arc\)/);
  assert.match(source, /do_not_treat_approved_intent_as_rendered_fact: true/);
  assert.match(source, /do_not_require_non_audio_gates: family === "INTENT_FIDELITY"/);
});


test("Music Dailies require measured rendered evidence rather than copied intent fields", () => {
  const reviews = families.map((family) => ({ family, score: 94, passed: true, evidence: [`${family} evidence`] }));
  const copiedIntentOnly = { ...intended };
  const report = evaluateMusicDailies({ intended, rendered: copiedIntentOnly, reviews });
  assert.equal(report.passed, false);
  assert.ok(report.failures.includes("MUSIC_DAILIES_RENDERED_EVIDENCE_REQUIRED:musical_analysis"));
  assert.ok(!report.failures.includes("MUSIC_DAILIES_RENDERED_EVIDENCE_REQUIRED:emotional_arc"));
});

test("Music Dailies reviewer input hides unaccepted tempo candidates from factual evidence", async () => {
  const source = await readFile(new URL("../lib/creative/music/runtime/CreativeMusicDailiesListeningRuntime.js", import.meta.url), "utf8");
  assert.match(source, /analysis\.tempo\?\.accepted === true/);
  assert.match(source, /never_fail_on_unaccepted_tempo_or_key_candidates: true/);
});


test("Music Dailies fail closed when a reviewer reasoning payload is invalid", async () => {
  const source = await readFile(new URL("../lib/creative/music/runtime/CreativeMusicDailiesListeningRuntime.js", import.meta.url), "utf8");
  assert.match(source, /Reviewer execution failed closed/);
  assert.match(source, /MUSIC_DAILIES_REVIEWER_EXECUTION_FAILED/);
  assert.match(source, /do not alter or regenerate the music based on an invalid reviewer payload/);
});


test("Music Dailies treats standalone music as present from analyzed audio", async () => {
  const source = await readFile(new URL("../lib/creative/music/runtime/CreativeMusicDailiesListeningRuntime.js", import.meta.url), "utf8");
  assert.match(source, /content_kind: "STANDALONE_MUSIC"/);
  assert.match(source, /music_audio_present:/);
  assert.match(source, /dialogue_required: false/);
  assert.match(source, /dialogue_ducking_required: false/);
  assert.match(source, /ignore_cinematic_mix_presence_flags_for_music_presence: true/);
});


test("Music Dailies never equates generic melody onset with motif timing", async () => {
  const source = await readFile(new URL("../lib/creative/music/runtime/CreativeMusicDailiesListeningRuntime.js", import.meta.url), "utf8");
  assert.match(source, /motif_timing_evidence/);
  assert.match(source, /dedicated_match_ready: false/);
  assert.match(source, /generic_melody_phrase_onsets_are_not_motif_timing: true/);
  assert.match(source, /exact_motif_timing_requires_dedicated_match: true/);
  assert.match(source, /missing_dedicated_motif_match_is_unknown_not_render_failure: true/);
});

test("Music Dailies rejects reviewer claims outside measured evidence capabilities", async () => {
  const source = await readFile(new URL("../lib/creative/music/runtime/CreativeMusicDailiesListeningRuntime.js", import.meta.url), "utf8");
  assert.match(source, /UNSUPPORTED_DEDICATED_MOTIF_CLAIM/);
  assert.match(source, /UNSUPPORTED_INSTRUMENT_IDENTITY_CLAIM/);
  assert.match(source, /unsupported_evidence_dimensions_are_unknown_not_render_failure: true/);
  assert.match(source, /MUSIC_DAILIES_REVIEWER_EVIDENCE_POLICY_FAILED/);
});

test("Music Dailies bounds reviewer repair regions to rendered duration", async () => {
  const source = await readFile(new URL("../lib/creative/music/runtime/CreativeMusicDailiesListeningRuntime.js", import.meta.url), "utf8");
  assert.match(source, /REGION_OUTSIDE_RENDERED_DURATION/);
  assert.match(source, /actual_duration_seconds:/);
  assert.match(source, /region_bounds_must_be_within_actual_duration_seconds: true/);
  assert.match(source, /region\.end_seconds <= duration \+ 0\.001/);
});


test("Music Dailies forbids structural form labels from being treated as musical keys", async () => {
  const source = await readFile(new URL("../lib/creative/music/runtime/CreativeMusicDailiesListeningRuntime.js", import.meta.url), "utf8");
  assert.match(source, /STRUCTURAL_FORM_LABEL_CONFUSED_WITH_PITCH_KEY/);
  assert.match(source, /neutral_form_labels_are_structural_categories_not_pitch_or_key_names: true/);
});

test("Music Dailies treats missing semantic emotional arc evidence as unknown", async () => {
  const source = await readFile(new URL("../lib/creative/music/runtime/CreativeMusicDailiesListeningRuntime.js", import.meta.url), "utf8");
  assert.match(source, /UNKNOWN_SEMANTIC_ARC_TREATED_AS_RENDER_FAILURE/);
  assert.match(source, /missing_semantic_emotional_arc_is_unknown_not_render_failure: true/);
});

test("Music Dailies repair brief includes only failed reviewer repairs and regions", () => {
  const reviews = [
    { family: "TECHNICAL", passed: true, repair: ["Do not include"], regions: [{ start_seconds: 0, end_seconds: 10, evidence: "pass" }] },
    { family: "PERFORMANCE", passed: false, repair: ["Fix timing"], regions: [{ start_seconds: 10, end_seconds: 20, evidence: "fail" }] },
  ];
  const brief = buildMusicDailiesRepairBrief({ report: { passed: false, failures: ["PERFORMANCE"] }, reviews, binding: {} });
  assert.deepEqual(brief.repairs, [{ family: "PERFORMANCE", instruction: "Fix timing" }]);
  assert.equal(brief.regions.length, 1);
  assert.equal(brief.regions[0].family, "PERFORMANCE");
});
