import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = "scripts/run-avantiqo-video-eu-ro1-runtime-proof-v38-local.mjs";

function replaceExactlyOnce(source, search, replacement, label) {
  const parts = source.split(search);
  if (parts.length !== 2) throw new Error(`AVANTIQO_VIDEO_V40_SOURCE_TRANSFORM_${label}_MISMATCH:occurrences=${parts.length - 1}`);
  return parts[0] + replacement + parts[1];
}

function replaceExactlyCount(source, search, replacement, expected, label) {
  const occurrences = source.split(search).length - 1;
  if (occurrences !== expected) throw new Error(`AVANTIQO_VIDEO_V40_SOURCE_TRANSFORM_${label}_MISMATCH:occurrences=${occurrences}:expected=${expected}`);
  return source.replaceAll(search, replacement);
}

const major = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(major) || major < 20) {
  throw new Error(`AVANTIQO_VIDEO_V40_NODE20_REQUIRED:${process.version}`);
}

let source = await readFile(resolve(process.cwd(), BASE), "utf8");
source = source.replaceAll("V38", "V40");
source = source.replaceAll("AVANTIQO_VIDEO_EU_RO1_RUNTIME_PROOF_V40", "AVANTIQO_VIDEO_MULTI_REGION_RUNTIME_PROOF_V40");
if (source.includes("V38")) throw new Error("AVANTIQO_VIDEO_V40_SOURCE_TRANSFORM_VERSION_REMAINS");

source = replaceExactlyOnce(
  source,
  'if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`AVANTIQO_VIDEO_V40_NODE24_REQUIRED:${process.version}`);',
  'if (Number(process.versions.node.split(".")[0]) < 20) throw new Error(`AVANTIQO_VIDEO_V40_NODE20_REQUIRED:${process.version}`);',
  "NODE_GATE",
);

source = replaceExactlyOnce(
  source,
  '  const [sourceVolume, destinationVolume, live] = await Promise.all([\n    rest(`/networkvolumes/${SOURCE_VOLUME_ID}`, managementKey),\n    rest(`/networkvolumes/${DESTINATION_VOLUME_ID}`, managementKey),\n    selectLiveEuBlackwell(managementKey, original.gpu_type_ids),\n  ]);',
  '  const [sourceVolume, destinationVolume, live] = await Promise.all([\n    rest(`/networkvolumes/${SOURCE_VOLUME_ID}`, managementKey),\n    rest(`/networkvolumes/${DESTINATION_VOLUME_ID}`, managementKey),\n    Promise.resolve({ selected: null, candidates: [] }),\n  ]);',
  "REMOVE_SINGLE_REGION_CAPACITY_DEPENDENCY",
);

source = replaceExactlyOnce(
  source,
  '  const targetPlacement = {\n    dataCenterIds: [DESTINATION_DC],\n    gpuTypeIds: [live.selected.gpu_type_id],\n    networkVolumeIds: [DESTINATION_VOLUME_ID],\n  };',
  '  const targetPlacement = {\n    gpuTypeIds: original.gpu_type_ids,\n    networkVolumeIds: original.network_volume_ids,\n  };',
  "MULTI_REGION_TARGET",
);

source = replaceExactlyOnce(
  source,
  '    if (!sameSet(pinnedPlacement.data_center_ids, [DESTINATION_DC])) throw new Error(`AVANTIQO_VIDEO_V40_DC_PIN_VERIFY_FAILED:${pinnedPlacement.data_center_ids.join("|")}`);\n    if (!sameSet(pinnedPlacement.gpu_type_ids, [live.selected.gpu_type_id])) throw new Error(`AVANTIQO_VIDEO_V40_GPU_PIN_VERIFY_FAILED:${pinnedPlacement.gpu_type_ids.join("|")}`);\n    if (!sameSet(pinnedPlacement.network_volume_ids, [DESTINATION_VOLUME_ID])) throw new Error(`AVANTIQO_VIDEO_V40_EU_ONLY_VOLUME_PIN_VERIFY_FAILED:${pinnedPlacement.network_volume_ids.join("|")}`);',
  '    if (!sameSet(pinnedPlacement.data_center_ids, original.data_center_ids)) throw new Error(`AVANTIQO_VIDEO_V40_DATACENTER_BASELINE_CHANGED:${pinnedPlacement.data_center_ids.join("|")}`);\n    if (!sameSet(pinnedPlacement.gpu_type_ids, original.gpu_type_ids)) throw new Error(`AVANTIQO_VIDEO_V40_CERTIFIED_GPU_POOL_VERIFY_FAILED:${pinnedPlacement.gpu_type_ids.join("|")}`);\n    if (!sameSet(pinnedPlacement.network_volume_ids, original.network_volume_ids)) throw new Error(`AVANTIQO_VIDEO_V40_MULTI_REGION_VOLUME_VERIFY_FAILED:${pinnedPlacement.network_volume_ids.join("|")}`);',
  "MULTI_REGION_VERIFY",
);

source = replaceExactlyOnce(
  source,
  '    console.log(`AVANTIQO_VIDEO_V40_DETERMINISTIC_PLACEMENT=${JSON.stringify({ datacenter: DESTINATION_DC, gpu_type_id: live.selected.gpu_type_id, network_volume_ids: [DESTINATION_VOLUME_ID] })}`);',
  '    console.log(`AVANTIQO_VIDEO_V40_MULTI_REGION_PLACEMENT=${JSON.stringify({ network_volume_ids: original.network_volume_ids, cached_datacenters: [text(sourceVolume.dataCenterId), text(destinationVolume.dataCenterId)], certified_gpu_pool: original.gpu_type_ids, scheduler_region_choice: "RUNPOD", constraint_source: "MULTI_VOLUME_MULTI_DATACENTER_HA" })}`);',
  "PLACEMENT_LOG",
);

