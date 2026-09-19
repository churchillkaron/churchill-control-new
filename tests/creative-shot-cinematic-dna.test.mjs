import test from "node:test";
import assert from "node:assert/strict";

import {
  buildShotCinematicDna,
  evaluateShotCinematicDna,
} from "../lib/creative/video/runtime/CreativeShotCinematicDnaRuntime.js";
import {
  serializeCreativeProviderInstruction,
} from "../lib/creative/execution/runtime/CreativeProviderInstructionSerializer.js";
import {
  buildCreativeShotBible,
} from "../lib/creative/video/runtime/CreativeShotBibleRuntime.js";

function fixture() {
  const shot = {
    id: "hero-1",
    title: "Human to monumental",
    purpose: "Reveal the true physical scale after an intimate human beat.",
    subject: "technician beside aircraft assembly",
    action: "The technician closes a panel; the machine state changes and the camera reveals the vast assembly hall.",
    duration_seconds: 6,
    reveal_stage: "HERO_SCALE_REVEAL",
    generation: { required: true, service: "ai.video.generate", capability: "ai.video.generate", output_spec: { duration_seconds: 6 } },
    camera: { framing: "wide environmental reveal", movement_path: "slow lateral crane reveal", platform_motivation: "scale becomes legible only after the technician completes the action" },
    lighting: { exposure_intent: "protect bright industrial highlights while separating the technician" },
    location: { type: "aircraft factory", city: "Linkoping" },
    production_design: { materials: "painted aircraft skin, steel tooling, concrete floor" },
    frame_plan: { opening_frame: "tight on hand and access panel", closing_frame: "technician small in frame with full assembly hall visible" },
    cinematic_beauty_intent: { required: true, composition: "technician held in lower foreground while aircraft structure dominates the deep frame", lighting: "motivated industrial daylight", atmosphere: "clean working-air volume with subtle depth", camera_placement: "low lateral crane line", emotional_charge: "awe through scale rather than spectacle" },
    human_purpose: "The technician's completed action changes the aircraft maintenance state.",
    negative_constraints: ["no posed worker", "no generic futuristic factory"],
    audio: { sync_events: ["panel latch click starts the reveal"] },
  };
  const scene = { objective: "Expand perceived scale", emotion: "quiet awe", location: shot.location };
  const creative_plan = { benchmark_lab: { craft_dna: {
    transferable_principles: ["contrast intimate detail with environmental scale", "withhold orientation until action earns the reveal", "physical sound can lead picture"],
    cinematography_principles: ["depth must remain readable", "camera movement must be motivated"],
    editorial_principles: ["protect payoff duration"],
    sound_principles: ["diegetic transient leads transition"],
    anti_copy_rules: ["do not reproduce benchmark shot compositions", "do not copy branded reveal mechanics", "do not imitate protected music"],
  } } };
  return { shot, scene, creative_plan };
}

test("shot cinematic DNA converts approved direction into release-blocking graphic intent", () => {
  const { shot, scene, creative_plan } = fixture();
  const dna = buildShotCinematicDna({ shot, scene, creative_plan });
  const gate = evaluateShotCinematicDna(dna);
  assert.equal(gate.passed, true, gate.failures.join(","));
  assert.equal(dna.visual_quality_floor, 94);
  assert.equal(dna.iconic_frame.required, true);
  assert.match(dna.visual_hierarchy, /technician beside aircraft assembly/i);
  assert.match(dna.place_causality, /aircraft factory/i);
  assert.ok(dna.benchmark_craft_principles.length >= 3);
  assert.ok(dna.anti_generic_constraints.length >= 5);
});

test("provider serializer gives Cinema the exact cinematic DNA instead of dropping it", () => {
  const { shot, scene, creative_plan } = fixture();
  const dna = buildShotCinematicDna({ shot, scene, creative_plan });
  const instruction = serializeCreativeProviderInstruction({
    capability: "ai.video.generate",
    node_type: "SHOT",
    title: shot.title,
    intent: { purpose: shot.purpose, subject: shot.subject, action: shot.action },
    requirements: { cinematic_dna: dna, camera: shot.camera, lighting: shot.lighting, location: shot.location, frame_plan: shot.frame_plan },
    output_spec: shot.generation.output_spec,
  });
  assert.match(instruction, /Release-blocking Shot Cinematic DNA/);
  assert.match(instruction, /HUMAN|ENVIRONMENTAL|MONUMENTAL/);
  assert.match(instruction, /campaign_still_strength_required/);
  assert.match(instruction, /generic AI beauty/);
  assert.match(instruction, /merely photoreal result/i);
});

test("shot bible fails closed for generated video when cinematic DNA is absent and passes when bound", () => {
  const { shot, scene, creative_plan } = fixture();
  const dna = buildShotCinematicDna({ shot, scene, creative_plan });
  const baseTask = { capability: "ai.video.generate", service_code: "ai.video.generate", input: { requirements: {}, generation: shot.generation } };
  const missing = buildCreativeShotBible({ shot, task: baseTask });
  assert.ok(missing.completeness.missing.includes("cinematic.dna.contract"));
  const bound = buildCreativeShotBible({ shot, task: { ...baseTask, input: { ...baseTask.input, requirements: { cinematic_dna: dna } } } });
  assert.equal(bound.cinematic.dna.contract, "CREATIVE_SHOT_CINEMATIC_DNA_V1");
  assert.equal(bound.cinematic.dna.visual_quality_floor, 94);
  assert.equal(bound.completeness.missing.includes("cinematic.dna.contract"), false);
});
