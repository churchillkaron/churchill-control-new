import assert from "node:assert/strict";
import test from "node:test";

import {
  AVANTIQO_LEARNING_HEALTH_CONTRACT,
  deriveAvantiqoLearningHealth,
} from "../lib/intelligence/runtime/AvantiqoLearningHealthPolicy.js";

const NOW = new Date("2026-09-03T07:00:00.000Z");
const ORG = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";

function derive(overrides = {}) {
  return deriveAvantiqoLearningHealth({
    learningEnabled: true,
    organizationId: ORG,
    staleHours: 6,
    now: NOW,
    activeAgenda: 8,
    dueAgenda: 0,
    errorAgenda: 0,
    activeKnowledge: 2,
    trainingCandidates: 4,
    latestRun: {
      updated_at: "2026-09-03T06:30:00.000Z",
      subject: "verification patterns",
      metadata: { status: "COMPLETED" },
    },
    ...overrides,
  });
}

test("disabled learning can never report healthy", () => {
  const health = derive({ learningEnabled: false });
  assert.equal(health.contract, AVANTIQO_LEARNING_HEALTH_CONTRACT);
  assert.equal(health.status, "DISABLED");
  assert.equal(health.operational, false);
  assert.equal(health.success, false);
  assert.equal(health.action_required, "SET_AVANTIQO_CONTINUOUS_LEARNING_ENABLED");
});

test("missing learning organization is non-operational", () => {
  const health = derive({ organizationId: "" });
  assert.equal(health.status, "ORGANIZATION_NOT_CONFIGURED");
  assert.equal(health.operational, false);
  assert.equal(
    health.action_required,
    "SET_AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID",
  );
});

test("fresh due work is surfaced without declaring a stall", () => {
  const health = derive({ dueAgenda: 3 });
  assert.equal(health.status, "LEARNING_DUE");
  assert.equal(health.operational, true);
  assert.equal(health.success, true);
});

test("overdue learning without a recent successful run is stalled", () => {
  const health = derive({
    dueAgenda: 2,
    latestRun: {
      updated_at: "2026-09-02T20:00:00.000Z",
      subject: "workflow learning",
      metadata: { status: "COMPLETED" },
    },
  });
  assert.equal(health.status, "STALLED");
  assert.equal(health.operational, false);
  assert.equal(health.action_required, "RESTORE_CONTINUOUS_LEARNING_PROGRESS");
});

test("agenda errors with due work are treated as stalled even when recent", () => {
  const health = derive({ dueAgenda: 1, errorAgenda: 1 });
  assert.equal(health.status, "STALLED");
  assert.equal(health.operational, false);
});

test("training candidates without reusable knowledge are not considered healthy", () => {
  const health = derive({ activeKnowledge: 0, trainingCandidates: 7 });
  assert.equal(health.status, "KNOWLEDGE_BASE_EMPTY");
  assert.equal(health.operational, true);
  assert.equal(health.knowledge.empty_despite_candidates, true);
  assert.equal(health.action_required, "ADVANCE_GOVERNED_KNOWLEDGE_PROMOTION");
});

test("healthy learning requires no stall and a reusable knowledge base", () => {
  const health = derive();
  assert.equal(health.status, "HEALTHY");
  assert.equal(health.operational, true);
  assert.equal(health.success, true);
  assert.equal(health.action_required, null);
});
