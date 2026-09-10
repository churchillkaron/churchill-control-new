import assert from "node:assert/strict";
import test from "node:test";

import {
  CreativeStudioVisualReadinessCertificationRuntime,
  evaluateStudioVisualReadiness,
  issueStudioVisualGenerationCertification,
} from "../lib/creative/quality/runtime/CreativeStudioVisualReadinessCertificationRuntime.js";
import { creativeSequenceIdentityFailures, creativeShotCameraFeasibilityFailures, CreativeShotPhysicalPreflightRuntime } from "../lib/creative/quality/runtime/CreativeShotPhysicalPreflightRuntime.js";
import { compileAvantiqoVideoFastPreviewPrompt } from "../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoFastPreviewPrompt.js";

function perfectEvidence() {
  return Object.fromEntries(
    CreativeStudioVisualReadinessCertificationRuntime.required_disciplines.map(
      (id) => [id, { passed: true, score: 100, evidence: [`${id}:verified`] }],
    ),
  );
}

test("visual readiness uses weakest-link 100 percent certification", () => {
  const evidence = perfectEvidence();
  evidence.mechanical_system_plausibility.score = 99;
  const result = evaluateStudioVisualReadiness(evidence);
  assert.equal(result.passed, false);
  assert.equal(result.score, 99);
  assert.ok(result.failed_disciplines.includes("mechanical_system_plausibility"));
});
test("a perfect offline suite certifies readiness but does not unlock spend", () => {
  const evidence = perfectEvidence();
  const result = evaluateStudioVisualReadiness(evidence);
  assert.equal(result.passed, true);
  assert.equal(result.score, 100);
  const certification = issueStudioVisualGenerationCertification(evidence);
  assert.equal(certification.passed, true);
  assert.equal(certification.score, 100);
  assert.equal(certification.zero_paid_media_generation, true);
  assert.equal(certification.generation_unlocked, false);
  assert.match(certification.benchmark_suite_digest, /^[0-9a-f]{64}$/);
});

test("Norway-style impossible scale change is rejected before generation", () => {
  const shot = {
    subject_class: "Heavy twin-engine offshore SAR transport helicopter with wheeled landing gear",
    subject_signature: { defining_features: ["broad twin-engine fuselage", "wheeled offshore landing gear"], forbidden_substitutions: ["light skid-equipped utility helicopter"] },
    mechanical_truth: "Rotor hub, mast, swashplate, blade roots and fuselage attachments remain mechanically connected and plausible",
    mechanical_signature: { functional_assemblies: ["articulated main rotor hub"], required_connections: ["vertical rotor mast enters upper fuselage"], motion_constraints: ["blade roots rotate about the connected hub without detachment"] },
    world_geometry_anchor: "One fixed North Sea production platform with unchanged helideck, crane and structural topology",
    world_topology: ["helideck remains fixed above the same support structure", "crane remains on the same side of the process modules"],
    continuity_invariants: ["same helicopter configuration", "same platform geometry"],
    camera_feasibility: "A single locked camera observes one continuous physically achievable action without resets.",
    camera: { movement_path: "Stationary locked-off camera", movement_motivation: "Hold geometry stable" },
    frame_plan: { opening_frame: "Extreme close-up detail of the rotor mast", progression: "Subject motion continues while camera remains fixed", closing_frame: "Wide aerial view showing the entire offshore platform" },
  };
  const failures = creativeShotCameraFeasibilityFailures(shot);
  assert.ok(failures.includes("SHOT_CAMERA_PATH_CANNOT_REACH_CLOSING_FRAME"));
  const result = CreativeShotPhysicalPreflightRuntime.evaluate(shot);
  assert.equal(result.passed, false);
  assert.equal(result.zero_provider_calls, true);
});


