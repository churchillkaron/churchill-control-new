import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parse } from "@babel/parser";

function source(path) {
  return fs.readFileSync(path, "utf8");
}

test("owned intelligence prefers durable local queue before direct LAN or Modal", () => {
  const provider = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js");
  assert.match(provider, /shouldUseLocalIntelligenceQueue/);
  assert.match(provider, /executeIntelligenceLocalQueue/);
  assert.match(provider, /isIntelligenceLocalQueueJob/);
  assert.match(provider, /getIntelligenceLocalQueueStatus/);
  assert.match(provider, /cancelIntelligenceLocalQueue/);
  assert.ok(provider.indexOf("shouldUseLocalIntelligenceQueue") < provider.indexOf("shouldUseLocalIntelligence(input)"));
});

test("local queue runtime is pull-based and supports front fast and deep locally", () => {
  const runtime = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js");
  assert.match(runtime, /supabase-pull-queue-v1/);
  assert.match(runtime, /LANES = new Set\(\["front", "fast", "deep"\]\)/);
  assert.match(runtime, /avantiqo_local_compute_jobs/);
  assert.match(runtime, /local-intelligence:/);
  assert.match(runtime, /front_task_mode/);
  assert.match(runtime, /max_output_tokens/);
  assert.match(runtime, /temperature/);
  assert.match(runtime, /response_format/);
  assert.match(runtime, /localOutputTokenCap\(executionLane\)/);
});
test("Administration exposes owned local compute observability", () => {
  const route = source("app/api/workspace/administration/compute/route.js");
  const page = source("app/(system)/workspace/[organizationId]/administration/compute/page.jsx");
  const command = source("components/workspace/administration/AdministrationCommandCenter.jsx");
  parse(page, { sourceType: "module", plugins: ["jsx"] });
  assert.match(route, /avantiqo_local_compute_nodes/);
  assert.match(route, /avantiqo_local_compute_jobs/);
  assert.match(route, /LOCAL_FIRST/);
  assert.match(page, /Avantiqo Compute Control/);
  assert.match(page, /VRAM/);
  assert.match(page, /Local models/);
  assert.match(page, /Production jobs/);
  assert.match(page, /Certification & migration/);
  assert.match(page, /Failure reason/);
  assert.match(page, /Date & time/);
  assert.match(page, /Asia\/Bangkok/);
  assert.match(page, /productionJobs/);
  assert.match(route, /classifyLocalJob/);
  assert.match(route, /operational_success_rate/);
  assert.match(command, /route: "\/administration\/compute"/);
});

test("local queue settlement does not require Modal credential resolution", () => {
  const executor = source("lib/platform/service-runtime/providers/ProviderExecutorCore.js");
  assert.match(executor, /settlementCredentialRequired/);
  assert.match(executor, /local-intelligence:/);
  assert.match(executor, /settlementCredentialRequired\(provider, job_id\)/);
});

test("compute observability is restricted to platform operators", () => {
  const route = source("app/api/workspace/administration/compute/route.js");
  assert.match(route, /PLATFORM_OWNER/);
  assert.match(route, /SUPER_ADMIN/);
  assert.match(route, /Platform operator access required/);
  assert.match(route, /\.eq\("organization_id", access\.organizationId\)/);
});

test("local worker migration keeps production switch explicit", () => {
  const runtime = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js");
  assert.match(runtime, /AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED/);
  assert.match(runtime, /AVANTIQO_LOCAL_FAST_INTELLIGENCE_ENABLED/);
});


test("local Qwen routing refuses requests that exceed the active 20000-token runtime envelope", () => {
  const queueRuntime = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js");
  const lanRuntime = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalRuntime.js");
  const policy = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalPolicy.js");
  assert.match(policy, /LOCAL_CONTEXT_TOKENS = 20000/);
  assert.match(policy, /LOCAL_CONTEXT_SAFETY_TOKENS = 384/);
  for (const runtime of [queueRuntime, lanRuntime]) {
    assert.match(runtime, /localIntelligenceContextFits/);
    assert.match(runtime, /estimatedPromptTokens/);
    assert.match(runtime, /requestedOutputTokens/);
    assert.match(runtime, /localOutputTokenCap/);
    assert.match(runtime, /if \(requested > localOutputTokenCap\(lane\)\) return false/);
  }
});


