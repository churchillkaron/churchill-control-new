import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = "scripts/provision-avantiqo-video-production-endpoint-v53-local.mjs";

function replaceExactlyOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`AVANTIQO_VIDEO_V58_SOURCE_TRANSFORM_${label}_MISMATCH:occurrences=${count}`);
  }
  return source.replace(search, replacement);
}

let source = await readFile(resolve(process.cwd(), BASE), "utf8");

source = replaceExactlyOnce(
  source,
  `function activeManagementWorkers(endpoint = {}) {\n  return list(endpoint.workers).filter((worker) => {\n    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();\n    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();\n    const effective = desired || status;\n    return Boolean(effective && !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(effective));\n  }).length;\n}\n\nfunction assertResting(label, endpoint, health) {\n  const queue = queueSummary(health);\n  const workerTotal = Object.values(queue.workers).reduce((sum, value) => sum + finite(value, 0), 0);\n  const management = activeManagementWorkers(endpoint);\n  if (queue.jobs.in_queue !== 0 || queue.jobs.in_progress !== 0 || workerTotal !== 0 || management !== 0) {\n    throw new Error(\`\${label}_NOT_RESTING:queue=\${queue.jobs.in_queue}:progress=\${queue.jobs.in_progress}:workers=\${workerTotal}:management=\${management}\`);\n  }\n  return { queue, management_non_exited_workers: management };\n}`,
  `function activeManagementWorkerRows(endpoint = {}) {\n  return list(endpoint.workers).filter((worker) => {\n    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();\n    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();\n    const effective = desired || status;\n    return Boolean(effective && !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(effective));\n  });\n}\n\nfunction activeManagementWorkers(endpoint = {}) {\n  return activeManagementWorkerRows(endpoint).length;\n}\n\nfunction managementHourlyCost(endpoint = {}) {\n  return activeManagementWorkerRows(endpoint).reduce(\n    (sum, worker) => sum + Math.max(0, finite(worker?.adjustedCostPerHr ?? worker?.costPerHr, 0)),\n    0,\n  );\n}\n\nfunction assertResting(label, endpoint, health) {\n  const queue = queueSummary(health);\n  const queueWorkerCounter = Object.values(queue.workers).reduce((sum, value) => sum + finite(value, 0), 0);\n  const management = activeManagementWorkers(endpoint);\n  const hourlyCostUsd = managementHourlyCost(endpoint);\n  if (queue.jobs.in_queue !== 0 || queue.jobs.in_progress !== 0 || management !== 0 || hourlyCostUsd !== 0) {\n    throw new Error(\`\${label}_NOT_RESTING:queue=\${queue.jobs.in_queue}:progress=\${queue.jobs.in_progress}:queue_health_workers=\${queueWorkerCounter}:management=\${management}:management_hourly_cost_usd=\${hourlyCostUsd}\`);\n  }\n  return {\n    queue,\n    queue_health_worker_counter: queueWorkerCounter,\n    queue_health_worker_counter_authoritative_for_billing: false,\n    management_non_exited_workers: management,\n    management_hourly_cost_usd: hourlyCostUsd,\n    billing_worker_source: "RUNPOD_MANAGEMENT_ENDPOINT_WORKERS",\n    safe_lease_semantics_aligned: true,\n  };\n}`,
  "SAFE_LEASE_IDLE_ACCOUNTING",
);

source = replaceExactlyOnce(
  source,
  `    volumeInGb: Math.max(0, finite(baseTemplate?.volumeInGb, 0)),\n`,
  ``,
  "REMOVE_SERVERLESS_TEMPLATE_VOLUME_IN_GB",
);

source = replaceExactlyOnce(
  source,
  `    volumeInGb: finite(template.volumeInGb, 0),\n`,
  ``,
  "IGNORE_SERVERLESS_TEMPLATE_VOLUME_IN_GB_IN_CONTRACT",
);

source = replaceExactlyOnce(
  source,
  `  await rest(\`/endpoints/\${encodeURIComponent(createdEndpointId)}\`, managementKey, {\n    method: "PATCH",\n    body: { allowedCudaVersions },\n  });\n\n  const verified = await fetchEndpointEventually(createdEndpointId, managementKey);`,
  `  const targetGpuTypeIds = list(certification?.gpuTypeIds).map(text).filter(Boolean);\n  const targetNetworkVolumeIds = endpointVolumeIds(certification);\n\n  await rest(\`/endpoints/\${encodeURIComponent(createdEndpointId)}\`, managementKey, {\n    method: "PATCH",\n    body: {\n      gpuTypeIds: targetGpuTypeIds,\n      networkVolumeIds: targetNetworkVolumeIds,\n    },\n  });\n\n  const placementVerified = await fetchEndpointEventually(createdEndpointId, managementKey);\n  if (!sameOrdered(placementVerified?.gpuTypeIds, targetGpuTypeIds)) {\n    throw new Error(\`\${CONTRACT}_POST_CREATE_GPU_PLACEMENT_VERIFY_FAILED\`);\n  }\n  if (!sameSet(endpointVolumeIds(placementVerified), targetNetworkVolumeIds)) {\n    throw new Error(\`\${CONTRACT}_POST_CREATE_CACHE_VOLUME_VERIFY_FAILED:\${JSON.stringify(endpointVolumeIds(placementVerified))}\`);\n  }\n  if (finite(placementVerified?.workersMin, -1) !== WORKERS_MIN || finite(placementVerified?.workersMax, -1) !== WORKERS_MAX) {\n    throw new Error(\`\${CONTRACT}_POST_CREATE_SCALING_DRIFT:\${finite(placementVerified?.workersMin)}/\${finite(placementVerified?.workersMax)}\`);\n  }\n\n  await rest(\`/endpoints/\${encodeURIComponent(createdEndpointId)}\`, managementKey, {\n    method: "PATCH",\n    body: { allowedCudaVersions },\n  });\n\n  const verified = await fetchEndpointEventually(createdEndpointId, managementKey);`,
  "POST_CREATE_MULTI_REGION_PLACEMENT_THEN_CUDA",
);

