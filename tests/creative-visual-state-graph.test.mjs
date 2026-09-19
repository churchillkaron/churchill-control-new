import test from "node:test";
import assert from "node:assert/strict";
import { CreativeVisualStateGraphRuntime } from "../lib/creative/video/runtime/CreativeVisualStateGraphRuntime.js";

function graphForTier(tier) {
  return {
    nodes: [{
      id: "shot-1",
      type: "SHOT",
      title: "Hero factory",
      priority: 100,
      requirements: {
        frame_design: {
          shot_tier: tier,
          frame_spec: { subject_position: "left third" },
          authored_frames: {},
          iconic_target: "decisive hero frame",
          visual_state_conditioning: {
            required: tier !== "C",
            contract: "CREATIVE_VISUAL_STATE_CONDITIONING_V1",
          },
        },
      },
      metadata: { scene_id: "scene-1" },
    }],
    edges: [],
    metadata: {},
  };
}
test("Tier A inserts opening hero closing states and review dependencies", () => {
  const graph = CreativeVisualStateGraphRuntime.apply({ graph: graphForTier("A") });
  const states = graph.nodes.filter((node) => node.type === "VISUAL_STATE");
  const reviews = graph.nodes.filter((node) => node.type === "VISUAL_STATE_REVIEW");
  assert.equal(states.length, 3);
  assert.equal(reviews.length, 3);
  assert.deepEqual(states.map((node) => node.metadata.visual_state_role), ["OPENING", "HERO", "CLOSING"]);
  const shot = graph.nodes.find((node) => node.id === "shot-1");
  assert.equal(shot.requirements.visual_state_conditioning_required, true);
  assert.equal(shot.requirements.visual_state_review_node_ids.length, 3);
  assert.equal(graph.metadata.visual_state_binding_count, 1);
});

test("Tier B inserts one controlled opening state", () => {
  const graph = CreativeVisualStateGraphRuntime.apply({ graph: graphForTier("B") });
  const states = graph.nodes.filter((node) => node.type === "VISUAL_STATE");
  assert.equal(states.length, 1);
  assert.equal(states[0].metadata.visual_state_role, "OPENING");
});

test("Tier C does not add visual-state generation cost", () => {
  const graph = CreativeVisualStateGraphRuntime.apply({ graph: graphForTier("C") });
  assert.equal(graph.nodes.filter((node) => node.type === "VISUAL_STATE").length, 0);
  assert.equal(graph.metadata.visual_state_binding_count, 0);
});
