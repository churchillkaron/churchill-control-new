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

test("production endpoint with an allocated worker uses owned Video", () => {
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
});

test("production endpoint with HIGH stock uses owned Video", () => {
  const result = decideAvantiqoVideoRoute({
    capability: "ai.video.image_to_video",
    capacity: capacity({ stockRank: 4, stock: "HIGH" }),
    fallbackReady: true,
  });
  assert.equal(result.route, "OWNED");
});

test("LOW stock bypasses blind RunPod queue and uses managed fallback", () => {
  const result = decideAvantiqoVideoRoute({
    capability: "ai.video.generate",
    capacity: capacity({ stockRank: 2, stock: "LOW" }),
    fallbackReady: true,
  });
  assert.equal(result.route, "MANAGED_FALLBACK");
  assert.equal(result.reason, "OWNED_CAPACITY_LOW_ONLY");
});

test("unavailable stock uses managed fallback", () => {
  const result = decideAvantiqoVideoRoute({
    capability: "ai.video.generate",
    capacity: capacity(),
    fallbackReady: true,
  });
  assert.equal(result.route, "MANAGED_FALLBACK");
  assert.equal(result.reason, "OWNED_CAPACITY_UNAVAILABLE");
});

test("production endpoint that cannot scale is not customer runnable", () => {
  const result = decideAvantiqoVideoRoute({
    capability: "ai.video.generate",
    capacity: capacity({ workersMax: 0, stockRank: 4, stock: "HIGH" }),
    fallbackReady: true,
  });
  assert.equal(result.route, "MANAGED_FALLBACK");
  assert.equal(result.reason, "OWNED_PRODUCTION_ENDPOINT_CANNOT_SCALE");
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
