import assert from "node:assert/strict";
import test from "node:test";

import { buildCreativeImageStudioOperatingState } from "../lib/creative/stills/runtime/CreativeImageStudioOperatingRuntime.js";

test("image studio starts with direction and activates professional still team", () => {
  const state = buildCreativeImageStudioOperatingState({});
  assert.equal(state.active_stage.id, "direction");
  assert.equal(state.stages.length, 7);
  assert.equal(state.world_class_plan.dynamic, true);
  assert.equal(state.reference_intelligence.prompt_free, true);
  assert.ok(state.team.some((role) => role.id === "executive_creative_director"));
  assert.ok(state.departments.some((department) => department.id === "independent_quality"));
  assert.equal(state.quality.deterministic_typography_required, true);
  assert.equal(state.interaction.prompt_free, true);
  assert.equal(state.interaction.dynamic_planning, true);
  assert.equal(state.interaction.provider_prompts_user_visible, false);
  assert.ok(state.world_class_controls.some((control) => control.id === "composition_structure"));
  assert.ok(state.world_class_controls.some((control) => control.id === "exact_design"));
  assert.ok(state.world_class_controls.some((control) => control.id === "independent_review"));
});

test("image studio progresses through references, creation, composition and review from evidence", () => {
  const state = buildCreativeImageStudioOperatingState({
    strategyRuntime: { current: { id: "strategy-1" } },
    assetRuntime: { items: [
      { id: "reference-1", asset_type: "image", role: "STYLE_REFERENCE", url: "https://example.com/ref.jpg" },
      { id: "image-1", asset_type: "image", url: "https://example.com/image.jpg", revision: 2, approval_state: "APPROVED", metadata: { design_document_id: "design-1", image_asset_perceptual_qc_sealed: true, release_approved: true } },
    ] },
    taskRuntime: { items: [
      { id: "review-1", type: "QUALITY_REVIEW", status: "COMPLETED", capability: "creative.still.validate" },
    ] },
  });
  assert.equal(state.stages.find((stage) => stage.id === "direction").state, "COMPLETE");
  assert.equal(state.stages.find((stage) => stage.id === "references").state, "COMPLETE");
  assert.equal(state.stages.find((stage) => stage.id === "create").state, "COMPLETE");
  assert.equal(state.stages.find((stage) => stage.id === "compose").state, "COMPLETE");
  assert.equal(state.stages.find((stage) => stage.id === "refine").state, "COMPLETE");
  assert.equal(state.stages.find((stage) => stage.id === "review").state, "COMPLETE");
  assert.equal(state.active_stage.id, "deliver");
});
