import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  runWithScheduledExecutionComputePolicy,
  scheduledExecutionComputePolicy,
} from "../lib/platform/service-runtime/policy/ScheduledExecutionComputePolicyRuntime.js";

function source(path) { return fs.readFileSync(path, "utf8"); }

test("configured AI and Operator crons enter the local-first scheduled compute policy", () => {
  const guarded = [
    "app/api/internal/intelligence/continuous-learning/process/route.js",
    "app/api/internal/operator/autonomous-watch/process/route.js",
  ];
  for (const routePath of guarded) {
    assert.equal(fs.existsSync(routePath), true, `missing guarded cron route ${routePath}`);
    assert.match(source(routePath), /runCronRouteLocalFirst/);
  }

  const settlement = source("app/api/internal/finance/payment-settlement/process/route.js");
  assert.doesNotMatch(settlement, /ServiceExecutionRuntime|avantiqo-intelligence/);
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

test("owned intelligence routing is local-only", () => {
  const provider = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js");
  assert.match(provider, /executeHierarchicalLocalIntelligence/);
  assert.match(provider, /executeIntelligenceLocalQueue/);
  assert.match(provider, /executeIntelligenceLocal/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED/);
  assert.doesNotMatch(provider, /Modal|RunPod|runpod/);
});

test("local queue settlement never requires external compute credentials", () => {
  const executor = source("lib/platform/service-runtime/providers/ProviderExecutorCore.js");
  assert.match(executor, /settlementCredentialRequired/);
  assert.match(executor, /if \(provider === "avantiqo-intelligence"\) return false/);
});
