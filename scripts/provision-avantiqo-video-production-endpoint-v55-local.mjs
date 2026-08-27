import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = "scripts/provision-avantiqo-video-production-endpoint-v53-local.mjs";

function replaceExactlyOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`AVANTIQO_VIDEO_V55_SOURCE_TRANSFORM_${label}_MISMATCH:occurrences=${count}`);
  }
  return source.replace(search, replacement);
}

let source = await readFile(resolve(process.cwd(), BASE), "utf8");

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
  `    creation_transport: "RUNPOD_GRAPHQL_SAVE_ENDPOINT",\n    network_volume_input_shape: "OBJECTS",\n    cuda_patch_transport: "RUNPOD_REST_PATCH",`,
  `    creation_transport: "RUNPOD_GRAPHQL_SAVE_ENDPOINT",\n    create_network_volume_input_shape: "OBJECTS",\n    post_create_multi_region_placement_transport: "RUNPOD_REST_PATCH",\n    post_create_network_volume_input_shape: "STRING_IDS",\n    post_create_gpu_pool_reasserted: true,\n    cuda_patch_transport: "RUNPOD_REST_PATCH",`,
  "RESULT_PLACEMENT_TRANSPORT",
);

source = source.replaceAll("V53", "V55");
if (source.includes("V53")) {
  throw new Error("AVANTIQO_VIDEO_V55_SOURCE_TRANSFORM_V53_REMAINS");
}

console.log(`AVANTIQO_VIDEO_V55_SOURCE_TRANSFORM_ACTIVE=${JSON.stringify({
  base: BASE,
  fixes: [
    "OMIT_VOLUME_IN_GB_FROM_SERVERLESS_TEMPLATE",
    "POST_CREATE_REASSERT_FULL_GPU_POOL_AND_TWO_NETWORK_VOLUMES_VIA_PROVEN_REST_PATCH",
    "PATCH_ALLOWED_CUDA_VERSIONS_AFTER_PLACEMENT",
  ],
  placement_basis: "AVANTIQO_VIDEO_MULTI_REGION_RUNTIME_PROOF_V40",
  network_volume_attachment_layer: "ENDPOINT",
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
