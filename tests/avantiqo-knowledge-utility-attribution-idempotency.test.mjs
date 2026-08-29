import assert from "node:assert/strict";
import test from "node:test";

import {
  AVANTIQO_KNOWLEDGE_UTILITY_ATTRIBUTION_CONTRACT,
  recordAvantiqoKnowledgeUtilityObservation,
} from "../lib/intelligence/runtime/AvantiqoKnowledgeUtilityAttributionRuntime.js";

function fakeDatabase() {
  const state = {
    table: null,
    rows: new Map(),
    upsert_count: 0,
    insert_count: 0,
    on_conflict: null,
  };
  const client = {
    from(table) {
      state.table = table;
      const writeResult = (row) => ({
        select() {
          return {
            async single() {
              return {
                data: {
                  id: `row-${row.memory_key}`,
                  subject: row.subject,
                  metadata: row.metadata,
                  created_at: row.updated_at,
                  updated_at: row.updated_at,
                },
                error: null,
              };
            },
          };
        },
      });
      return {
        upsert(row, options) {
          state.upsert_count += 1;
          state.on_conflict = options?.onConflict || null;
          state.rows.set(row.memory_key, row);
          return writeResult(row);
        },
        insert(row) {
          state.insert_count += 1;
          state.rows.set(row.memory_key, row);
          return writeResult(row);
        },
      };
    },
  };
  return { client, state };
}

function explicitReuseDecision() {
  return {
    knowledge_reuse: {
      reused: true,
      reason: "VERIFIED_CODE_MISSION_REUSED_SHARED_KNOWLEDGE",
      knowledge: [
        {
          id: "released-knowledge-1",
          authority: "HYBRID_VERIFIED_PLATFORM_KNOWLEDGE",
          provenance: {
            topic_key: "code:shared-runtime:reuse",
          },
        },
      ],
    },
    evidence_graph: {
      checked: true,
      block_knowledge_reuse: false,
    },
  };
}

function verifiedExecution() {
  return {
    status: "completed",
    capability: {
      key: "platform.code_ai_autonomous.execute",
      mode: "write",
    },
    post_action_verification: {
      status: "completed",
    },
  };
}

test("deterministic observation key makes repeated utility recording idempotent", async () => {
  const previousLearningOrganization = process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID;
  process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID =
    "11111111-1111-4111-8111-111111111111";
  try {
    const database = fakeDatabase();
    const observationKey =
      "verified-code-knowledge-utility:platform.code_ai_autonomous.execute:mission-1:" +
      "a".repeat(40);

    const first = await recordAvantiqoKnowledgeUtilityObservation({
      decision: explicitReuseDecision(),
      execution: verifiedExecution(),
      observation_key: observationKey,
      database: database.client,
    });
    const second = await recordAvantiqoKnowledgeUtilityObservation({
      decision: explicitReuseDecision(),
      execution: verifiedExecution(),
      observation_key: observationKey,
      database: database.client,
    });

    assert.equal(first.contract, AVANTIQO_KNOWLEDGE_UTILITY_ATTRIBUTION_CONTRACT);
    assert.equal(first.written, true);
    assert.equal(second.written, true);
    assert.equal(first.idempotent_observation, true);
    assert.equal(second.idempotent_observation, true);
    assert.equal(first.memory_key, second.memory_key);
    assert.equal(first.observation_key_fingerprint, second.observation_key_fingerprint);
    assert.equal(database.state.table, "intelligence_memories");
    assert.equal(database.state.rows.size, 1);
    assert.equal(database.state.upsert_count, 2);
    assert.equal(database.state.insert_count, 0);
    assert.equal(
      database.state.on_conflict,
      "organization_id,memory_scope,memory_key",
    );
    const row = [...database.state.rows.values()][0];
    assert.equal(row.memory_scope, "platform_learning_knowledge_utility");
    assert.equal(row.metadata.idempotent_observation, true);
    assert.equal(row.metadata.relationship, "OBSERVATIONAL_ASSOCIATION_ONLY");
    assert.equal(row.metadata.causal_attribution_allowed, false);
    assert.equal(row.metadata.raw_reasoning_persisted, false);
    assert.equal(row.metadata.automatic_training_effect, "NONE");
    assert.equal(row.metadata.production_model_promotion_effect, "NONE");
  } finally {
    if (previousLearningOrganization === undefined) {
      delete process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID;
    } else {
      process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID =
        previousLearningOrganization;
    }
  }
});

test("legacy recorder behavior remains non-idempotent when no observation key is supplied", async () => {
  const previousLearningOrganization = process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID;
  process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID =
    "11111111-1111-4111-8111-111111111111";
  try {
    const database = fakeDatabase();
    const result = await recordAvantiqoKnowledgeUtilityObservation({
      decision: explicitReuseDecision(),
      execution: verifiedExecution(),
      database: database.client,
    });

    assert.equal(result.written, true);
    assert.equal(result.idempotent_observation, false);
    assert.equal(result.observation_key_fingerprint, null);
    assert.equal(database.state.insert_count, 1);
    assert.equal(database.state.upsert_count, 0);
  } finally {
    if (previousLearningOrganization === undefined) {
      delete process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID;
    } else {
      process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID =
        previousLearningOrganization;
    }
  }
});
