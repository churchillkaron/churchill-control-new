import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../scripts/plan-avantiqo-owned-media-promotion.mjs", import.meta.url),
  "utf8",
);

test("owned media promotion plan requires all 15 capabilities", () => {
  assert.match(source, /capability_count !== 15/);
  assert.match(source, /EXPECTED_IMAGE_CAPABILITIES/);
  assert.match(source, /EXPECTED_VIDEO_CAPABILITIES/);
  assert.match(source, /ai\.image\.analyze/);
  assert.match(source, /ai\.video\.lipsync/);
});

test("owned media promotion plan validates model license and exact capability compatibility", () => {
  assert.match(source, /AVANTIQO_OWNED_MODEL_CATALOG/);
  assert.match(source, /license_verified === true/);
  assert.match(source, /runtime_compatible === true/);
  assert.match(source, /capabilities\?\.includes\(capability\)/);
  assert.match(source, /MODEL_NOT_APPROVED_FOR_CAPABILITY/);
});

test("owned media promotion plan requires mechanics economics and human review evidence", () => {
  assert.match(source, /MECHANICAL_CERTIFICATION_REQUIRED/);
  assert.match(source, /ECONOMICS_EVIDENCE_REQUIRED/);
  assert.match(source, /HUMAN_QUALITY_CERTIFICATION_REQUIRED/);
  assert.match(source, /HUMAN_REVIEW_PASS_REQUIRED/);
  assert.match(source, /OUTPUT_EVIDENCE_REQUIRED/);
});

test("owned media promotion plan emits exact runtime certification metadata", () => {
  assert.match(source, /pricing_status: "PRODUCTION_CERTIFIED"/);
  assert.match(source, /human_quality_certified: true/);
  assert.match(source, /human_quality_evidence_contract/);
  assert.match(source, /certified_capability: capability/);
  assert.match(source, /certified_model: model/);
  assert.match(source, /human_quality_reviewer: reviewer/);
  assert.match(source, /human_quality_reviewed_at/);
});

test("owned media promotion planning is non-mutating and cannot auto-activate", () => {
  assert.match(source, /mutation_performed: false/);
  assert.match(source, /pricing_mutation_performed: false/);
  assert.match(source, /provider_configuration_mutation_performed: false/);
  assert.match(source, /production_deployment_performed: false/);
  assert.match(source, /activation_performed: false/);
  assert.match(source, /manual_explicit_promotion_required: true/);
  assert.match(source, /automatic_activation_forbidden: true/);
});
