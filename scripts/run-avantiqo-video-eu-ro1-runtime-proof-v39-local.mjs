import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = "scripts/run-avantiqo-video-eu-ro1-runtime-proof-v38-local.mjs";

function replaceExactlyOnce(source, search, replacement, label) {
  const parts = source.split(search);
  if (parts.length !== 2) throw new Error(`AVANTIQO_VIDEO_V39_SOURCE_TRANSFORM_${label}_MISMATCH:occurrences=${parts.length - 1}`);
  return parts[0] + replacement + parts[1];
}

function replaceExactlyCount(source, search, replacement, expected, label) {
  const occurrences = source.split(search).length - 1;
  if (occurrences !== expected) throw new Error(`AVANTIQO_VIDEO_V39_SOURCE_TRANSFORM_${label}_MISMATCH:occurrences=${occurrences}:expected=${expected}`);
  return source.replaceAll(search, replacement);
}

const major = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(major) || major < 20) {
  throw new Error(`AVANTIQO_VIDEO_V39_NODE20_REQUIRED:${process.version}`);
}

let source = await readFile(resolve(process.cwd(), BASE), "utf8");
source = source.replaceAll("V38", "V39");
if (source.includes("V38")) throw new Error("AVANTIQO_VIDEO_V39_SOURCE_TRANSFORM_VERSION_REMAINS");

source = replaceExactlyOnce(
  source,
  'if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`AVANTIQO_VIDEO_V39_NODE24_REQUIRED:${process.version}`);',
  'if (Number(process.versions.node.split(".")[0]) < 20) throw new Error(`AVANTIQO_VIDEO_V39_NODE20_REQUIRED:${process.version}`);',
  "NODE_GATE",
);

source = replaceExactlyOnce(
  source,
  '    network_volume_ids: endpointVolumeIds(endpoint),\n    workers_min: finite(endpoint.workersMin, null),',
  '    primary_network_volume_id: text(endpoint.networkVolumeId) || null,\n    network_volume_ids: endpointVolumeIds(endpoint),\n    workers_min: finite(endpoint.workersMin, null),',
  "PRIMARY_VOLUME_SNAPSHOT",
);

source = replaceExactlyOnce(
  source,
  '  if (!sameSet(original.network_volume_ids, [SOURCE_VOLUME_ID, DESTINATION_VOLUME_ID])) throw new Error(`AVANTIQO_VIDEO_V39_MULTIVOLUME_BINDING_INVALID:${original.network_volume_ids.join("|")}`);',
  '  if (!sameSet(original.network_volume_ids, [SOURCE_VOLUME_ID, DESTINATION_VOLUME_ID])) throw new Error(`AVANTIQO_VIDEO_V39_MULTIVOLUME_BINDING_INVALID:${original.network_volume_ids.join("|")}`);\n  if (!original.primary_network_volume_id || !original.network_volume_ids.includes(original.primary_network_volume_id)) throw new Error(`AVANTIQO_VIDEO_V39_ORIGINAL_PRIMARY_VOLUME_INVALID:${original.primary_network_volume_id || "NONE"}`);',
  "ORIGINAL_PRIMARY_VOLUME_ASSERT",
);

source = replaceExactlyOnce(
  source,
  '  const targetPlacement = {\n    dataCenterIds: [DESTINATION_DC],\n    gpuTypeIds: [live.selected.gpu_type_id],\n    networkVolumeIds: [DESTINATION_VOLUME_ID],\n  };',
  '  const targetPlacement = {\n    gpuTypeIds: [live.selected.gpu_type_id],\n    networkVolumeId: DESTINATION_VOLUME_ID,\n    networkVolumeIds: [DESTINATION_VOLUME_ID],\n  };',
  "TARGET_PLACEMENT",
);

source = replaceExactlyOnce(
  source,
  '    if (!sameSet(pinnedPlacement.data_center_ids, [DESTINATION_DC])) throw new Error(`AVANTIQO_VIDEO_V39_DC_PIN_VERIFY_FAILED:${pinnedPlacement.data_center_ids.join("|")}`);\n',
  '',
  "DC_VERIFY",
);

source = replaceExactlyOnce(
  source,
  '    if (!sameSet(pinnedPlacement.network_volume_ids, [DESTINATION_VOLUME_ID])) throw new Error(`AVANTIQO_VIDEO_V39_EU_ONLY_VOLUME_PIN_VERIFY_FAILED:${pinnedPlacement.network_volume_ids.join("|")}`);',
  '    if (pinnedPlacement.primary_network_volume_id !== DESTINATION_VOLUME_ID) throw new Error(`AVANTIQO_VIDEO_V39_EU_PRIMARY_VOLUME_PIN_VERIFY_FAILED:${pinnedPlacement.primary_network_volume_id || "NONE"}`);\n    if (!sameSet(pinnedPlacement.network_volume_ids, [DESTINATION_VOLUME_ID])) throw new Error(`AVANTIQO_VIDEO_V39_EU_ONLY_VOLUME_PIN_VERIFY_FAILED:${pinnedPlacement.network_volume_ids.join("|")}`);',
  "PRIMARY_VOLUME_PIN_VERIFY",
);

