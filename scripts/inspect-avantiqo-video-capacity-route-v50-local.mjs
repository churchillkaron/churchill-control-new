import {
  resolveAvantiqoVideoRoute,
} from "../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoCapacityRouter.js";

function safeCapacity(capacity = null) {
  if (!capacity) return null;
  return {
    endpoint_id_present: Boolean(capacity.endpoint_id),
    endpoint_role: capacity.endpoint_role || null,
    workers_min: capacity.workers_min ?? null,
    workers_max: capacity.workers_max ?? null,
    active_management_workers: capacity.active_management_workers ?? 0,
    best_stock: capacity.best_stock || "UNAVAILABLE",
    best_stock_rank: capacity.best_stock_rank ?? 0,
    eligible_data_center_ids: Array.isArray(capacity.eligible_data_center_ids)
      ? capacity.eligible_data_center_ids
      : [],
    configured_gpu_type_ids: Array.isArray(capacity.configured_gpu_type_ids)
      ? capacity.configured_gpu_type_ids
      : [],
    health: capacity.health || null,
    stock_rows: Array.isArray(capacity.stock_rows)
      ? capacity.stock_rows.map((row) => ({
          data_center_id: row.data_center_id || null,
          gpu_type_id: row.gpu_type_id || null,
          memory_gb: row.memory_gb ?? null,
          available: row.available === true,
          stock: row.stock || "UNAVAILABLE",
        }))
      : [],
  };
}

const capability = process.argv.includes("--i2v")
  ? "ai.video.image_to_video"
  : "ai.video.generate";

const result = await resolveAvantiqoVideoRoute({
  capability,
  forceRefresh: true,
});

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_VIDEO_CAPACITY_ROUTE_INSPECTION_V1",
  capability,
  route_contract: result.contract,
  route: result.route,
  reason: result.reason,
  fallback_ready: result.fallback_ready === true,
  cache_hit: result.cache_hit === true,
  capacity: safeCapacity(result.capacity),
  capacity_error: result.capacity_error || null,
  video_job_submitted: false,
  inference_performed: false,
  endpoint_mutation_performed: false,
  worker_mutation_performed: false,
  model_download_performed: false,
  storage_mutation_performed: false,
  secrets_printed: false,
}, null, 2));

console.log("AVANTIQO_VIDEO_CAPACITY_ROUTE_INSPECTION_V1=PASS");
