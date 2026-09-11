import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../lib/creative/production-graph/runtime/ProductionGraphRuntime.js", import.meta.url),
  "utf8",
);

test("ordinary graph create forbids approved lifecycle states", () => {
  assert.match(source, /PRODUCTION_GRAPH_APPROVAL_CREATE_FORBIDDEN/);
  assert.match(source, /status === "APPROVED"/);
  assert.match(source, /status === "IN_PRODUCTION"/);
  assert.match(source, /status === "COMPLETED"/);
});

test("ordinary graph create forbids approved cost", () => {
  assert.match(source, /PRODUCTION_GRAPH_COST_APPROVAL_CREATE_FORBIDDEN/);
  assert.match(source, /costPlan\.approved === true/);
  assert.match(source, /Number\(costPlan\.approved_cost \|\| 0\) > 0/);
});
test("ordinary graph create reserves approval metadata", () => {
  assert.match(source, /PRODUCTION_GRAPH_APPROVAL_METADATA_CREATE_FORBIDDEN/);
  for (const key of [
    "production_approval_contract",
    "approved_cost_ceiling",
    "production_dossier_human_approved",
  ]) assert.match(source, new RegExp(key));
});

test("PLANNED remains a valid non-approved creation state", () => {
  const start = source.indexOf("function assertGraphApprovalAbsentOnCreate");
  const end = source.indexOf("function assertGenericGraphApprovalMutationAllowed");
  const guard = source.slice(start, end);
  assert.doesNotMatch(guard, /status === "PLANNED"/);
});
