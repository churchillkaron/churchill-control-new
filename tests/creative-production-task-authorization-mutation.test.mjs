import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../lib/operations/tasks/runtime/ProductionTaskRuntime.js", import.meta.url),
  "utf8",
);

test("generic task update cannot mutate execution authorization metadata", () => {
  assert.match(source, /PRODUCTION_TASK_AUTHORIZATION_METADATA_MUTATION_FORBIDDEN/);
  assert.match(source, /assertGenericAuthorizationMetadataUnchanged\(id, values\)/);
  assert.match(source, /production_dossier_gate_passed/);
});

test("unchanged authorization metadata is explicitly allowed to pass through", () => {
  assert.match(source, /sameValue\(metadata\[key\], current\.metadata\?\.\[key\]\)/);
});
test("privileged authorization path validates required evidence", () => {
  assert.match(source, /async updateAuthorizationEvidence\(id, values = \{\}\)/);
  assert.match(source, /PRODUCTION_TASK_AUTHORIZATION_COST_APPROVAL_REQUIRED/);
  assert.match(source, /PRODUCTION_TASK_AUTHORIZATION_DOSSIER_GATE_REQUIRED/);
  assert.match(source, /PRODUCTION_TASK_AUTHORIZATION_DOSSIER_MODE_REQUIRED/);
});

test("dossier runtimes use only the privileged authorization writer", () => {
  const gate = fs.readFileSync(new URL("../lib/creative/production/dossier/runtime/CreativeProductionDossierExecutionGate.js", import.meta.url), "utf8");
  const evidence = fs.readFileSync(new URL("../lib/creative/production/dossier/runtime/CreativeProductionDossierEvidenceRuntime.js", import.meta.url), "utf8");
  assert.match(gate, /ProductionTaskRuntime\.updateAuthorizationEvidence\(task\.id/);
  assert.match(evidence, /ProductionTaskRuntime\.updateAuthorizationEvidence\(task\.id/);
});