test("worker uses the certified 20000-token Qwen context", () => {
  const worker = source("scripts/local-node/avantiqo-node01-worker.ps1");
  const localRuntime = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalRuntime.js");
  assert.match(worker, /\$ContextTokens = 20000/);
  assert.match(worker, /num_ctx\s*=\s*\$ContextTokens/);
  assert.match(localRuntime, /num_ctx: LOCAL_CONTEXT_TOKENS/);
});


test("reasoning service capability normalizes to the executable local text capability", () => {
  const runtime = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js");
  assert.match(runtime, /capability: isCodeConversationTask\(input, executionLane\) \? "ai\.code\.live-conversation" : "ai\.text\.generate"/);
  assert.match(runtime, /service_capability: text\(input\.capability\) \|\| null/);
  assert.match(runtime, /capability: text\(input\.capability\)/);
});


test("owned local Qwen pricing is selected before reservation only when local compute is ready", () => {
  const execution = source("lib/platform/service-runtime/execution/ServiceExecutionRuntime.js");
  const resolver = source("lib/platform/service-runtime/providers/ProviderResolver.js");
  const catalog = source("lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js");
  const migration = source("supabase/migrations/20260917084500_avantiqo_local_qwen4b_zero_pricing.sql");
  const supplierExempt = source("supabase/migrations/20260917085000_avantiqo_local_qwen4b_supplier_exempt_zero_cost.sql");
  assert.match(execution, /intelligencePricingPolicy/);
  assert.match(execution, /getIntelligenceLocalQueueHealth/);
  assert.match(execution, /getProviderPricing/);
  assert.match(execution, /localPricing\?\.active === true/);
  assert.match(execution, /benchmarkLocalPreview/);
  assert.match(execution, /localLaneEligible/);
  assert.match(execution, /\["front", "fast", "deep"\]\.includes\(intelligenceLane\)/);
  assert.match(execution, /allowed_models: \[AVANTIQO_INTELLIGENCE_LOCAL_MODEL\]/);
  assert.match(execution, /blocked_models:/);
  assert.match(resolver, /function modelAllowed/);
  assert.match(resolver, /MODEL_POLICY_REJECTED/);
  assert.match(catalog, /Qwen\/Qwen3-4B-GGUF:Q4_K_M/);
  assert.match(migration, /AVANTIQO_OWNED_ZERO_MARGINAL_V1/);
  assert.match(migration, /'allow_zero_price',\s*true/);
  assert.match(migration, /ai.reasoning.execute/);
  assert.match(migration, /ai.text.generate/);
  assert.match(migration, /MARKET_PARITY_READY/);
  assert.match(migration, /OWNED_INTELLIGENCE_LOCAL_QWEN4B_V1/);
  assert.match(migration, /active, capability/);
  assert.match(supplierExempt, /supplier_billing_required/);
  assert.match(supplierExempt, /provider_supplier_account_verification_required/);
  assert.match(supplierExempt, /active = false/);
});


test("owned intelligence execution is local-only across eligible lanes", () => {
  const provider = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js");
  assert.match(provider, /shouldUseLocalIntelligenceQueue\(input\)/);
  assert.match(provider, /shouldUseLocalIntelligence\(input\)/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED/);
  assert.doesNotMatch(provider, /ModalDirect|executeIntelligenceModalDirect/);
});


test("Node 01 heartbeat refreshes the capability advertisement instead of leaving registration stale", () => {
  const migration = source("supabase/migrations/20260917163255_refresh_local_compute_heartbeat_capabilities.sql");
  assert.match(migration, /capabilities = v_capabilities/);
  assert.match(migration, /cardinality\(p_capabilities\) < 1/);
  assert.match(migration, /cardinality\(p_capabilities\) > 128/);
  assert.match(migration, /select distinct btrim\(c\) as capability/);
  assert.match(migration, /AVANTIQO_LOCAL_NODE_CAPABILITIES_INVALID/);
  assert.match(migration, /AVANTIQO_LOCAL_NODE_CAPABILITY_INVALID/);
});