source = replaceExactlyOnce(
  source,
  '          dataCenterIds: original.data_center_ids,\n          gpuTypeIds: original.gpu_type_ids,\n          networkVolumeIds: original.network_volume_ids,',
  '          gpuTypeIds: original.gpu_type_ids,\n          networkVolumeId: original.primary_network_volume_id,\n          networkVolumeIds: original.network_volume_ids,',
  "RESTORE_VOLUME_BINDING",
);

source = replaceExactlyOnce(
  source,
  '      if (!sameSet(restored.network_volume_ids, original.network_volume_ids)) throw new Error(`VOLUME:${restored.network_volume_ids.join("|")}`);',
  '      if (restored.primary_network_volume_id !== original.primary_network_volume_id) throw new Error(`PRIMARY_VOLUME:${restored.primary_network_volume_id || "NONE"}`);\n      if (!sameSet(restored.network_volume_ids, original.network_volume_ids)) throw new Error(`VOLUME:${restored.network_volume_ids.join("|")}`);',
  "RESTORE_PRIMARY_VOLUME_VERIFY",
);

source = replaceExactlyOnce(
  source,
  '    console.log(`AVANTIQO_VIDEO_V39_DETERMINISTIC_PLACEMENT=${JSON.stringify({ datacenter: DESTINATION_DC, gpu_type_id: live.selected.gpu_type_id, network_volume_ids: [DESTINATION_VOLUME_ID] })}`);',
  '    console.log(`AVANTIQO_VIDEO_V39_DETERMINISTIC_PLACEMENT=${JSON.stringify({ primary_network_volume_id: DESTINATION_VOLUME_ID, network_volume_ids: [DESTINATION_VOLUME_ID], network_volume_data_center_id: DESTINATION_DC, gpu_type_id: live.selected.gpu_type_id, constraint_source: "RUNPOD_SYNCHRONIZED_SINGLE_NETWORK_VOLUME_BINDING" })}`);',
  "PLACEMENT_LOG",
);

source = replaceExactlyOnce(
  source,
  '      mechanism: "CONTROL_PLANE_SINGLE_DATACENTER_SINGLE_GPU_SINGLE_EU_RO1_VOLUME",',
  '      mechanism: "CONTROL_PLANE_SYNCHRONIZED_PRIMARY_AND_MULTI_VOLUME_SINGLE_EU_RO1_BINDING_WITH_SINGLE_GPU",',
  "PROOF_MECHANISM",
);

source = replaceExactlyOnce(
  source,
  '    original_datacenter_pool_restored_before_safe_lease_release: sameSet(restore.restored.data_center_ids, original.data_center_ids),',
  '    datacenter_selector_unchanged_before_safe_lease_release: sameSet(restore.restored.data_center_ids, original.data_center_ids),\n    original_primary_network_volume_restored_before_safe_lease_release: restore.restored.primary_network_volume_id === original.primary_network_volume_id,',
  "RESULT_RESTORE_LABELS",
);

source = replaceExactlyOnce(
  source,
  '    placement_strategy: "TEMPORARY_EU_RO1_ONLY_VOLUME_PLUS_LIVE_CERTIFIED_BLACKWELL_PIN_INSIDE_SAFE_LEASE",',
  '    placement_strategy: "TEMPORARY_SYNCHRONIZED_PRIMARY_PLUS_MULTI_VOLUME_EU_RO1_ONLY_BINDING_WITH_LIVE_CERTIFIED_EU_BLACKWELL",',
  "PLAN_STRATEGY",
);

source = replaceExactlyCount(
  source,
  '    worker_metadata_schema_dependency: false,',
  '    worker_metadata_schema_dependency: false,\n    datacenter_selector_dependency: false,\n    network_volume_binding_fields_synchronized: true,\n    datacenter_proof: "SINGLE_PRIMARY_AND_MULTI_VOLUME_BINDING_TO_EU_RO1_VOLUME_CONSTRAINS_SERVERLESS_WORKER_TO_VOLUME_DATACENTER",',
  2,
  "PROOF_METADATA",
);

console.log(`AVANTIQO_VIDEO_V39_SOURCE_TRANSFORM_ACTIVE=${JSON.stringify({ node: process.version, base: BASE, proof_basis: "SYNCHRONIZED_PRIMARY_AND_MULTI_VOLUME_EU_RO1_CONSTRAINT", proof_metadata_occurrences: 2, mutation_scope: "IN_MEMORY_V38_TO_V39_PROOF_CORRECTION" })}`);
const encoded = Buffer.from(source, "utf8").toString("base64");
await import(`data:text/javascript;base64,${encoded}`);
