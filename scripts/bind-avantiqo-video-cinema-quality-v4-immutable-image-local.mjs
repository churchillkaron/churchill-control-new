import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = "scripts/bind-avantiqo-video-runpod-immutable-image-local.mjs";
const RESULT_PATH = "audits/results/avantiqo-video-worker-image.json";
const EXPECTED = {
  contract: "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V2",
  evidence_revision: "AVANTIQO_VIDEO_WORKER_IMAGE_V4_WAN22_CINEMA_QUALITY_V1",
  entrypoint: "handler_v4.py",
  entrypoint_revision: "AVANTIQO_VIDEO_HANDLER_V4_WAN22_CINEMA_QUALITY_V1",
  runtime_revision: "AVANTIQO_VIDEO_WAN22_A14B_CINEMA_QUALITY_V1",
  quality_contract: "AVANTIQO_VIDEO_WAN22_A14B_CINEMA_QUALITY_V1",
};

function text(value) {
  return String(value ?? "").trim();
}

function replaceExactlyOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`AVANTIQO_VIDEO_V4_BIND_${label}_MISMATCH:occurrences=${count}`);
  }
  return source.replace(search, replacement);
}

const evidence = JSON.parse(await readFile(resolve(process.cwd(), RESULT_PATH), "utf8"));
if (evidence?.success !== true) {
  throw new Error("AVANTIQO_VIDEO_V4_BIND_SUCCESSFUL_IMAGE_EVIDENCE_REQUIRED");
}
for (const [key, expected] of Object.entries(EXPECTED)) {
  if (text(evidence?.[key]) !== expected) {
    throw new Error(
      `AVANTIQO_VIDEO_V4_BIND_EVIDENCE_MISMATCH:${key}:expected=${expected}:actual=${text(evidence?.[key]) || "MISSING"}`,
    );
  }
}
if (evidence?.source_sha_matches_trigger !== true) {
  throw new Error("AVANTIQO_VIDEO_V4_BIND_SOURCE_TRIGGER_MATCH_REQUIRED");
}
if (evidence?.native_720p_dimensions !== true) {
  throw new Error("AVANTIQO_VIDEO_V4_BIND_NATIVE_720P_REQUIRED");
}
if (Number(evidence?.minimum_cinema_fps) < 16) {
  throw new Error("AVANTIQO_VIDEO_V4_BIND_MINIMUM_16FPS_REQUIRED");
}
if (Number(evidence?.t2v_inference_steps) < 40) {
  throw new Error("AVANTIQO_VIDEO_V4_BIND_T2V_40_STEPS_REQUIRED");
}
if (text(evidence?.vae_decode_dtype) !== "float32") {
  throw new Error("AVANTIQO_VIDEO_V4_BIND_FP32_VAE_REQUIRED");
}
if (text(evidence?.diffusion_dtype) !== "bfloat16") {
  throw new Error("AVANTIQO_VIDEO_V4_BIND_BF16_DIFFUSION_REQUIRED");
}
if (Number(evidence?.cinema_export_quality) < 9) {
  throw new Error("AVANTIQO_VIDEO_V4_BIND_CINEMA_EXPORT_QUALITY_REQUIRED");
}

let source = await readFile(resolve(process.cwd(), BASE), "utf8");
source = replaceExactlyOnce(
  source,
  'if (evidence?.success !== true || evidence?.contract !== "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V1") {',
  'if (evidence?.success !== true || evidence?.contract !== "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V2") {',
  "EVIDENCE_CONTRACT",
);

console.log(`AVANTIQO_VIDEO_V4_IMMUTABLE_BIND_PREFLIGHT=${JSON.stringify({
  base_script: BASE,
  image_digest_present: /^sha256:[0-9a-f]{64}$/i.test(text(evidence?.image_digest)),
  source_sha: text(evidence?.source_sha) || null,
  entrypoint: evidence.entrypoint,
  entrypoint_revision: evidence.entrypoint_revision,
  runtime_revision: evidence.runtime_revision,
  quality_contract: evidence.quality_contract,
  native_720p_dimensions: evidence.native_720p_dimensions,
  minimum_cinema_fps: evidence.minimum_cinema_fps,
  t2v_inference_steps: evidence.t2v_inference_steps,
  vae_decode_dtype: evidence.vae_decode_dtype,
  diffusion_dtype: evidence.diffusion_dtype,
  generation_submitted: false,
  model_download_submitted: false,
  image_endpoint_mutation: false,
  secrets_printed: false,
})}`);

const encoded = Buffer.from(source, "utf8").toString("base64");
await import(`data:text/javascript;base64,${encoded}`);