source = replaceExactlyOnce(
  source,
  `  const verifiedTemplate = object(verified?.template);\n  if (Object.keys(verifiedTemplate).length && text(verifiedTemplate.imageName) !== image.image) {\n    throw new Error(\`\${CONTRACT}_VERIFIED_IMAGE_MISMATCH\`);\n  }`,
  `  const verifiedTemplate = await rest(\`/templates/\${encodeURIComponent(productionTemplateId)}\`, managementKey);\n  if (text(verifiedTemplate?.id) !== productionTemplateId) {\n    throw new Error(\`\${CONTRACT}_FULL_TEMPLATE_ID_MISMATCH\`);\n  }\n  if (text(verifiedTemplate?.imageName) !== image.image) {\n    throw new Error(\`\${CONTRACT}_FULL_TEMPLATE_IMAGE_MISMATCH:\${text(verifiedTemplate?.imageName) || "MISSING"}\`);\n  }`,
  "VERIFY_IMMUTABLE_IMAGE_FROM_FULL_TEMPLATE_RECORD",
);

source = replaceExactlyOnce(
  source,
  `    production_template: safeTemplate(Object.keys(verifiedTemplate).length ? verifiedTemplate : productionTemplate),`,
  `    production_template: safeTemplate(verifiedTemplate),`,
  "REPORT_FULL_VERIFIED_TEMPLATE",
);

source = replaceExactlyOnce(
  source,
  `    creation_transport: "RUNPOD_GRAPHQL_SAVE_ENDPOINT",\n    network_volume_input_shape: "OBJECTS",\n    cuda_patch_transport: "RUNPOD_REST_PATCH",`,
  `    creation_transport: "RUNPOD_GRAPHQL_SAVE_ENDPOINT",\n    create_network_volume_input_shape: "OBJECTS",\n    post_create_multi_region_placement_transport: "RUNPOD_REST_PATCH",\n    post_create_network_volume_input_shape: "STRING_IDS",\n    post_create_gpu_pool_reasserted: true,\n    immutable_image_verification_source: "FULL_TEMPLATE_REST_RECORD",\n    idle_billing_verification_source: "RUNPOD_MANAGEMENT_ENDPOINT_WORKERS",\n    queue_health_worker_counter_role: "DIAGNOSTIC_ONLY",\n    safe_lease_idle_accounting_aligned: true,\n    cuda_patch_transport: "RUNPOD_REST_PATCH",`,
  "RESULT_SAFE_LEASE_ACCOUNTING_AND_TRANSPORT",
);

source = source.replaceAll("V53", "V58");
if (source.includes("V53")) {
  throw new Error("AVANTIQO_VIDEO_V58_SOURCE_TRANSFORM_V53_REMAINS");
}

console.log(`AVANTIQO_VIDEO_V58_SOURCE_TRANSFORM_ACTIVE=${JSON.stringify({
  base: BASE,
  fixes: [
    "OMIT_VOLUME_IN_GB_FROM_SERVERLESS_TEMPLATE",
    "POST_CREATE_REASSERT_FULL_GPU_POOL_AND_TWO_NETWORK_VOLUMES_VIA_PROVEN_REST_PATCH",
    "PATCH_ALLOWED_CUDA_VERSIONS_AFTER_PLACEMENT",
    "VERIFY_IMMUTABLE_V4_IMAGE_FROM_FULL_TEMPLATE_REST_RECORD",
    "USE_SAFE_LEASE_MANAGEMENT_WORKERS_AND_HOURLY_COST_AS_IDLE_BILLING_AUTHORITY",
    "KEEP_QUEUE_HEALTH_WORKER_COUNTER_DIAGNOSTIC_ONLY",
  ],
  idle_pass_requires: {
    jobs_in_queue: 0,
    jobs_in_progress: 0,
    management_active_workers: 0,
    management_hourly_cost_usd: 0,
  },
  queue_health_worker_counter_authoritative_for_billing: false,
  workers_min: 0,
  workers_max: 1,
  generation_submitted: false,
  inference_performed: false,
  model_download_performed: false,
  safe_lease_changed: false,
  image_endpoint_changed: false,
})}`);

const encoded = Buffer.from(source, "utf8").toString("base64");
await import(`data:text/javascript;base64,${encoded}`);
