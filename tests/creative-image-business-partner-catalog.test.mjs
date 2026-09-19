import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  planCreativeStillWorldClassProduction,
} from "../lib/creative/stills/runtime/CreativeStillWorldClassPlanningRuntime.js";

const creativeRuntime = fs.readFileSync("lib/creative/runtime/CreativeRuntime.js", "utf8");
const inspectCapability = fs.readFileSync("lib/creative/stills/capabilities/inspectWorldClassImageStudio.js", "utf8");
const planCapability = fs.readFileSync("lib/creative/stills/capabilities/planWorldClassImageStudio.js", "utf8");

test("Business Partner catalog exposes prompt-free Image Studio planning", () => {
  assert.match(creativeRuntime, /image:\s*\{/);
  assert.match(creativeRuntime, /inspectWorldClassImageStudio/);
  assert.match(creativeRuntime, /planWorldClassImageStudio/);
  assert.match(inspectCapability, /BUSINESS_PARTNER/);
  assert.match(planCapability, /creative-discussion/);
  assert.match(planCapability, /move the subject left/);
  assert.match(planCapability, /use the real photo/);
});

test("poster discussion activates exact design and identity workers without generation", () => {
  const plan = planCreativeStillWorldClassProduction({
    project: { objective: "Create a professional poster using the real artist photo and keep the layout calm." },
    brief: { deliverable: "poster", format: "4:5" },
    deliverables: [{ type: "POSTER", channels: ["facebook", "instagram"] }],
    assets: [{ asset_type: "image/jpeg", role: "identity_reference", tags: ["person", "reference"] }],
  });
  assert.equal(plan.prompt_free, true);
  assert.equal(plan.controls.subject_identity, true);
  assert.equal(plan.controls.exact_design, true);
  assert.equal(plan.controls.format_adaptation, true);
  assert.ok(plan.active_role_ids.includes("graphic_design_director"));
  assert.ok(plan.active_role_ids.includes("typography_director"));
  assert.ok(plan.active_role_ids.includes("image_retouching_director"));
  assert.equal(plan.provider_prompt_boundary, "EXECUTION_TRANSPORT_ONLY");
});
