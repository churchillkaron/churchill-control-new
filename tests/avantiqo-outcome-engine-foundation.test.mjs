import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoOutcomeEngineRuntime.js", import.meta.url),
  "utf8",
);
const api = fs.readFileSync(
  new URL("../app/api/platform/intelligence/outcomes/route.js", import.meta.url),
  "utf8",
);
const registry = fs.readFileSync(
  new URL("../lib/platform/registry/erpRegistry.base.js", import.meta.url),
  "utf8",
);
const workspace = fs.readFileSync(
  new URL("../components/workspace/analytics/outcomes/OutcomeEngineWorkspace.jsx", import.meta.url),
  "utf8",
);
test("Outcome Engine is organization scoped and permission gated", () => {
  assert.match(api, /requireOrganizationAccess/);
  assert.match(api, /finance\.receivables\.view/);
  assert.match(api, /finance\.payables\.view/);
  assert.match(runtime, /eq\("organization_id", organizationId\)/);
});

test("first Outcome Engine slice is proposal-only and cannot execute mutations", () => {
  assert.match(runtime, /execution_mode: "PROPOSAL_ONLY"/);
  assert.match(runtime, /execution_allowed: false/);
  assert.match(runtime, /authority_effect: "NONE"/);
  assert.match(workspace, /no business mutation is authorized/i);
});

test("Money Leak Hunter has deterministic overdue receivable and duplicate vendor invoice detectors", () => {
  assert.match(runtime, /OVERDUE_RECEIVABLE/);
  assert.match(runtime, /POSSIBLE_DUPLICATE_VENDOR_INVOICE/);
  assert.match(runtime, /This is a review candidate, not a duplicate conclusion/);
});

test("Outcome Engine is registered in canonical Analytics workspace", () => {
  assert.match(registry, /id: "outcome_engine"/);
  assert.match(registry, /route: "\/analytics\/outcomes"/);
  assert.match(registry, /analytics_outcome_engine/);
});
