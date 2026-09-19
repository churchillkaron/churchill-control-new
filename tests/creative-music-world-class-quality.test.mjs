import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildMusicIntendedVsRenderedReview,
  buildMusicQualityTribunal,
} from "../lib/creative/music/runtime/CreativeMusicWorldClassQualityRuntime.js";
import {
  buildWorldClassMusicStudioPlan,
} from "../lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime.js";

const plan = buildWorldClassMusicStudioPlan({
  objective: "Create a cinematic instrumental with a strong melody and premium dynamics",
});

test("Music Studio requires intended-vs-rendered independent review", () => {
  assert.equal(plan.quality.contract, "AVANTIQO_WORLD_CLASS_MUSIC_QUALITY_V1");
  assert.equal(plan.quality.release_threshold, 90);
  assert.equal(plan.governance.independent_music_tribunal_required, true);
});
test("incomplete listening evidence cannot release", () => {
  const review = buildMusicIntendedVsRenderedReview({ plan, evidence: {} });
  const tribunal = buildMusicQualityTribunal({
    plan,
    review,
    evidence: { master_report: { passed: true } },
  });
  assert.equal(review.complete, false);
  assert.equal(tribunal.release_ready, false);
  assert.ok(tribunal.failed_hard_gates.includes("INDEPENDENT_LISTENING_REVIEW_PRESENT"));
});

test("world-class result passes only with complete 90+ review and hard gates", () => {
  const scoreIds = ["brief_fidelity","musicality","emotion","originality","arrangement","performance","sound_design","mix_translation","technical_master","artifact_risk"];
  const scores = Object.fromEntries(scoreIds.map((id) => [id, 94]));
  const review = buildMusicIntendedVsRenderedReview({ plan, evidence: { scores, rendered: { master_id: "master-1" } } });
  const tribunal = buildMusicQualityTribunal({
    plan,
    review,
    evidence: {
      master_report: { passed: true },
      source_rights_required: false,
      source_present: false,
      clipping_detected: false,
      delivery_corrupt: false,
      listening_reviewer_roles: ["PRODUCER", "MIX_ENGINEER", "MASTERING_ENGINEER", "MUSICIAN", "GENERAL_LISTENER"],
      translation_contexts: ["STUDIO_MONITORS", "HEADPHONES", "PHONE_SPEAKER", "LAPTOP", "MONO", "STREAMING_CODEC"],
      source_fit_preflight_passed: true,
    },
  });
  assert.equal(review.weighted_score, 94);
  assert.equal(tribunal.verdict, "PASS");
  assert.equal(tribunal.release_ready, true);
  assert.equal(tribunal.publication_authorized, false);
});


test("world-class execution cannot claim release-ready before tribunal", () => {
  const source = fs.readFileSync(new URL("../lib/creative/music/runtime/CreativeMusicWorldClassExecutionRuntime.js", import.meta.url), "utf8");
  assert.match(source, /worldClassMusicQualityPending/);
  assert.match(source, /release_ready: false/);
  assert.match(source, /QUALITY_REVIEW_REQUIRED/);
});
