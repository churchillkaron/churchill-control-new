import test from "node:test";
import assert from "node:assert/strict";
import { CreativeVisualConditioningAuthorityRuntime } from "../lib/creative/video/runtime/CreativeVisualConditioningAuthorityRuntime.js";

test("specialized identity and closing states replace duplicate generic boundary states", () => {
  const shot = { id: "s1", type: "SHOT", requirements: { frame_design: { contract: "CREATIVE_FRAME_DESIGN_V1" }, visual_state_node_ids: ["s1:visual-state:opening", "s1:visual-state:hero", "s1:visual-state:closing"], visual_state_review_node_ids: ["s1:visual-state:opening:review", "s1:visual-state:hero:review", "s1:visual-state:closing:review"] }, generation: { provider_parameters: {} } };
  const nodes = [shot,
    { id: "s1:visual-state:opening", type: "VISUAL_STATE", metadata: { shot_id: "s1", visual_state_role: "OPENING" } },
    { id: "s1:visual-state:opening:review", type: "VISUAL_STATE_REVIEW", metadata: { shot_id: "s1", visual_state_node_id: "s1:visual-state:opening" } },
    { id: "s1:visual-state:hero", type: "VISUAL_STATE", metadata: { shot_id: "s1", visual_state_role: "HERO" } },
    { id: "s1:visual-state:hero:review", type: "VISUAL_STATE_REVIEW", metadata: { shot_id: "s1", visual_state_node_id: "s1:visual-state:hero" } },
    { id: "s1:visual-state:closing", type: "VISUAL_STATE", metadata: { shot_id: "s1", visual_state_role: "CLOSING" } },
    { id: "s1:visual-state:closing:review", type: "VISUAL_STATE_REVIEW", metadata: { shot_id: "s1", visual_state_node_id: "s1:visual-state:closing" } },
    { id: "identity", type: "IDENTITY_KEYFRAME", metadata: { shot_id: "s1" }, requirements: {} },
    { id: "identity:review", type: "IDENTITY_KEYFRAME_REVIEW", metadata: { shot_id: "s1" }, requirements: {} },
    { id: "closing", type: "CLOSING_KEYFRAME", metadata: { shot_id: "s1" }, requirements: {} },
    { id: "closing:review", type: "CLOSING_KEYFRAME_REVIEW", metadata: { shot_id: "s1" }, requirements: {} },
  ];
  const result = CreativeVisualConditioningAuthorityRuntime.apply({ graph: { nodes, edges: [] } });
  assert.equal(result.nodes.some((node) => node.id === "s1:visual-state:opening"), false);
  assert.equal(result.nodes.some((node) => node.id === "s1:visual-state:closing"), false);
  assert.equal(result.nodes.some((node) => node.id === "s1:visual-state:hero"), true);
  assert.equal(result.nodes.find((node) => node.id === "identity").metadata.canonical_visual_state_role, "OPENING");
  assert.equal(result.nodes.find((node) => node.id === "closing").metadata.canonical_visual_state_role, "CLOSING");
});