test("persistent aircraft and world identity cannot drift across inherited shots", () => {
  const failures = creativeSequenceIdentityFailures([
    { subject_identity_key: "offshore-heavy-helicopter-a", world_identity_key: "north-sea-platform-a" },
    { subject_identity_key: "generic-light-helicopter-b", world_identity_key: "north-sea-platform-a", inherits_subject_identity: true, inherits_world_identity: true },
    { subject_identity_key: "generic-light-helicopter-b", world_identity_key: "different-platform-b", inherits_subject_identity: true, inherits_world_identity: true },
  ]);
  assert.ok(failures.includes("SHOT_SUBJECT_IDENTITY_DRIFT:1"));
  assert.ok(failures.includes("SHOT_WORLD_IDENTITY_DRIFT:2"));
});

test("provider prompt transport strips continuity metadata and preserves only visual anchors", () => {
  const prompt = compileAvantiqoVideoFastPreviewPrompt({
    requirements: {
      generator_visual_anchor: "Heavy twin-engine offshore transport helicopter with wheeled landing gear and a conventional articulated rotor system",
      world_visual_anchor: "One fixed North Sea production platform with the same helideck, crane positions and structural silhouette",
      cinematic_story_beat: { frame_intent: "Three-quarter documentary view over open sea", hidden_direction: { narrative_action: "The helicopter advances steadily toward the platform" } },
    },
    repair_specification: { required_repairs: [
      "Continuity: {\"previous_shot_id\":\"123e4567-e89b-12d3-a456-426614174000\"}",
      "Truth checks: reject wrong helicopter",
      "Camera: {\"framing\":\"medium three-quarter view\",\"movement_path\":\"slow lateral tracking\"}",
    ] },
  });
  assert.match(prompt, /Heavy twin-engine offshore transport helicopter/);
  assert.match(prompt, /One fixed North Sea production platform/);
  assert.doesNotMatch(prompt, /previous_shot_id|123e4567|Truth checks|Continuity:|\{|\}/i);
});

import { evaluateCinematicReferenceGrammar } from "../lib/creative/quality/runtime/CreativeCinematicReferenceGrammarRuntime.js";

test("flat generic coverage cannot pass reference grammar", () => {
  const result = evaluateCinematicReferenceGrammar({ shots: [
    { reveal_stage: "setup", shot_scale: "medium", narrative_function: "coverage" },
    { reveal_stage: "setup", shot_scale: "medium", narrative_function: "coverage" },
    { reveal_stage: "setup", shot_scale: "medium", narrative_function: "coverage" },
  ] });
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("REFERENCE_GRAMMAR_REVEAL_LADDER_TOO_FLAT"));
  assert.ok(result.failures.includes("REFERENCE_GRAMMAR_REPEATED_COVERAGE"));
  assert.ok(result.failures.includes("REFERENCE_GRAMMAR_PAYOFF_REQUIRED"));
});

test("decorative black, fake geography and purposeless humans fail reference grammar", () => {
  const result = evaluateCinematicReferenceGrammar({ shots: [
    { reveal_stage: "fragment", shot_scale: "detail", black_frame: true, black_frame_purpose: "style", named_place: "Wall Street", human_present: true },
    { reveal_stage: "context", shot_scale: "medium", transition: { device: "random morph" } },
    { reveal_stage: "payoff", shot_scale: "wide", payoff: true, narrative_function: "hero reveal" },
  ] });
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("REFERENCE_GRAMMAR_DECORATIVE_BLACK_FRAME"));
  assert.ok(result.failures.includes("REFERENCE_GRAMMAR_GEOGRAPHY_PROOF_REQUIRED"));
  assert.ok(result.failures.includes("REFERENCE_GRAMMAR_HUMAN_PURPOSE_REQUIRED"));
  assert.ok(result.failures.includes("REFERENCE_GRAMMAR_TRANSITION_CAUSALITY_REQUIRED"));
});

test("authored reveal progression with causal transitions can pass reference grammar", () => {
  const result = evaluateCinematicReferenceGrammar({ shots: [
    { reveal_stage: "fragment", shot_scale: "detail", transition: { device: "sound" }, black_frame: true, black_frame_purpose: "heartbeat tension and sound-led transition" },
    { reveal_stage: "context", shot_scale: "medium", named_place: "North Sea", geography_proof: ["cold open sea horizon", "offshore production platform"], human_present: true, human_purpose: "offshore worker performs arrival ritual", transition: { device: "motion" } },
    { reveal_stage: "payoff", shot_scale: "wide", payoff: true, narrative_function: "hero reveal resolves the scale question", transition: { device: "geometry" } },
  ] });
  assert.deepEqual(result.failures, []);
  assert.equal(result.passed, true);
  assert.equal(result.score, 100);
});

