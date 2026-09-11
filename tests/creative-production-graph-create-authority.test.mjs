import test from "node:test";
import assert from "node:assert/strict";

import {
  assertTemporalProductionHandoff,
} from "../lib/creative/production-graph/runtime/CreativeProductionGraphHandoffIdentity.js";

function graph(overrides = {}) {
  return {
    organization_id: "org-a",
    creative_project_id: "project-a",
    metadata: {
      workflow_kind: "TEMPORAL",
      master_plan_hash: "master-a",
      production_room_pipeline: {
        contract: "CREATIVE_PRODUCTION_ROOM_PIPELINE_V1",
        stages: [{ id: "VIRTUAL_REHEARSAL", status: "SEALED", sealed_digest: "rehearsal-a" }],
      },
      production_room_entry_gate: { passed: true, rehearsal_digest: "rehearsal-a" },
      ...overrides,
    },
  };
}
test("valid sealed temporal handoff is accepted", () => {
  assert.equal(assertTemporalProductionHandoff(graph()), true);
});

test("raw temporal graph cannot bypass production-room pipeline", () => {
  assert.throws(() => assertTemporalProductionHandoff(graph({ production_room_pipeline: null })), /PIPELINE_REQUIRED/);
});

test("unsealed virtual rehearsal cannot create temporal graph", () => {
  assert.throws(() => assertTemporalProductionHandoff(graph({ production_room_entry_gate: { passed: false } })), /VIRTUAL_REHEARSAL_GATE_REQUIRED/);
});

test("rehearsal digest must match sealed room lineage", () => {
  assert.throws(() => assertTemporalProductionHandoff(graph({ production_room_entry_gate: { passed: true, rehearsal_digest: "other" } })), /REHEARSAL_LINEAGE_MISMATCH/);
});

test("temporal graph requires master-plan lineage", () => {
  assert.throws(() => assertTemporalProductionHandoff(graph({ master_plan_hash: null })), /MASTER_PLAN_HASH_REQUIRED/);
});

test("non-temporal graph remains outside film rehearsal gate", () => {
  assert.equal(assertTemporalProductionHandoff({ metadata: { workflow_kind: "DOCUMENT" } }), true);
});
