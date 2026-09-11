import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const graphRuntime = fs.readFileSync(
  new URL("../lib/creative/production-graph/runtime/ProductionGraphRuntime.js", import.meta.url),
  "utf8",
);
const approvalWriter = fs.readFileSync(
  new URL("../lib/creative/production-graph/runtime/CreativeProductionGraphApprovalMutationRuntime.js", import.meta.url),
  "utf8",
);
const approvalRuntime = fs.readFileSync(
  new URL("../lib/creative/release/runtime/CreativeApprovalRuntime.js", import.meta.url),
  "utf8",
);

test("generic graph update forbids APPROVED status", () => {
  assert.match(graphRuntime, /nextStatus === "APPROVED"/);
  assert.match(graphRuntime, /PRODUCTION_GRAPH_APPROVAL_MUTATION_FORBIDDEN/);
});
test("generic graph update forbids cost approval", () => {
  assert.match(graphRuntime, /nextCost\.approved === true/);
  assert.match(graphRuntime, /PRODUCTION_GRAPH_COST_APPROVAL_MUTATION_FORBIDDEN/);
});

test("generic graph update reserves approval metadata", () => {
  for (const key of [
    "production_approval_contract",
    "approved_cost_ceiling",
    "production_dossier_human_approved",
  ]) assert.match(graphRuntime, new RegExp(key));
});

test("dedicated graph approval writer validates evidence", () => {
  assert.match(approvalWriter, /PRODUCTION_GRAPH_APPROVAL_STATUS_REQUIRED/);
  assert.match(approvalWriter, /PRODUCTION_GRAPH_APPROVED_COST_REQUIRED/);
  assert.match(approvalWriter, /PRODUCTION_GRAPH_APPROVAL_EVIDENCE_REQUIRED/);
});

test("creative approval uses dedicated graph approval writer", () => {
  assert.match(approvalRuntime, /CreativeProductionGraphApprovalMutationRuntime\.approve/);
  assert.doesNotMatch(approvalRuntime, /ProductionGraphRepository\.update\(graph\.id/);
});
