import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCreativeFrameDesign,
  evaluateCreativeFrameDesign,
} from "../lib/creative/video/runtime/CreativeFrameDesignRuntime.js";
import {
  buildCreativeVideoGenerationEnvelope,
  assertCreativeVideoGenerationEnvelope,
} from "../lib/creative/video/runtime/CreativeVideoGenerationEnvelopeRuntime.js";

test("Tier A frame design requires opening, hero and closing controlled states", () => {
  const frameDesign = buildCreativeFrameDesign({
    shot: {
      id: "shot-hero",
      title: "Global hero reveal",
      purpose: "Signature brand payoff",
      subject: "aircraft",
      camera: { framing: "monumental wide" },
      frame_plan: {
        opening_frame: { description: "small aircraft against enormous hangar" },
        progression_frames: [{ description: "specular fuselage hero frame" }],
        closing_frame: { description: "aircraft clears frame into negative space" },
      },
    },
    cinematic_dna: {
      iconic_frame: { required: true, target: "full-page campaign still" },
      visual_hierarchy: "aircraft first",
      composition: "layered monumental geometry",
      depth_strategy: "foreground hangar, aircraft midground, runway background",
      material_behavior: "brushed metal with controlled specular response",
      anti_generic_constraints: ["no generic gloss"],
    },
  });
  const gate = evaluateCreativeFrameDesign(frameDesign);
  assert.equal(frameDesign.shot_tier, "A");
  assert.equal(frameDesign.visual_state_conditioning.mode, "FIRST_KEY_LAST_CONTROLLED");
  assert.equal(frameDesign.visual_state_conditioning.required_state_count, 3);
  assert.equal(frameDesign.visual_state_conditioning.generator_may_invent_complete_composition, false);
  assert.equal(gate.passed, true);
});

test("Tier B frame design requires one controlled boundary state", () => {
  const frameDesign = buildCreativeFrameDesign({
    shot: { id: "shot-human", purpose: "human story beat", subject: "technician", camera: { framing: "medium" } },
    cinematic_dna: {
      iconic_frame: { required: false, target: "technician dwarfed by machinery" },
      visual_hierarchy: "technician first",
      composition: "natural asymmetry",
      depth_strategy: "machine foreground, technician midground, factory background",
      material_behavior: "steel, cloth and skin respond independently",
    },
  });
  const gate = evaluateCreativeFrameDesign(frameDesign);
  assert.equal(frameDesign.shot_tier, "B");
  assert.equal(frameDesign.visual_state_conditioning.mode, "ONE_BOUNDARY_STATE_CONTROLLED");
  assert.equal(frameDesign.visual_state_conditioning.required_state_count, 1);
  assert.equal(gate.passed, true);
});

test("generation envelope preserves frame design and nested cinematic DNA", () => {
  const frameDesign = buildCreativeFrameDesign({
    shot: { id: "shot-1", purpose: "human story beat", subject: "worker" },
    cinematic_dna: { iconic_frame: { required: false }, visual_hierarchy: "worker first", composition: "asymmetric", depth_strategy: "three planes", material_behavior: "physical" },
  });
  const envelope = buildCreativeVideoGenerationEnvelope({
    shot_bible: {
      contract: "CREATIVE_SHOT_BIBLE_V1",
      shot_id: "shot-1",
      cinematic: {
        dna: { contract: "CREATIVE_SHOT_CINEMATIC_DNA_V1", visual_quality_floor: 94 },
        frame_design: frameDesign,
        visual_state_conditioning: frameDesign.visual_state_conditioning,
      },
    },
    metadata: { creative_video_native_control: { contract: "CREATIVE_VIDEO_NATIVE_CONTROL_V1" } },
  });
  assert.equal(envelope.frame_design.contract, "CREATIVE_FRAME_DESIGN_V1");
  assert.equal(envelope.visual_state_conditioning.contract, "CREATIVE_VISUAL_STATE_CONDITIONING_V1");
  assert.equal(assertCreativeVideoGenerationEnvelope(envelope), envelope);
});
