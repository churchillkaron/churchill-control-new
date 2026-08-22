import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  gate,
  graphRuntime,
  specificationRuntime,
  taskInputRuntime,
  productionRuntime,
  workflowRegistry,
] = await Promise.all([
  readFile("lib/creative/execution/runtime/CreativeCapabilityOnlyProductionTaskGate.js", "utf8"),
  readFile("lib/creative/design/runtime/CreativeDesignGraphRuntime.js", "utf8"),
  readFile("lib/creative/design/runtime/CreativeDesignSpecificationRuntime.js", "utf8"),
  readFile("lib/creative/design/runtime/CreativeDesignTaskInputRuntime.js", "utf8"),
  readFile("lib/creative/design/runtime/CreativeDesignProductionTaskRuntime.js", "utf8"),
  readFile("lib/creative/director/registry/CreativeWorkflowRegistry.js", "utf8"),
]);

test("Creative Partner installs autonomous design graph enrichment", () => {
  assert.match(gate, /CreativeDesignGraphRuntime/);
  assert.match(gate, /CreativeDesignTaskInputRuntime/);
  assert.match(gate, /local_design_graph_enrichment_installed:\s*true/);
  assert.match(gate, /local_design_task_input_normalization_installed:\s*true/);
});

test("poster banner menu brochure workflows are routed through universal design-capable workflows", () => {
  assert.match(workflowRegistry, /aliases:\s*Object\.freeze\(\["STILL", "IMAGE", "POSTER", "BANNER", "BANNER_SET"\]\)/);
  assert.match(workflowRegistry, /aliases:\s*Object\.freeze\(\["DOCUMENT", "MENU", "PRESENTATION", "REPORT", "BROCHURE"\]\)/);
  assert.match(specificationRuntime, /new Set\(\["STILL", "DOCUMENT"\]\)/);
});

test("design specification is authored from approved director authority without templates or provider selection", () => {
  assert.match(specificationRuntime, /creative_master_plan_hash/);
  assert.match(specificationRuntime, /art_direction_id/);
  assert.match(specificationRuntime, /brand_direction_id/);
  assert.match(specificationRuntime, /copy_direction_id/);
  assert.match(specificationRuntime, /Do not use a fixed poster\/menu\/brochure template/);
  assert.match(specificationRuntime, /Do not choose AI providers/);
  assert.match(specificationRuntime, /Never invent a logo, font, price, product, date, legal fact/);
  assert.match(specificationRuntime, /composeCreativeDesignDocument/);
});

test("planned compose nodes receive the autonomous structured design specification", () => {
  assert.match(graphRuntime, /capability === "creative\.design\.compose"/);
  assert.match(graphRuntime, /design_specification:\s*design\.specification/);
  assert.match(graphRuntime, /design_specification_hash:\s*design\.specification_hash/);
  assert.match(graphRuntime, /CreativeDesignSpecificationRuntime\.create/);
});

test("governed data envelopes reach deterministic data binding", () => {
  assert.match(graphRuntime, /capability === "creative\.design\.data\.bind"/);
  assert.match(graphRuntime, /governed_sources:\s*sources/);
  assert.match(taskInputRuntime, /requirements\.governed_sources/);
  assert.match(taskInputRuntime, /normalized\.input\.governed_sources/);
  assert.match(productionRuntime, /bindCreativeDesignDocument/);
});

test("compose remains a local deterministic production capability", () => {
  assert.match(productionRuntime, /id === "creative\.design\.compose"/);
  assert.match(productionRuntime, /composeCreativeDesignDocument/);
  assert.match(productionRuntime, /provider:\s*"avantiqo-local-design-worker"/);
  assert.match(productionRuntime, /settlement:\s*"LOCAL_EXECUTION"/);
  assert.match(productionRuntime, /wallet_charge_required:\s*false/);
});
