import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BASE = path.resolve("scripts/run-avantiqo-video-ltx25-scene1-distilled-proof-ci.mjs");
const GENERATED = path.resolve("scripts/.generated-avantiqo-video-ltx25-scene1-hq4k.mjs");

let source = await fs.readFile(BASE, "utf8");

source = source.replace(`  videoPodCandidateSnapshot,\n`, ``);

const marker = `const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};\n`;
if (!source.includes(marker)) throw new Error("AVANTIQO_VIDEO_NATIVE4K_OBJECT_MARKER_MISSING");

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
  if (matches.length !== 1) throw new Error("AVANTIQO_VIDEO_NATIVE4K_PRODUCTION_ENDPOINT_AMBIGUOUS:" + matches.length);
  const production = matches[0];
  if (Number(production.workersMin ?? production.workers_min) !== 0 || Number(production.workersMax ?? production.workers_max) !== 0 || activeEndpointWorkers(production).length) {
    throw new Error("AVANTIQO_VIDEO_NATIVE4K_PRODUCTION_ENDPOINT_NOT_ZERO_ZERO");
  }
  const volumeIds = endpointVolumeIds(production);
  const volumeMatches = volumes.filter((row) => volumeIds.includes(text(row?.id)) && text(row?.name) === "avantiqo-video-cache-eu-ro-1");
  if (volumeMatches.length !== 1) throw new Error("AVANTIQO_VIDEO_NATIVE4K_VOLUME_AMBIGUOUS:" + volumeMatches.length);
  const volume = volumeMatches[0];
  if (text(volume.dataCenterId ?? volume.data_center_id) !== AVANTIQO_VIDEO_POD_DC) throw new Error("AVANTIQO_VIDEO_NATIVE4K_VOLUME_DC_INVALID");
  const templateId = text(production.templateId ?? production.template?.id);
  if (!templateId) throw new Error("AVANTIQO_VIDEO_NATIVE4K_TEMPLATE_ID_REQUIRED");
  let template = templates.find((row) => text(row?.id) === templateId) || null;
  const direct = await podRest("/templates/" + encodeURIComponent(templateId)).catch(() => null);
  if (direct?.id) template = direct;
  if (!template) throw new Error("AVANTIQO_VIDEO_NATIVE4K_TEMPLATE_REQUIRED");
  const templateEnv = Array.isArray(template.env)
    ? Object.fromEntries(template.env.map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")]).filter(([key]) => Boolean(key)))
    : object(template.env);
  const registryAuthId = text(template.containerRegistryAuthId ?? template.container_registry_auth_id);
  const activePods = pods.filter((pod) => {
    const podVolume = text(pod?.networkVolume?.id ?? pod?.networkVolumeId ?? pod?.network_volume_id);
    return podVolume === text(volume.id) && !podTerminal(pod);
  });
  if (activePods.length) throw new Error("AVANTIQO_VIDEO_NATIVE4K_ACTIVE_POD_PRESENT:" + activePods.length);
  console.log("AVANTIQO_VIDEO_NATIVE4K_SNAPSHOT=PASS:endpoint=" + ENDPOINT_NAME + ":volume=" + text(volume.name));
  return { candidate: production, production, volume, template, templateEnv, registryAuthId, registryAuthMode: "PRODUCTION_TEMPLATE" };
}
`;
source = source.replace(marker, marker + productionSnapshot);
source = source.replaceAll("videoPodCandidateSnapshot()", "videoPodProductionSnapshot()");

source = source.replace(
  /const SCENE_GPU_POOL = Object\.freeze\(\[.*?\n\]\);/s,
  `const SCENE_GPU_POOL = Object.freeze([\n  "NVIDIA RTX PRO 6000 Blackwell Server Edition",\n  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",\n  "NVIDIA B200",\n]);`,
);

source = source.replace(
  /const REQUIRED_MODEL_FILES = Object\.freeze\(\[.*?\n\]\);/s,
  `const REQUIRED_MODEL_FILES = Object.freeze([\n  "diffusion_models/ltx-2.5-22b-dev-transformer-bf16.safetensors",\n  "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors",\n  "vae/ltx-2.5-video-vae-bf16.safetensors",\n  "vae/ltx-2.5-audio-vae-bf16.safetensors",\n]);`,
);

source = source.replace(
  `const DISTILLED_WORKER_PATH = path.resolve("scripts/avantiqo-video-ltx25-distilled-scene-worker.py");`,
  `const DISTILLED_WORKER_PATH = path.resolve("scripts/avantiqo-video-ltx25-hq4k-scene-worker.py");`,
);

source = source.replace(
  /function sceneInstruction\(\) \{.*?\n\}/s,
  `function sceneInstruction() {
  return [
    "SCENE 1 — BEFORE THE DAY BEGINS.",
    "Start from the supplied city reference while preserving the skyline geometry, horizon, dawn atmosphere, river reflections, streets and towers.",
    "Over five seconds execute an extremely restrained stabilized cinematic aerial push forward with a barely perceptible gentle descent. Premium global commercial-film realism, no time-lapse.",
    "Cloud drift, water reflections and distant traffic must remain physically plausible. Preserve architecture without melting, bending, duplicate buildings, jump cuts, yaw, roll, sudden zoom or focal-length pumping.",
    "Generate picture only: no typography, no captions, no numbers, no logos and no letterbox bars. Exact title graphics are composited after diffusion so text cannot mutate.",
    "Maintain fine atmospheric depth, natural motion blur, coherent exposure and a clean continuity end frame. Never collapse the image into black or a thin strip.",
  ].join(" ");
}`,
);

source = source.replaceAll("scene1-distilled-", "scene1-native4k-");
source = source.replaceAll("avantiqo-video-ltx25-scene1-distilled-", "avantiqo-video-ltx25-scene1-native4k-");
source = source.replaceAll("AVANTIQO_VIDEO_LTX25_DISTILLED_WORKER_B64", "AVANTIQO_VIDEO_LTX25_NATIVE4K_WORKER_B64");
source = source.replaceAll("<avantiqo-ltx25-distilled-worker>", "<avantiqo-ltx25-native4k-worker>");
source = source.replace(
  `AVANTIQO_VIDEO_LTX25_HARD_TIMEOUT_SECONDS: "6300",`,
  `AVANTIQO_VIDEO_LTX25_HARD_TIMEOUT_SECONDS: "1800",`,
);
source = source.replace(
  `const receipt = await waitForJson(receiptPath, 110 * 60 * 1000, async () => {`,
  `const receipt = await waitForJson(receiptPath, 35 * 60 * 1000, async () => {`,
);
source = source.replace(
  `if (Number(output.width) !== 3840 || Number(output.height) !== 2176 || Number(output.fps) !== 24) {`,
  `if (Number(output.width) !== 3840 || Number(output.height) !== 2160 || Number(output.fps) !== 24) {`,
);
source = source.replace(
  `throw new Error(\`AVANTIQO_VIDEO_LTX25_SCENE1_NATIVE_OUTPUT_INVALID:\${output.width}x\${output.height}@\${output.fps}\`);`,
  `throw new Error(\`AVANTIQO_VIDEO_NATIVE4K_DELIVERY_INVALID:\${output.width}x\${output.height}@\${output.fps}\`);`,
);
source = source.replace(
  `contract: "AVANTIQO_VIDEO_LTX25_SCENE1_DISTILLED_PROOF_V1",`,
  `contract: "AVANTIQO_VIDEO_LTX25_SCENE1_NATIVE4K_PROOF_V1",`,
);

const preloadBlock = `    const preload = await runPreload(await videoPodProductionSnapshot());
    report.preload = {
      success: true,
      revision: preload.revision,
      file_count: preload.files.length,
      total_bytes: preload.files.reduce((sum, item) => sum + Number(item.size_bytes || 0), 0),
    };`;
if (!source.includes(preloadBlock)) throw new Error("AVANTIQO_VIDEO_NATIVE4K_PRELOAD_BLOCK_MISSING");
source = source.replace(
  preloadBlock,
  `    report.preload = {
      success: true,
      skipped: true,
      revision: "CACHED_EXISTING",
      reason: "DEV_BF16_CACHE_VERIFIED_BY_RUN_33396421549",
    };
    console.log("AVANTIQO_VIDEO_NATIVE4K_PRELOAD_SKIPPED=CACHE_VERIFIED_RUN_33396421549");`,
);

const qualityBoundary = `    if (output.pixel_720p_stage_used !== false || output.lanczos_upscale_used !== false || output.external_provider_contacted !== false) {
      throw new Error("AVANTIQO_VIDEO_LTX25_SCENE1_QUALITY_BOUNDARY_INVALID");
    }`;
if (!source.includes(qualityBoundary)) throw new Error("AVANTIQO_VIDEO_NATIVE4K_QUALITY_BOUNDARY_TARGET_MISSING");
source = source.replace(
  qualityBoundary,
  `${qualityBoundary}
    if (output.native_4k_claimed !== true || output.uhd_delivery !== true) {
      throw new Error("AVANTIQO_VIDEO_NATIVE4K_CLAIM_INVALID");
    }
    if (Number(output.native_generation_width) !== 3840 || Number(output.native_generation_height) !== 2176) {
      throw new Error("AVANTIQO_VIDEO_NATIVE4K_GENERATION_DIMENSIONS_INVALID");
    }
    if (output.pixel_upscale_used !== false || output.learned_latent_upsampler_used !== false || output.learned_spatial_upscaler_used !== false || output.resize_used !== false) {
      throw new Error("AVANTIQO_VIDEO_NATIVE4K_UPSCALE_OR_RESIZE_FORBIDDEN");
    }
    if (output.distilled_lora_used !== false || output.delivery_crop_only !== true || Number(output.delivery_crop_top_px) !== 8 || Number(output.delivery_crop_bottom_px) !== 8) {
      throw new Error("AVANTIQO_VIDEO_NATIVE4K_MODEL_OR_CROP_CONTRACT_INVALID");
    }
    if (output.deterministic_title_composite !== true || text(output.title_text) !== "04:47 AM / BEFORE THE DAY BEGINS") {
      throw new Error("AVANTIQO_VIDEO_NATIVE4K_TITLE_LOCK_INVALID");
    }
    const qc = object(output.visual_integrity_qc);
    if (Number(qc.max_pure_black_fraction) > 0.55 || Number(qc.min_active_span_fraction) < 0.70) {
      throw new Error("AVANTIQO_VIDEO_NATIVE4K_VISUAL_INTEGRITY_INVALID");
    }`,
);

await fs.writeFile(GENERATED, source, "utf8");
console.log("AVANTIQO_VIDEO_LTX25_NATIVE4K_SOURCE_PATCH=PASS");
try {
  await import(`${pathToFileURL(GENERATED).href}?v=${Date.now()}`);
} finally {
  await fs.rm(GENERATED, { force: true }).catch(() => null);
}
