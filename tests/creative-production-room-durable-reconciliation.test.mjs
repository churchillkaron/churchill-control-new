import test from "node:test";
import assert from "node:assert/strict";

import { durablePipelineCompatible } from "../lib/creative/production-room/runtime/CreativeProductionRoomDurableReconciliationRuntime.js";

function pipeline(stages) {
  return { contract: "CREATIVE_PRODUCTION_ROOM_PIPELINE_V1", stages };
}

test("stale same-contract durable pipeline cannot replace stronger canonical upstream seals", () => {
  const seeded = pipeline([
    { id: "RESEARCH_ROOM", status: "SEALED", sealed_digest: "research-new" },
    { id: "CREATIVE_FLOOR", status: "SEALED", sealed_digest: "floor-new" },
    { id: "CONCEPT_COMPETITION", status: "SEALED", sealed_digest: "council-new" },
    { id: "TRIBUNAL", status: "SEALED", sealed_digest: "tribunal-new" },
  ]);
  const stale = pipeline([
    { id: "RESEARCH_ROOM", status: "READY" },
    { id: "CREATIVE_FLOOR", status: "BLOCKED" },
  ]);
  assert.equal(durablePipelineCompatible(stale, seeded), false);
});

test("matching durable upstream chain remains reusable", () => {
  const seeded = pipeline([
    { id: "RESEARCH_ROOM", status: "SEALED", sealed_digest: "research" },
    { id: "CREATIVE_FLOOR", status: "SEALED", sealed_digest: "floor" },
  ]);
  const durable = pipeline([
    { id: "RESEARCH_ROOM", status: "SEALED", sealed_digest: "research" },
    { id: "CREATIVE_FLOOR", status: "SEALED", sealed_digest: "floor" },
    { id: "TECHNICAL_SCOUT", status: "SEALED", sealed_digest: "scout" },
  ]);
  assert.equal(durablePipelineCompatible(durable, seeded), true);
});

test("changed canonical upstream digest invalidates downstream durable reuse", () => {
  const seeded = pipeline([{ id: "RESEARCH_ROOM", status: "SEALED", sealed_digest: "research-v2" }]);
  const durable = pipeline([{ id: "RESEARCH_ROOM", status: "SEALED", sealed_digest: "research-v1" }]);
  assert.equal(durablePipelineCompatible(durable, seeded), false);
});
