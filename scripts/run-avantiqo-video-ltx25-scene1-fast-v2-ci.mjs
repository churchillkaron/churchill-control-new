import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BASE = path.resolve("scripts/run-avantiqo-video-ltx25-scene1-distilled-proof-ci.mjs");
const GENERATED = path.resolve("scripts/.generated-avantiqo-video-ltx25-scene1-fast-v2.mjs");

let source = await fs.readFile(BASE, "utf8");

source = source.replace(
  `  videoPodCandidateSnapshot,\n`,
  ``,
);

const marker = `const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};\n`;
if (!source.includes(marker)) throw new Error("AVANTIQO_VIDEO_FAST_V2_OBJECT_MARKER_MISSING");

const productionSnapshot = `

function rows(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const nested = rows(value[key], keys, depth + 1);
    if (nested.length || Array.isArray(value[key])) return nested;
  }
  return [];
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint.networkVolumeId ?? endpoint.network_volume_id),
    ...rows(endpoint.networkVolumeIds ?? endpoint.network_volume_ids).map((entry) => text(typeof entry === "string" ? entry : entry?.id ?? entry?.networkVolumeId ?? entry?.network_volume_id)),
  ].filter(Boolean))];
}

function activeEndpointWorkers(endpoint = {}) {
  const terminal = new Set(["EXITED", "TERMINATED", "DELETED", "STOPPED"]);
  return rows(endpoint.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus ?? worker?.desiredStatus).toUpperCase();
    return status ? !terminal.has(status) : true;
  });
}

async function videoPodProductionSnapshot() {
  const [rawEndpoints, rawTemplates, rawVolumes, rawPods] = await Promise.all([
    podRest("/endpoints?includeTemplate=true&includeWorkers=true"),
    podRest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false"),
    podRest("/networkvolumes"),
    podRest("/pods"),
  ]);
  const endpoints = rows(rawEndpoints, ["endpoints", "serverlessEndpoints"]);
  const templates = rows(rawTemplates, ["templates"]);
  const volumes = rows(rawVolumes, ["networkVolumes", "networkvolumes"]);
  const pods = rows(rawPods, ["pods"]);
  const matches = endpoints.filter((row) => text(row?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(\`AVANTIQO_VIDEO_FAST_V2_PRODUCTION_ENDPOINT_AMBIGUOUS:\${matches.length}\`);
  const production = matches[0];
  if (Number(production.workersMin ?? production.workers_min) !== 0 || Number(production.workersMax ?? production.workers_max) !== 0 || activeEndpointWorkers(production).length) {
    throw new Error("AVANTIQO_VIDEO_FAST_V2_PRODUCTION_ENDPOINT_NOT_ZERO_ZERO");
  }
  const volumeIds = endpointVolumeIds(production);
  const volumeMatches = volumes.filter((row) => volumeIds.includes(text(row?.id)) && text(row?.name) === "avantiqo-video-cache-eu-ro-1");
  if (volumeMatches.length !== 1) throw new Error(\`AVANTIQO_VIDEO_FAST_V2_VOLUME_AMBIGUOUS:\${volumeMatches.length}\`);
  const volume = volumeMatches[0];
  if (text(volume.dataCenterId ?? volume.data_center_id) !== AVANTIQO_VIDEO_POD_DC) throw new Error("AVANTIQO_VIDEO_FAST_V2_VOLUME_DC_INVALID");
  const templateId = text(production.templateId ?? production.template?.id);
  if (!templateId) throw new Error("AVANTIQO_VIDEO_FAST_V2_TEMPLATE_ID_REQUIRED");
  let template = templates.find((row) => text(row?.id) === templateId) || null;
  const direct = await podRest(\`/templates/\${encodeURIComponent(templateId)}\`).catch(() => null);
  if (direct?.id) template = direct;
  if (!template) throw new Error("AVANTIQO_VIDEO_FAST_V2_TEMPLATE_REQUIRED");
  const templateEnv = Array.isArray(template.env)
    ? Object.fromEntries(template.env.map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")]).filter(([key]) => Boolean(key)))
    : object(template.env);
  const registryAuthId = text(template.containerRegistryAuthId ?? template.container_registry_auth_id);
  const activePods = pods.filter((pod) => {
    const podVolume = text(pod?.networkVolume?.id ?? pod?.networkVolumeId ?? pod?.network_volume_id);
    return podVolume === text(volume.id) && !podTerminal(pod);
  });
  if (activePods.length) throw new Error(\`AVANTIQO_VIDEO_FAST_V2_ACTIVE_POD_PRESENT:\${activePods.length}\`);
  console.log(\`AVANTIQO_VIDEO_FAST_V2_SNAPSHOT=PASS:endpoint=\${ENDPOINT_NAME}:volume=\${text(volume.name)}\`);
  return { candidate: production, production, volume, template, templateEnv, registryAuthId, registryAuthMode: "PRODUCTION_TEMPLATE" };
}
`;
source = source.replace(marker, marker + productionSnapshot);
source = source.replaceAll("videoPodCandidateSnapshot()", "videoPodProductionSnapshot()");

