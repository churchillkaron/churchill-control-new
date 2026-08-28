import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  decideAvantiqoVideoRoute,
} from "../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoCapacityRouter.js";

function capacity({
  role = "PRODUCTION",
  workersMax = 1,
  workerTotal = 0,
  managementWorkers = 0,
  stockRank = 0,
  stock = "UNAVAILABLE",
  visible = true,
} = {}) {
  return {
    endpoint_role: role,
    workers_max: workersMax,
    active_management_workers: managementWorkers,
    management_capacity_visible: visible,
    best_stock_rank: stockRank,
    best_stock: stock,
    health: { worker_total: workerTotal },
  };
}

test("certification endpoint is never customer routed even with a worker", () => {
  const result = decideAvantiqoVideoRoute({
    capability: "ai.video.generate",
    capacity: capacity({ role: "CERTIFICATION", workersMax: 1, workerTotal: 1, stockRank: 4, stock: "HIGH" }),
    fallbackReady: true,
  });
  assert.equal(result.route, "MANAGED_FALLBACK");
  assert.equal(result.reason, "OWNED_CERTIFICATION_ENDPOINT_INTERNAL_ONLY");
});

test("production endpoint with an allocated worker remains an owned candidate", () => {
  const result = decideAvantiqoVideoRoute({
    capability: "ai.video.generate",
    capacity: capacity({ workerTotal: 1, stockRank: 2, stock: "LOW" }),
    fallbackReady: true,
  });
  assert.equal(result.route, "OWNED");
  assert.equal(result.reason, "OWNED_PRODUCTION_WORKER_ALREADY_ALLOCATED");
});

test("production endpoint with MEDIUM stock uses owned Video", () => {
  const result = decideAvantiqoVideoRoute({
    capability: "ai.video.generate",
    capacity: capacity({ stockRank: 3, stock: "MEDIUM" }),
    fallbackReady: true,
  });
  assert.equal(result.route, "OWNED");
  assert.equal(result.runpod_lease_required, false);
});

test("production endpoint with HIGH stock uses owned Video", () => {
  const result = decideAvantiqoVideoRoute({
    capability: "ai.video.image_to_video",
    capacity: capacity({ stockRank: 4, stock: "HIGH" }),
    fallbackReady: true,
  });
  assert.equal(result.route, "OWNED");
});

test("parked production endpoint with MEDIUM stock is leaseable owned capacity", () => {
  const result = decideAvantiqoVideoRoute({
    capability: "ai.video.generate",
    capacity: capacity({ workersMax: 0, stockRank: 3, stock: "MEDIUM" }),
    fallbackReady: true,
  });
  assert.equal(result.route, "OWNED");
  assert.equal(result.reason, "OWNED_PRODUCTION_PARKED_LEASEABLE_MEDIUM_STOCK");
  assert.equal(result.runpod_lease_required, true);
});

test("parked production endpoint with HIGH stock is leaseable owned capacity", () => {
  const result = decideAvantiqoVideoRoute({
    capability: "ai.video.image_to_video",
    capacity: capacity({ workersMax: 0, stockRank: 4, stock: "HIGH" }),
    fallbackReady: true,
  });
  assert.equal(result.route, "OWNED");
  assert.equal(result.reason, "OWNED_PRODUCTION_PARKED_LEASEABLE_HIGH_STOCK");
  assert.equal(result.runpod_lease_required, true);
});

test("LOW stock bypasses blind RunPod queue and uses managed fallback even when parked", () => {
  const result = decideAvantiqoVideoRoute({
    capability: "ai.video.generate",
    capacity: capacity({ workersMax: 0, stockRank: 2, stock: "LOW" }),
    fallbackReady: true,
  });
  assert.equal(result.route, "MANAGED_FALLBACK");
  assert.equal(result.reason, "OWNED_CAPACITY_LOW_ONLY");
  assert.equal(result.runpod_lease_required, false);
});

test("unavailable stock uses managed fallback", () => {
  const result = decideAvantiqoVideoRoute({
    capability: "ai.video.generate",
    capacity: capacity({ workersMax: 0 }),
    fallbackReady: true,
  });
  assert.equal(result.route, "MANAGED_FALLBACK");
  assert.equal(result.reason, "OWNED_CAPACITY_UNAVAILABLE");
});