test("vague physical prose cannot substitute for structured mechanical truth", () => {
  const result = CreativeShotPhysicalPreflightRuntime.evaluate({
    subject_identity_key: "helicopter-a",
    world_identity_key: "platform-a",
    subject_class: "Large offshore transport helicopter with industrial configuration",
    mechanical_truth: "Everything looks mechanically realistic and cinematic in motion.",
    world_geometry_anchor: "Stable offshore platform environment throughout the shot",
    continuity_invariants: ["same helicopter"],
    camera_feasibility: "Locked camera observes one continuous action with no hidden reset or reframing.",
    camera: { movement_path: "stationary locked camera" },
    frame_plan: { opening_frame: "medium shot", progression: "subject moves naturally", closing_frame: "medium shot" },
  });
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("SHOT_SUBJECT_DEFINING_FEATURES_REQUIRED"));
  assert.ok(result.failures.includes("SHOT_FUNCTIONAL_ASSEMBLIES_REQUIRED"));
  assert.ok(result.failures.includes("SHOT_REQUIRED_CONNECTIONS_REQUIRED"));
  assert.ok(result.failures.includes("SHOT_MOTION_CONSTRAINTS_REQUIRED"));
  assert.ok(result.failures.includes("SHOT_WORLD_TOPOLOGY_REQUIRED"));
});

test("same identity label cannot hide subject mechanics or world topology drift", () => {
  const baseSubject = { defining_features: ["broad twin-engine fuselage", "wheeled landing gear"], forbidden_substitutions: ["light skid helicopter"] };
  const baseMechanical = { functional_assemblies: ["articulated rotor hub"], required_connections: ["mast connected to fuselage"], motion_constraints: ["blade roots remain attached"] };
  const failures = creativeSequenceIdentityFailures([
    { subject_identity_key: "helicopter-a", world_identity_key: "platform-a", subject_signature: baseSubject, mechanical_signature: baseMechanical, world_topology: ["helideck above support frame", "crane left of process modules"] },
    { subject_identity_key: "helicopter-a", world_identity_key: "platform-a", inherits_subject_identity: true, inherits_world_identity: true, subject_signature: { ...baseSubject, defining_features: ["small cabin", "skid landing gear"] }, mechanical_signature: { ...baseMechanical, required_connections: ["smooth rotor disc fused to roof"] }, world_topology: ["helideck beside support frame", "crane right of process modules"] },
  ]);
  assert.ok(failures.includes("SHOT_SUBJECT_SIGNATURE_DRIFT:1"));
  assert.ok(failures.includes("SHOT_MECHANICAL_SIGNATURE_DRIFT:1"));
  assert.ok(failures.includes("SHOT_WORLD_TOPOLOGY_DRIFT:1"));
});

import { readFile as readSourceFile } from "node:fs/promises";

test("visual generation master lock exists at task, common provider and direct owned provider boundaries", async () => {
  const [taskRuntime, providerExecutor, videoProvider, imageProvider] = await Promise.all([
    readSourceFile("lib/operations/tasks/runtime/ProductionTaskRuntime.js", "utf8"),
    readSourceFile("lib/platform/service-runtime/providers/ProviderExecutor.js", "utf8"),
    readSourceFile("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js", "utf8"),
    readSourceFile("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProvider.js", "utf8"),
  ]);
  for (const source of [taskRuntime, providerExecutor, videoProvider, imageProvider]) {
    assert.match(source, /AVANTIQO_STUDIO_VISUAL_GENERATION_ENABLED/);
    assert.match(source, /STUDIO_VISUAL_GENERATION_MASTER_LOCKED/);
  }
  assert.match(imageProvider, /capability !== "ai\.image\.analyze"/);
});