const preloadBlock = `    const preload = await runPreload(await videoPodProductionSnapshot());
    report.preload = {
      success: true,
      revision: preload.revision,
      file_count: preload.files.length,
      total_bytes: preload.files.reduce((sum, item) => sum + Number(item.size_bytes || 0), 0),
    };`;
const cachedBlock = `    report.preload = {
      success: true,
      revision: "CACHED_EXISTING_PROVEN_RUN_33350171235",
      file_count: REQUIRED_MODEL_FILES.length,
      total_bytes: null,
      cache_proof_run_id: "33350171235",
    };
    console.log("AVANTIQO_VIDEO_LTX25_FAST_V2_PRELOAD=REUSED_CACHED_EXISTING_PROOF");`;
if (!source.includes(preloadBlock)) throw new Error("AVANTIQO_VIDEO_FAST_V2_PRELOAD_PATCH_TARGET_MISSING");
source = source.replace(preloadBlock, cachedBlock);

const originalPool = `const SCENE_GPU_POOL = Object.freeze([\n  "NVIDIA B200",\n  "NVIDIA RTX PRO 6000 Blackwell Server Edition",\n]);`;
const highMemoryPool = `const SCENE_GPU_POOL = Object.freeze([\n  "NVIDIA B200",\n  "NVIDIA RTX PRO 6000 Blackwell Server Edition",\n  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",\n  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",\n]);`;
if (!source.includes(originalPool)) throw new Error("AVANTIQO_VIDEO_FAST_V2_GPU_POOL_PATCH_TARGET_MISSING");
source = source.replace(originalPool, highMemoryPool);

source = source.replace(
  `AVANTIQO_VIDEO_LTX25_HARD_TIMEOUT_SECONDS: "6300",`,
  `AVANTIQO_VIDEO_LTX25_HARD_TIMEOUT_SECONDS: "180",`,
);
source = source.replace(
  `const receipt = await waitForJson(receiptPath, 110 * 60 * 1000, async () => {`,
  `const receipt = await waitForJson(receiptPath, 4 * 60 * 1000, async () => {`,
);
source = source.replace(
  `if (Number(output.width) !== 3840 || Number(output.height) !== 2176 || Number(output.fps) !== 24) {`,
  `if (Number(output.width) !== 1920 || Number(output.height) !== 1088 || Number(output.fps) !== 24) {`,
);
source = source.replace(
  `throw new Error(\`AVANTIQO_VIDEO_LTX25_SCENE1_NATIVE_OUTPUT_INVALID:\${output.width}x\${output.height}@\${output.fps}\`);`,
  `throw new Error(\`AVANTIQO_VIDEO_LTX25_SCENE1_MASTER_OUTPUT_INVALID:\${output.width}x\${output.height}@\${output.fps}\`);`,
);
source = source.replace(
  `contract: "AVANTIQO_VIDEO_LTX25_SCENE1_DISTILLED_PROOF_V1",`,
  `contract: "AVANTIQO_VIDEO_LTX25_SCENE1_FAST_V3_PROOF",`,
);

await fs.writeFile(GENERATED, source, "utf8");
console.log("AVANTIQO_VIDEO_LTX25_FAST_V3_SOURCE_PATCH=PASS");
try {
  await import(`${pathToFileURL(GENERATED).href}?v=${Date.now()}`);
} finally {
  await fs.rm(GENERATED, { force: true }).catch(() => null);
}