test("no usable owned backend and no fallback fails closed", () => {
  const result = decideAvantiqoVideoRoute({
    capability: "ai.video.generate",
    capacity: capacity({ workersMax: 0 }),
    fallbackReady: false,
  });
  assert.equal(result.route, "UNAVAILABLE");
});

test("Video workflow requires 4K mastering and never persists the prompt", async () => {
  const source = await readFile(
    new URL("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoWorkflowRuntime.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /AVANTIQO_VIDEO_ROUTED_MASTERING_WORKFLOW_V1/);
  assert.match(source, /process\.env\.AVANTIQO_VIDEO_MASTER_RESOLUTION \|\| "4k"/);
  assert.match(source, /target_resolution: state\.master_resolution/);
  assert.match(source, /enhancement_preset: "aigc"/);
  assert.match(source, /prompt_persisted: false/);
  assert.match(source, /AVANTIQO_VIDEO_NO_RUNNABLE_BACKEND/);
});

test("owned Video generation is bounded by a durable RunPod lease", async () => {
  const source = await readFile(
    new URL("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoWorkflowRuntime.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /acquireVideoRunpodWebLease/);
  assert.match(source, /refreshVideoRunpodWebLease/);
  assert.match(source, /releaseVideoRunpodWebLease/);
  assert.match(source, /OWNED_LEASE_TTL_SECONDS = 1800/);
  assert.match(source, /OWNED_LEASE_UNAVAILABLE_USE_FALLBACK/);
  assert.match(source, /VIDEO_OWNED_GENERATION_COMPLETED_BEFORE_MASTERING/);
  assert.match(source, /state\.runpod_lease_active = false/);
  assert.match(source, /state\.stage = "MASTERING_SUBMITTING"/);
});

test("Video web lease enforces canonical zero-idle Safe Lease limits", async () => {
  const source = await readFile(
    new URL("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoRunpodLeaseRuntime.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /AVANTIQO_RUNPOD_SAFE_LEASE_V2/);
  assert.match(source, /MAX_CONCURRENT_PAID_LEASES = 4/);
  assert.match(source, /MAX_ACCOUNT_HOURLY_USD = 16/);
  assert.match(source, /MAX_WORKER_HOURLY_USD = 10/);
  assert.match(source, /TARGET_MUST_START_0_0/);
  assert.match(source, /patchScaling\(endpointId, 1\)/);
  assert.match(source, /patchScaling\(endpointId, 0\)/);
  assert.match(source, /VIDEO_WEB_LEASE_OPEN_FAILED/);
});

test("global Safe Lease protects active distributed Video leases from orphan reaping", async () => {
  const source = await readFile(
    new URL("../scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /listActiveVideoRunpodDistributedLeases/);
  assert.match(source, /distributedVideoLeases/);
  assert.match(source, /\.\.\.distributedVideoLeases\.map\(\(lease\) => lease\.endpoint_id\)/);
  assert.match(source, /\.\.\.state\.distributedVideoLeases\.map\(\(entry\) => entry\.endpoint_id\)/);
});

test("Video distributed lease migration is service-role only and single-lane", async () => {
  const source = await readFile(
    new URL("../supabase/migrations/20260828015200_avantiqo_video_runpod_lease.sql", import.meta.url),
    "utf8",
  );
  assert.match(source, /avantiqo_video_runpod_leases/);
  assert.match(source, /lane in \('cinema-production'\)/);
  assert.match(source, /one_active_endpoint_idx/);
  assert.match(source, /one_active_lane_idx/);
  assert.match(source, /revoke all on table public\.avantiqo_video_runpod_leases from public, anon, authenticated/);
  assert.match(source, /grant select, insert, update, delete on table public\.avantiqo_video_runpod_leases to service_role/);
});

test("Video provider advertises delivery masters, not 720p delivery", async () => {
  const source = await readFile(
    new URL("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /internal_foundation_resolutions: \["720p"\]/);
  assert.match(source, /supported_resolutions: \["1080p", "2k", "4k"\]/);
  assert.match(source, /default_delivery_resolution: "4k"/);
  assert.match(source, /warm_worker_required: false/);
  assert.match(source, /managed_supplier_fallback_internal_only: true/);
});

test("owned Video transport targets the explicit production endpoint when configured", async () => {
  const source = await readFile(
    new URL("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProvider.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID/);
  assert.match(source, /const endpointId = productionEndpointId \|\| certificationEndpointId/);
  assert.match(source, /const endpointRole = productionEndpointId \? "PRODUCTION" : "CERTIFICATION"/);
});
