import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMusicCreativeDevelopment,
  evaluateMusicDailies,
} from "../lib/creative/music/runtime/CreativeMusicCreativeDevelopmentRuntime.js";
import { buildWorldClassMusicStudioPlan } from "../lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime.js";

test("Music Studio builds three independent concepts before production", () => {
  const development = buildMusicCreativeDevelopment({ objective: "Create a cinematic original song for a global technology film" });
  assert.equal(development.concept_competition.concept_count, 3);
  assert.equal(development.concept_competition.concepts.length, 3);
  assert.equal(development.concept_competition.blind_independent_scoring, true);
  assert.equal(development.preproduction.expensive_generation_before_lock_allowed, false);
});
test("Music dailies reject missing intended-vs-rendered evidence", () => {
  const result = evaluateMusicDailies({
    intended: { emotional_arc: "build" },
    rendered: {},
    reviews: [],
  });
  assert.equal(result.passed, false);
  assert.equal(result.status, "REJECTED_FOR_REPAIR");
  assert.ok(result.failures.some((item) => item.includes("INTENDED_CONTRACT_REQUIRED")));
  assert.ok(result.failures.some((item) => item.includes("RENDERED_EVIDENCE_REQUIRED")));
});

test("World-class plan embeds the creative-development contract", () => {
  const plan = buildWorldClassMusicStudioPlan({ objective: "Create an original instrumental with a strong emotional arc" });
  assert.equal(plan.creative_development.contract, "AVANTIQO_MUSIC_CREATIVE_DEVELOPMENT_V1");
  assert.equal(plan.creative_development.concept_competition.weighted_winner_required, true);
});