source = replaceExactlyOnce(
  source,
  '    const submitted = await queue(CINEMA_ID, "/run", credential.key, { method: "POST", body: { input: { operation: "runtime_probe" } } });',
  '    let submitted = null;\n    let submitAttempt = 0;\n    const submitDeadline = Date.now() + 45_000;\n    while (!submitted) {\n      submitAttempt += 1;\n      const queueControlPlane = stablePlacement(await rest(`/endpoints/${CINEMA_ID}?includeTemplate=false&includeWorkers=false`, managementKey));\n      if (queueControlPlane.workers_min !== 0 || queueControlPlane.workers_max !== 1) {\n        throw new Error(`AVANTIQO_VIDEO_V40_QUEUE_CONTROL_PLANE_LEASE_STATE_INVALID:${queueControlPlane.workers_min}/${queueControlPlane.workers_max}`);\n      }\n      try {\n        submitted = await queue(CINEMA_ID, "/run", credential.key, { method: "POST", body: { input: { operation: "runtime_probe" } } });\n      } catch (error) {\n        const message = redact(error?.message || error);\n        const retryablePaused = message.startsWith("AVANTIQO_VIDEO_V40_HTTP_409:") && /Endpoint is paused/i.test(message) && /max_workers=0/i.test(message);\n        if (!retryablePaused) throw error;\n        if (Date.now() >= submitDeadline) {\n          throw new Error(`AVANTIQO_VIDEO_V40_QUEUE_CONTROL_PLANE_PROPAGATION_TIMEOUT:attempts=${submitAttempt}:${message}`);\n        }\n        console.log(`AVANTIQO_VIDEO_V40_QUEUE_CONTROL_PLANE_PROPAGATION_WAIT=${JSON.stringify({ attempt: submitAttempt, rest_workers_min: queueControlPlane.workers_min, rest_workers_max: queueControlPlane.workers_max, queue_reported_max_workers: 0, retry_in_ms: 1500 })}`);\n        await sleep(1_500);\n      }\n    }\n    console.log(`AVANTIQO_VIDEO_V40_RUNTIME_PROBE_ACCEPTED=${JSON.stringify({ submit_attempts: submitAttempt, queue_control_plane_propagation_retry_used: submitAttempt > 1 })}`);',
  "QUEUE_CONTROL_PLANE_PROPAGATION_RETRY",
);

source = replaceExactlyOnce(
  source,
  '    selected_eu_ro1_gpu: live.selected,\n    live_eu_ro1_candidates: live.candidates,',
  '    single_region_gpu_selector_used: false,\n    cached_datacenters: [text(sourceVolume.dataCenterId), text(destinationVolume.dataCenterId)],\n    scheduler_gpu_pool: original.gpu_type_ids,',
  "RESULT_CAPACITY_FIELDS",
);

source = replaceExactlyOnce(
  source,
  '      mechanism: "CONTROL_PLANE_SINGLE_DATACENTER_SINGLE_GPU_SINGLE_EU_RO1_VOLUME",',
  '      mechanism: "CONTROL_PLANE_MULTI_REGION_TWO_CACHED_VOLUMES_CERTIFIED_BLACKWELL_POOL",',
  "PROOF_MECHANISM",
);

source = replaceExactlyOnce(
  source,
  '    target_datacenter: DESTINATION_DC,\n    placement_strategy: "TEMPORARY_EU_RO1_ONLY_VOLUME_PLUS_LIVE_CERTIFIED_BLACKWELL_PIN_INSIDE_SAFE_LEASE",\n    temporary_network_volume_ids: [DESTINATION_VOLUME_ID],',
  '    target_datacenters: ["US-NC-2", DESTINATION_DC],\n    placement_strategy: "PRODUCTION_MULTI_REGION_TWO_CACHED_VOLUMES_PLUS_FULL_CERTIFIED_BLACKWELL_POOL",\n    temporary_network_volume_ids: [SOURCE_VOLUME_ID, DESTINATION_VOLUME_ID],\n    queue_control_plane_propagation_retry: "BOUNDED_45_SECONDS_EXACT_409_PAUSED_ONLY",',
  "PLAN_STRATEGY",
);

source = replaceExactlyCount(
  source,
  '    worker_metadata_schema_dependency: false,',
  '    worker_metadata_schema_dependency: false,\n    single_region_gpu_pin_dependency: false,\n    multi_region_cached_volume_scheduling: true,\n    runtime_region_selected_by_runpod: true,',
  2,
  "PROOF_METADATA",
);

console.log(`AVANTIQO_VIDEO_V40_SOURCE_TRANSFORM_ACTIVE=${JSON.stringify({ node: process.version, base: BASE, proof_basis: "PRODUCTION_MULTI_REGION_CACHED_VOLUME_SCHEDULING", queue_control_plane_propagation_retry: "EXACT_409_PAUSED_BOUNDED_45S", mutation_scope: "IN_MEMORY_V38_TO_V40_MULTI_REGION_PROOF" })}`);
const encoded = Buffer.from(source, "utf8").toString("base64");
await import(`data:text/javascript;base64,${encoded}`);
