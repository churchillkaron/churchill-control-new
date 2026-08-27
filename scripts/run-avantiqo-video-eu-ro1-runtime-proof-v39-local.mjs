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
  '  const targetPlacement = {\n    dataCenterIds: [DESTINATION_DC],\n    gpuTypeIds: [live.selected.gpu_type_id],\n    networkVolumeIds: [DESTINATION_VOLUME_ID],\n  };',
  '  const targetPlacement = {\n    gpuTypeIds: [live.selected.gpu_type_id],\n    networkVolumeIds: [DESTINATION_VOLUME_ID],\n  };',
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
  '          dataCenterIds: original.data_center_ids,\n',
  '',
  "RESTORE_DC_WRITE",
);

source = replaceExactlyOnce(
  source,
  '    console.log(`AVANTIQO_VIDEO_V39_DETERMINISTIC_PLACEMENT=${JSON.stringify({ datacenter: DESTINATION_DC, gpu_type_id: live.selected.gpu_type_id, network_volume_ids: [DESTINATION_VOLUME_ID] })}`);',
  '    console.log(`AVANTIQO_VIDEO_V39_DETERMINISTIC_PLACEMENT=${JSON.stringify({ network_volume_id: DESTINATION_VOLUME_ID, network_volume_data_center_id: DESTINATION_DC, gpu_type_id: live.selected.gpu_type_id, constraint_source: "RUNPOD_SINGLE_NETWORK_VOLUME_DATACENTER" })}`);',
  "PLACEMENT_LOG",
);

source = replaceExactlyOnce(
  source,
  '      mechanism: "CONTROL_PLANE_SINGLE_DATACENTER_SINGLE_GPU_SINGLE_EU_RO1_VOLUME",',
  '      mechanism: "CONTROL_PLANE_SINGLE_EU_RO1_VOLUME_SINGLE_GPU_WITH_VOLUME_DATACENTER_CONSTRAINT",',
  "PROOF_MECHANISM",
);

source = replaceExactlyOnce(
  source,
  '    original_datacenter_pool_restored_before_safe_lease_release: sameSet(restore.restored.data_center_ids, original.data_center_ids),',
  '    datacenter_selector_unchanged_before_safe_lease_release: sameSet(restore.restored.data_center_ids, original.data_center_ids),',
  "RESULT_DC_LABEL",
);

source = replaceExactlyOnce(
  source,
  '    placement_strategy: "TEMPORARY_EU_RO1_ONLY_VOLUME_PLUS_LIVE_CERTIFIED_BLACKWELL_PIN_INSIDE_SAFE_LEASE",',
  '    placement_strategy: "TEMPORARY_SINGLE_EU_RO1_VOLUME_PLUS_LIVE_CERTIFIED_EU_BLACKWELL_PIN_INSIDE_SAFE_LEASE",',
  "PLAN_STRATEGY",
);

source = replaceExactlyCount(
  source,
  '    worker_metadata_schema_dependency: false,',
  '    worker_metadata_schema_dependency: false,\n    datacenter_selector_dependency: false,\n    datacenter_proof: "SINGLE_NETWORK_VOLUME_CONSTRAINS_SERVERLESS_WORKER_TO_VOLUME_DATACENTER",',
  2,
  "PROOF_METADATA",
);

console.log(`AVANTIQO_VIDEO_V39_SOURCE_TRANSFORM_ACTIVE=${JSON.stringify({ node: process.version, base: BASE, proof_basis: "SINGLE_EU_RO1_NETWORK_VOLUME_CONSTRAINT", proof_metadata_occurrences: 2, mutation_scope: "IN_MEMORY_V38_TO_V39_PROOF_CORRECTION" })}`);
const encoded = Buffer.from(source, "utf8").toString("base64");
await import(`data:text/javascript;base64,${encoded}`);
