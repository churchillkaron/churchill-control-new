import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  runWithScheduledExecutionComputePolicy,
  scheduledExecutionComputePolicy,
} from "../lib/platform/service-runtime/policy/ScheduledExecutionComputePolicyRuntime.js";

function source(path) { return fs.readFileSync(path, "utf8"); }

test("all configured Vercel cron routes enter local-first scheduled compute policy", () => {
  const vercel = JSON.parse(source("vercel.json"));
  assert.ok(vercel.crons.length > 0);
  for (const cron of vercel.crons) {
    const pathname = new URL(cron.path, "https://avantiqo.local").pathname;
    const routePath = `app${pathname}/route.js`;
    assert.equal(fs.existsSync(routePath), true, `missing cron route ${cron.path}`);
    assert.match(source(routePath), /runCronRouteLocalFirst/, `cron route not guarded ${cron.path}`);
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

test("scheduled intelligence provider is fail-closed before Modal fallback", () => {
  const provider = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js");
  assert.match(provider, /scheduledExecutionRequiresLocalIntelligence\(\)/);
  assert.match(provider, /AVANTIQO_SCHEDULED_INTELLIGENCE_LOCAL_COMPUTE_REQUIRED/);
  const queueIndex = provider.indexOf("shouldUseLocalIntelligenceQueue(input)");
  const lanIndex = provider.indexOf("shouldUseLocalIntelligence(input)");
  const scheduledGuardIndex = provider.indexOf("AVANTIQO_SCHEDULED_INTELLIGENCE_LOCAL_COMPUTE_REQUIRED");
  const modalIndex = provider.indexOf("return executeIntelligenceModalDirect(input)");
  assert.ok(queueIndex >= 0 && lanIndex > queueIndex && scheduledGuardIndex > lanIndex && modalIndex > scheduledGuardIndex);
});

test("owned intelligence routing prefers local queue and local LAN before Modal", () => {
  const provider = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js");
  assert.match(provider, /executeIntelligenceLocalQueue/);
  assert.match(provider, /executeIntelligenceLocal/);
  assert.match(provider, /executeIntelligenceModalDirect/);
});

test("local queue settlement never requires Modal credentials", () => {
  const executor = source("lib/platform/service-runtime/providers/ProviderExecutorCore.js");
  assert.match(executor, /settlementCredentialRequired/);
  assert.match(executor, /local-intelligence:/);
});
