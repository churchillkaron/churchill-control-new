import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [roles, contract, validator, planner] = await Promise.all([
  readFile("lib/creative/director/registry/CreativeAgencyRoleRegistry.js", "utf8"),
  readFile("lib/creative/director/registry/CreativeMasterPlanContractRegistry.js", "utf8"),
  readFile("lib/creative/director/validation/CreativeMasterPlanValidator.js", "utf8"),
  readFile("lib/creative/production-graph/planner/UniversalProductionGraphPlanner.js", "utf8"),
]);

const [designSpec, perceptual, serializer, stillDesign, queue, graphRuntime] = await Promise.all([
  readFile("lib/creative/design/runtime/CreativeDesignSpecificationRuntime.js", "utf8"),
  readFile("lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualGraphRuntime.js", "utf8"),
  readFile("lib/creative/execution/runtime/CreativeProviderInstructionSerializer.js", "utf8"),
  readFile("lib/creative/stills/runtime/StillDesignContractRuntime.js", "utf8"),
  readFile("lib/creative/production/queue/runtime/ProductionQueueRuntime.js", "utf8"),
  readFile("lib/creative/production-graph/runtime/ProductionGraphRuntime.js", "utf8"),
]);
test("STILL master plans require real art and production-design authority", () => {
  assert.match(roles, /"production_designer",/);
  assert.match(validator, /STILL:\s*new Set\(\[/);
  assert.match(validator, /"art_director"/);
  assert.match(validator, /"production_designer"/);
  assert.match(contract, /required_sections:\s*Object\.freeze\(\["art_direction", "deliverables", "production"\]\)/);
});

test("STILL master plans carry a structured art-direction dossier", () => {
  assert.match(contract, /governing_visual_idea/);
  assert.match(contract, /focal_hierarchy/);
  assert.match(contract, /negative_space_strategy/);
  assert.match(contract, /production_world_rules/);
  assert.match(contract, /generation_requirements/);
  assert.match(contract, /review_criteria/);
});

test("image workers receive immutable execute-only art authority", () => {
  assert.match(planner, /CREATIVE_STILL_ART_DIRECTION_AUTHORITY_V1/);
  assert.match(planner, /image_worker_authority:\s*"EXECUTE_ONLY"/);
  assert.match(planner, /reinterpretation_allowed:\s*false/);
  assert.match(planner, /art_direction_authority:\s*artAuthority/);
});
test("generated stills receive Art Director intended-vs-rendered review", () => {
  assert.match(graphRuntime, /if \(kind === "STILL"\)/);
  assert.match(graphRuntime, /CreativeGeneratedMediaPerceptualGraphRuntime\.apply/);
  assert.match(perceptual, /art_direction:\s*object\(node\.requirements\?\.art_direction\)/);
  assert.match(serializer, /compare the rendered result against the approved Art Direction authority and dossier/);
});

test("still finishing fails closed without the same art authority", () => {
  assert.match(stillDesign, /CREATIVE_STILL_ART_DIRECTION_AUTHORITY_REQUIRED/);
  assert.match(stillDesign, /CREATIVE_STILL_ART_DIRECTION_DOSSIER_REQUIRED/);
  assert.match(stillDesign, /CREATIVE_STILL_IMAGE_WORKER_AUTHORITY_INVALID/);
  assert.match(designSpec, /CREATIVE_DESIGN_PRODUCTION_DESIGNER_DECISION_REQUIRED/);
});

test("perceptual art review cannot masquerade as final still quality", () => {
  assert.match(queue, /GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1/);
  assert.match(queue, /source_generation_node_id/);
  assert.match(queue, /return false;/);
});
