import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  productionHandoffKey,
  CREATIVE_PRODUCTION_HANDOFF_IDENTITY_CONTRACT,
} from "../lib/creative/production-graph/runtime/CreativeProductionGraphHandoffIdentity.js";

function graph(overrides = {}) {
  return {
    organization_id: "org-a",
    creative_project_id: "project-a",
    metadata: {
      workflow_kind: "TEMPORAL",
      master_plan_hash: "master-a",
      production_room_entry_gate: { rehearsal_digest: "rehearsal-a" },
      ...(overrides.metadata || {}),
    },
    ...overrides,
  };
}

test("same sealed production handoff has deterministic identity", () => {
  const a = productionHandoffKey(graph());
  const b = productionHandoffKey(graph());
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.equal(a, b);
  assert.equal(CREATIVE_PRODUCTION_HANDOFF_IDENTITY_CONTRACT, "CREATIVE_PRODUCTION_HANDOFF_IDENTITY_V1");
});

test("new master or rehearsal creates a new production identity", () => {
  const base = productionHandoffKey(graph());
  assert.notEqual(base, productionHandoffKey(graph({ metadata: { workflow_kind: "TEMPORAL", master_plan_hash: "master-b", production_room_entry_gate: { rehearsal_digest: "rehearsal-a" } } })));
  assert.notEqual(base, productionHandoffKey(graph({ metadata: { workflow_kind: "TEMPORAL", master_plan_hash: "master-a", production_room_entry_gate: { rehearsal_digest: "rehearsal-b" } } })));
});

test("non-temporal or unsealed production has no handoff identity", () => {
  assert.equal(productionHandoffKey(graph({ metadata: { workflow_kind: "DOCUMENT", master_plan_hash: "master-a", production_room_entry_gate: { rehearsal_digest: "rehearsal-a" } } })), null);
  assert.equal(productionHandoffKey(graph({ metadata: { workflow_kind: "TEMPORAL", master_plan_hash: "master-a", production_room_entry_gate: {} } })), null);
});

test("database migration enforces one graph per handoff identity", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/20260911133500_creative_production_graph_handoff_idempotency.sql", import.meta.url), "utf8");
  assert.match(sql, /create unique index if not exists creative_production_graphs_handoff_uidx/i);
  assert.match(sql, /metadata->>'production_handoff_key'/);
});
