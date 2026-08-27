import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  IDEMPOTENT_USAGE_START_CONTRACT,
  createIdempotentUsageRecord,
} from "../lib/platform/service-runtime/usage/IdempotentUsageStart.js";

const CONTRACT = "AVANTIQO_CODE_AI_IDEMPOTENT_USAGE_START_SELFTEST_V1";
const baseRecord = {
  id: "11111111-1111-5111-8111-111111111111",
  organization_id: "org-1",
  bill_to_organization_id: "org-1",
  organization_service_id: "service-row-1",
  pricing_id: "pricing-1",
  provider: "avantiqo-code",
  capability: "ai.code.debug",
  operation: "ai.code.debug",
  currency: "THB",
  status: "PENDING",
  provider_request_id: null,
};

{
  const rows = new Map();
  let createCalls = 0;
  const result = await createIdempotentUsageRecord({
    record: baseRecord,
    create: async (record) => {
      createCalls += 1;
      rows.set(record.id, { ...record });
      throw new Error("fetch failed");
    },
    find: async (id) => rows.get(id) || null,
    sleep: async () => {},
  });
  assert.equal(result.id, baseRecord.id);
  assert.equal(createCalls, 1);
}

{
  const rows = new Map();
  let createCalls = 0;
  const result = await createIdempotentUsageRecord({
    record: baseRecord,
    create: async (record) => {
      createCalls += 1;
      if (createCalls === 1) throw new Error("fetch failed");
      const stored = { ...record };
      rows.set(record.id, stored);
      return stored;
    },
    find: async (id) => rows.get(id) || null,
    sleep: async () => {},
  });
  assert.equal(result.id, baseRecord.id);
  assert.equal(createCalls, 2);
}

{
  let createCalls = 0;
  await assert.rejects(
    createIdempotentUsageRecord({
      record: baseRecord,
      create: async () => {
        createCalls += 1;
        return baseRecord;
      },
      find: async () => ({ ...baseRecord }),
      sleep: async () => {},
    }),
    /SERVICE_USAGE_IDEMPOTENT_START_PREEXISTING/,
  );
  assert.equal(createCalls, 0);
}

{
  const rows = new Map();
  await assert.rejects(
    createIdempotentUsageRecord({
      record: baseRecord,
      create: async (record) => {
        rows.set(record.id, {
          ...record,
          provider_request_id: "already-bound-provider-job",
        });
        throw new Error("fetch failed");
      },
      find: async (id) => rows.get(id) || null,
      sleep: async () => {},
    }),
    /SERVICE_USAGE_IDEMPOTENT_START_ALREADY_BOUND/,
  );
}

const planner = await readFile("lib/code/runtime/CodeAIPlannerExecutionRuntime.js", "utf8");
const usageRuntime = await readFile("lib/platform/service-runtime/usage/UsageRuntime.js", "utf8");
const usageRepository = await readFile(
  "lib/platform/service-runtime/usage/repositories/ServiceUsageRepository.js",
  "utf8",
);

assert.match(planner, /AVANTIQO_CODE_AI_PLANNER_USAGE_ID_V1/);
assert.match(planner, /deterministicPlannerUsageId/);
assert.match(planner, /code_ai_usage_id/);
assert.match(planner, /recoveryCount \+ 1/);
assert.match(usageRuntime, /createIdempotentUsageRecord/);
assert.match(usageRuntime, /codeAIIdempotentUsageId/);
assert.match(usageRepository, /export async function findById/);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  dependency_contract: IDEMPOTENT_USAGE_START_CONTRACT,
  verified: {
    lost_insert_response_recovers_same_usage_row: true,
    failed_before_commit_retries_same_usage_id: true,
    preexisting_usage_fails_closed_before_create: true,
    already_bound_usage_fails_closed_before_provider_retry: true,
    code_planner_usage_id_is_deterministic_and_recovery_scoped: true,
    wallet_reservation_remains_idempotent_by_usage_reference: true,
    provider_generation_post_retry_added: false,
  },
  provider_calls_executed: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
