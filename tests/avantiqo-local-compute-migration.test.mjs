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

test("local queue runtime is pull-based and keeps deep outside RTX 2060 lane", () => {
  const runtime = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js");
  assert.match(runtime, /supabase-pull-queue-v1/);
  assert.match(runtime, /LANES = new Set\(\["front", "fast"\]\)/);
  assert.doesNotMatch(runtime, /LANES = new Set\([^\n]*deep/);
  assert.match(runtime, /avantiqo_local_compute_jobs/);
  assert.match(runtime, /local-intelligence:/);
  assert.match(runtime, /front_task_mode/);
  assert.match(runtime, /max_output_tokens/);
  assert.match(runtime, /temperature/);
  assert.match(runtime, /response_format/);
  assert.match(runtime, /executionLane === "front" \? 640 : 4096/);
});
test("Administration exposes Modal-like owned compute observability", () => {
  const route = source("app/api/workspace/administration/compute/route.js");
  const page = source("app/(system)/workspace/[organizationId]/administration/compute/page.jsx");
  const command = source("components/workspace/administration/AdministrationCommandCenter.jsx");
  parse(page, { sourceType: "module", plugins: ["jsx"] });
  assert.match(route, /avantiqo_local_compute_nodes/);
  assert.match(route, /avantiqo_local_compute_jobs/);
  assert.match(route, /LOCAL_FIRST/);
  assert.match(route, /MODAL/);
  assert.match(page, /Avantiqo Compute Control/);
  assert.match(page, /VRAM/);
  assert.match(page, /Local models/);
  assert.match(page, /Compute jobs/);
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
