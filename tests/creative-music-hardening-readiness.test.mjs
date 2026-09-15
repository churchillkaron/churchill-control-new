import test from "node:test";
import assert from "node:assert/strict";

import { selectMusicSeparator } from "../lib/creative/music/runtime/CreativeMusicSeparatorSelectionRuntime.js";
import { buildMusicRestorationPlan } from "../lib/creative/music/runtime/CreativeMusicRestorationPlanRuntime.js";
import { buildMusicFoleyPlan } from "../lib/creative/music/runtime/CreativeMusicFoleyPlanRuntime.js";
import {
  buildMusicTransformationIntegrityContract,
  reviewMusicTransformationIntegrity,
} from "../lib/creative/music/runtime/CreativeMusicTransformationIntegrityRuntime.js";
import { buildWorldClassMusicStudioPlan } from "../lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime.js";

test("separator selection never substitutes four-stem separation for vocal roles", () => {
  const result = selectMusicSeparator({ objective: "vocal_role_separation" });
  assert.equal(result.executable, false);
  assert.equal(result.ordinary_four_stem_fallback_forbidden, true);
  assert.ok(result.blockers.includes("CERTIFIED_VOCAL_ROLE_SEPARATOR_REQUIRED"));
});

test("separator selection can promote only certified benchmark winners", () => {
  const result = selectMusicSeparator({
    objective: "stem_separation",
    certified_models: ["candidate-a"],
    benchmark_results: [
      { model_id: "candidate-a", score: 95, promotion_eligible: true },
      { model_id: "candidate-b", score: 99, promotion_eligible: true },
    ],
  });
  assert.equal(result.selected_model, "candidate-a");
  assert.equal(result.baseline_used, false);
});

test("restoration plan bypasses unneeded processors and gates advanced repair", () => {
  const clean = buildMusicRestorationPlan({});
  assert.equal(clean.no_op, true);
  assert.deepEqual(clean.local_processors, []);
  const damaged = buildMusicRestorationPlan({ clipping_detected: true, excess_reverb_detected: true, hum_warning: true });
  assert.equal(damaged.executable_locally, false);
  assert.ok(damaged.local_processors.includes("NOTCH_HUM_AND_HARMONICS"));
  assert.ok(damaged.blockers.includes("CERTIFIED_DECLIP_ENGINE_REQUIRED"));
  assert.ok(damaged.blockers.includes("CERTIFIED_DEREVERB_ENGINE_REQUIRED"));
});

test("Foley planning is picture-synchronized and production gated", () => {
  const plan = buildMusicFoleyPlan({
    picture_duration_seconds: 20,
    frame_rate: 24,
    cues: [{ category: "IMPACT", start_seconds: 4.25, description: "door hit" }],
  });
  assert.equal(plan.events.length, 1);
  assert.equal(plan.events[0].sync_tolerance_ms, 16);
  assert.equal(plan.production_execution_ready, false);
  assert.equal(plan.synchronized_preview_required, true);
});

test("surgical edit integrity blocks release when material outside target changes", () => {
  const contract = buildMusicTransformationIntegrityContract({
    operation: "ai_edit",
    source_asset_id: "asset-1",
    source_checksum: "abc",
    target_range: { start_seconds: 30, end_seconds: 40 },
    source_duration_seconds: 180,
  });
  const review = reviewMusicTransformationIntegrity(contract, {
    source_fingerprint_verified: true,
    outside_target_delta_passed: false,
    continuity_passed: true,
    musical_identity_passed: true,
    intended_vs_rendered_passed: true,
  });
  assert.equal(review.release_ready, false);
  assert.ok(review.blockers.includes("OUTSIDE_TARGET_CHANGED"));
});

test("world-class plan exposes per-capability hardening readiness", () => {
  const plan = buildWorldClassMusicStudioPlan({
    objective: "Remove vocals and make a backing track",
    source_evidence: {
      default: { source_kind: "MASTERED_FULL_MIX" },
    },
  });
  assert.equal(plan.capability_readiness.contract, "AVANTIQO_MUSIC_CAPABILITY_READINESS_V2");
  assert.equal(plan.governance.source_fit_preflight_required_before_paid_execution, true);
  assert.ok(plan.capability_readiness.capabilities.some((row) => row.separator_selection));
});

test("quality tribunal contract requires device translation and professional reviewer coverage", async () => {
  const qualitySource = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../lib/creative/music/runtime/CreativeMusicWorldClassQualityRuntime.js", import.meta.url), "utf8"));
  const tribunalSource = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../lib/creative/music/runtime/CreativeMusicRepairAndTribunalRuntime.js", import.meta.url), "utf8"));
  const translationSource = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../lib/creative/music/runtime/CreativeMusicPerceptualTranslationRuntime.js", import.meta.url), "utf8"));
  assert.match(qualitySource, /MULTI_ROLE_LISTENING_PANEL_PRESENT/);
  assert.match(qualitySource, /TRANSLATION_MATRIX_PRESENT/);
  assert.match(tribunalSource, /tribunalReviewerRoles/);
  assert.match(tribunalSource, /tribunalTranslationContexts/);
  assert.match(translationSource, /PHONE_SPEAKER/);
  assert.match(translationSource, /LAPTOP/);
  assert.match(translationSource, /STREAMING_CODEC/);
});
