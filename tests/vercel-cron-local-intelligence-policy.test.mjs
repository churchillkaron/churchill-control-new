import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  runWithScheduledExecutionComputePolicy,
  scheduledExecutionComputePolicy,
} from "../lib/platform/service-runtime/policy/ScheduledExecutionComputePolicyRuntime.js";

function source(path) { return fs.readFileSync(path, "utf8"); }

test("configured Vercel cron routes are local-policy guarded or explicitly retired", () => {
  const vercel = JSON.parse(source("vercel.json"));
  assert.ok(vercel.crons.length > 0);
  for (const cron of vercel.crons) {
    const pathname = new URL(cron.path, "https://avantiqo.local").pathname;
    const routePath = `app${pathname}/route.js`;
    assert.equal(fs.existsSync(routePath), true, `missing cron route ${cron.path}`);
    const route = source(routePath);
    const retired = /RETIRED/.test(route) && /status:\s*410/.test(route);
    if (retired) {
      assert.doesNotMatch(route, /executeProvider|runWithScheduledExecutionComputePolicy/, `retired cron must not execute compute ${cron.path}`);
    } else {
      assert.match(route, /runCronRouteLocalFirst/, `active cron route not locally guarded ${cron.path}`);
    }
  }
});

test("scheduled compute policy is request scoped and forbids external intelligence fallback", async () => {
  assert.equal(scheduledExecutionComputePolicy(), null);
  await runWithScheduledExecutionComputePolicy(async () => {
    const policy = scheduledExecutionComputePolicy();
    assert.equal(policy.scheduled_execution, true);
    assert.equal(policy.local_intelligence_required, true);
    assert.equal(policy.external_intelligence_fallback_allowed, false);
  });
  assert.equal(scheduledExecutionComputePolicy(), null);
});

test("owned Intelligence is fail-closed local-only for scheduled and interactive execution", () => {
  const provider = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js");
  assert.match(provider, /executeHierarchicalLocalIntelligence/);
  assert.match(provider, /executeIntelligenceLocalQueue/);
  assert.match(provider, /executeIntelligenceLocal/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED/);
  assert.doesNotMatch(provider, /executeIntelligenceModalDirect|import\(.+ModalDirect|return executeIntelligenceModal/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_MODAL_JOB_PREFIX = null/);
});

test("owned Intelligence routing stays entirely inside local hierarchy queue and LAN paths", () => {
  const provider = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js");
  const hierarchicalIndex = provider.indexOf("shouldUseHierarchicalLocalIntelligence(input)");
  const queueIndex = provider.indexOf("shouldUseLocalIntelligenceQueue(input)");
  const lanIndex = provider.indexOf("shouldUseLocalIntelligence(input)");
  const failClosedIndex = provider.indexOf("AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED");
  assert.ok(hierarchicalIndex >= 0 && queueIndex > hierarchicalIndex && lanIndex > queueIndex && failClosedIndex > lanIndex);
  assert.doesNotMatch(provider, /Modal|modal/);
});

test("local Intelligence settlement needs no provider credential and is owned by the local queue runtime", () => {
  const executor = source("lib/platform/service-runtime/providers/ProviderExecutorCore.js");
  const queue = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js");
  const provider = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js");
  assert.match(executor, /function settlementCredentialRequired\(provider, jobId\)/);
  assert.match(executor, /if \(provider === "avantiqo-intelligence"\) return false/);
  assert.match(queue, /const JOB_PREFIX = "local-intelligence:"/);
  assert.match(queue, /getIntelligenceLocalQueueStatus/);
  assert.match(queue, /cancelIntelligenceLocalQueue/);
  assert.match(provider, /isIntelligenceLocalQueueJob/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_JOB_ID_REQUIRED/);
});
