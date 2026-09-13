import assert from "node:assert/strict";
import test from "node:test";
import { planCreativeStillWorldClassProduction } from "../lib/creative/stills/runtime/CreativeStillWorldClassPlanningRuntime.js";

test("poster activates design, typography, retouch and independent review without a prompt surface", () => {
  const plan = planCreativeStillWorldClassProduction({
    mission: { title: "Premium restaurant Facebook poster with singer portrait" },
    deliverables: [{ type: "POSTER", channels: ["facebook", "instagram"] }],
    assets: [{ asset_type: "image", role: "IDENTITY_REFERENCE", tags: ["brand"] }],
  });
  assert.equal(plan.prompt_free, true);
  assert.equal(plan.provider_selection_user_visible, false);
  assert.equal(plan.controls.exact_design, true);
  assert.equal(plan.controls.subject_identity, true);
  assert.equal(plan.controls.format_adaptation, true);
  assert.ok(plan.active_role_ids.includes("graphic_design_director"));
  assert.ok(plan.active_role_ids.includes("typography_director"));
  assert.ok(plan.active_role_ids.includes("image_retouching_director"));
  assert.ok(plan.departments.some((item) => item.id === "independent_quality"));
});

test("simple original illustration avoids irrelevant photo and print departments", () => {
  const plan = planCreativeStillWorldClassProduction({
    mission: { title: "Create an original abstract illustration for a digital hero" },
    deliverables: [{ type: "IMAGE", channels: ["web"] }],
  });
  assert.equal(plan.signals.photographic, false);
  assert.equal(plan.signals.print_required, false);
  assert.equal(plan.controls.print_engineering, false);
  assert.equal(plan.dynamic, true);
});
