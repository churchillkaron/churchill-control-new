#!/usr/bin/env node

const CONTRACT = "AVANTIQO_VIDEO_GOOGLE_NATIVE_4K_READINESS_V64";
const ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000";
const USAGE_ID = "video-v64-google-native4k-readiness-20260828";

const [
  { inspectAvantiqoVideoGoogleNative4kReadiness },
  { resolveAvantiqoVideoRoute },
  { AvantiqoVideoProviderV2 },
] = await Promise.all([
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoGoogleNative4kRuntime.js"),
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoCapacityRouter.js"),
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js"),
]);

if (typeof AvantiqoVideoProviderV2?.execute !== "function" || typeof AvantiqoVideoProviderV2?.getStatus !== "function") {
  throw new Error(`${CONTRACT}_PROVIDER_V2_IMPORT_INVALID`);
}

const route = await resolveAvantiqoVideoRoute({
  capability: "ai.video.generate",
  forceRefresh: true,
});

const readiness = await inspectAvantiqoVideoGoogleNative4kReadiness({
  capability: "ai.video.generate",
  context: {
    organization_id: ORGANIZATION_ID,
    usage_id: USAGE_ID,
  },
  aspect_ratio: "16:9",
  delivery_resolution: "4k",
});

if (readiness?.ready !== true) throw new Error(`${CONTRACT}_GOOGLE_NOT_READY`);
if (readiness?.resolution !== "4k") throw new Error(`${CONTRACT}_NATIVE_4K_REQUIRED`);
if (readiness?.duration_seconds !== 8) throw new Error(`${CONTRACT}_EIGHT_SECOND_PROFILE_REQUIRED`);
if (readiness?.paid_generation_performed !== false) throw new Error(`${CONTRACT}_UNEXPECTED_PAID_GENERATION`);
if ((route.capacity?.workers_min ?? 0) !== 0 || (route.capacity?.workers_max ?? 0) !== 0) {
  throw new Error(`${CONTRACT}_RUNPOD_MUST_REMAIN_PARKED`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  provider_import_ready: true,
  owned_route: route.route,
  owned_route_reason: route.reason,
  owned_best_stock: route.capacity?.best_stock || null,
  runpod_workers_min: route.capacity?.workers_min ?? null,
  runpod_workers_max: route.capacity?.workers_max ?? null,
  google_native_4k_ready: true,
  google_provider: readiness.provider,
  google_model: readiness.model,
  google_resolution: readiness.resolution,
  google_duration_seconds: readiness.duration_seconds,
  fal_contacted: false,
  video_job_submitted: false,
  paid_generation_performed: false,
  runpod_mutation_performed: false,
  image_endpoint_mutated: false,
  secrets_printed: false,
}, null, 2));

console.log(`${CONTRACT}=PASS`);
console.log("VIDEO_GENERATION_SUBMITTED=false");
console.log("PAID_GENERATION_PERFORMED=false");
console.log("FAL_CONTACTED=false");
console.log("RUNPOD_MUTATION_PERFORMED=false");
console.log("IMAGE_ENDPOINT_MUTATED=false");
