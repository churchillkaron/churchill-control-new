#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CONTRACT = "AVANTIQO_VIDEO_SCENE1_DFR_ZERO_COST_PLAN_V1";
const OFFICIAL_LTX_SOURCE_SHA = "a95ab856bf29407b6b066ede0abe1846050db56c";
const BASE_REPO = "Lightricks/LTX-2.5";
const BASE_REVISION = "e8dc69fd26150afbfa20351f6bc9ac384257f9fd";
const DETAILING_REPO = "Lightricks/LTX-2.5-22b-IC-LoRA-Pixel-Spatial-Upscaler";
const DETAILING_FILE = "ltx-2.5-22b-ic-lora-pixel-spatial-upscaler-x2-1.0.safetensors";
const SOURCE_BYTES = 31376;
const SOURCE_SHA256 = "cbf4437d77f74b2fd0193f9039ef64c511b597712fe08c466c30d4c231aeb0c5";
const DEFAULT_SOURCE = "assets/video/proofs/avantiqo_first_shot_frame_transport.jpg";

const BASE_FILES = [
  "diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors",
  "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors",
  "vae/ltx-2.5-video-vae-bf16.safetensors",
  "vae/ltx-2.5-audio-vae-bf16.safetensors",
  "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors",
];

const H200_RATE_USD_PER_SECOND = 0.001261;
const B200_RATE_USD_PER_SECOND = 0.001736;
const B200_HARD_TIMEOUT_SECONDS = 420;
const PREVIOUS_H200_GUIDED_STEP_SECONDS = [122.22, 121.37, 121.15];

function text(value) {
  return String(value ?? "").trim();
}

function loadEnvFile(filePath) {
  const values = {};
  if (!filePath || !fs.existsSync(filePath)) return values;
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (key) values[key] = value;
  }
  return values;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function verifySource(sourcePath) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`${CONTRACT}_SOURCE_MISSING:${sourcePath}`);
  }
  const bytes = fs.readFileSync(sourcePath);
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== SOURCE_BYTES) {
    throw new Error(`${CONTRACT}_SOURCE_SIZE_INVALID:${bytes.length}`);
  }
  if (digest !== SOURCE_SHA256) {
    throw new Error(`${CONTRACT}_SOURCE_SHA_INVALID:${digest}`);
  }
  return { bytes: bytes.length, sha256: digest };
}

async function resolveRepoSha(repo, token) {
  const response = await fetch(`https://huggingface.co/api/models/${repo}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(`${CONTRACT}_HF_REPO_INFO_FAILED:${repo}:${response.status}`);
  }
  const payload = await response.json();
  const sha = text(payload?.sha);
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error(`${CONTRACT}_HF_REPO_SHA_INVALID:${repo}`);
  }
  return sha;
}

async function probeHfFile(repo, revision, file, token) {
  const encodedPath = file.split("/").map(encodeURIComponent).join("/");
  const url = `https://huggingface.co/${repo}/resolve/${revision}/${encodedPath}`;
  const response = await fetch(url, {
    method: "HEAD",
    redirect: "manual",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const location = text(response.headers.get("location"));
  const allowed =
    response.status === 200 ||
    ([301, 302, 303, 307, 308].includes(response.status) && !/\/login(?:\?|$)/i.test(location));
  if (!allowed) {
    throw new Error(
      `${CONTRACT}_HF_FILE_NOT_ENTITLED:${repo}:${revision}:${file}:HTTP_${response.status}`,
    );
  }
  return {
    repo,
    revision,
    file,
    http_status: response.status,
    entitlement: "PASS",
    bytes_downloaded: 0,
  };
}

function economicsPlan() {
  const measuredGuidedStep = median(PREVIOUS_H200_GUIDED_STEP_SECONDS);

  // The retired one-stage job used guided denoising. LTX's guided denoiser batches
  // conditioned, unconditional, STG and isolated-modality passes; DFR uses the
  // SimpleDenoiser single-pass distilled schedule. We deliberately credit only a
  // 2x reduction rather than assuming the theoretical maximum guidance batching
  // benefit, so this remains a conservative planning estimate.
  const conservativeGuidanceReduction = 2.0;
  const singlePassFull4kSeconds = measuredGuidedStep / conservativeGuidanceReduction;

  // DFR --spatial-upscalings 2:
  // stage 1: 8 steps at quarter linear resolution => 8/16 full-res equivalents
  // stage 2: 3 steps at half linear resolution    => 3/4 full-res equivalents
  // 4K epilogue: 3 steps, conservatively charge 1.5 full-res equivalents
  // per step for spatial tiling/overlap.
  const stage1FullResEquivalents = 8 / 16;
  const stage2FullResEquivalents = 3 / 4;
  const epilogueFullResEquivalents = 3 * 1.5;
  const totalFullResEquivalents =
    stage1FullResEquivalents + stage2FullResEquivalents + epilogueFullResEquivalents;
  const estimatedDenoiseSecondsH200 = singlePassFull4kSeconds * totalFullResEquivalents;

  // Reserve substantial fixed time for Gemma encoding, model materialization,
  // transformer construction and VAE/upscaler work observed around the failed
  // full-dev job. This estimate is a planning gate, not a billing measurement.
  const fixedOverheadSeconds = 180;
  const conservativeEstimatedTotalH200Seconds =
    estimatedDenoiseSecondsH200 + fixedOverheadSeconds;

  return {
    previous_measurement: {
      gpu: "H200",
      retired_pipeline: "TI2VID_ONE_STAGE_FULL_DEV_BF16",
      full_resolution: "3840x2176",
      frames: 121,
      guided_steps_configured: 30,
      guided_steps_completed_before_timeout: 3,
      measured_step_seconds: PREVIOUS_H200_GUIDED_STEP_SECONDS,
      median_guided_step_seconds: Number(measuredGuidedStep.toFixed(3)),
    },
    dfr_compute_shape: {
      pipeline: "DFR",
      final_width: 3840,
      final_height: 2176,
      fps: 24,
      frames: 121,
      spatial_upscalings: 2,
      temporal_upscalings: 0,
      stage_1_steps: 8,
      stage_1_linear_scale_vs_final: 0.25,
      stage_2_steps: 3,
      stage_2_linear_scale_vs_final: 0.5,
      final_detailing_steps: 3,
      final_detailing_tile_overhead_multiplier_for_planning: 1.5,
      simple_denoiser_single_pass: true,
    },
    conservative_h200_projection_only: {
      guidance_reduction_credit: conservativeGuidanceReduction,
      full_resolution_single_pass_seconds: Number(singlePassFull4kSeconds.toFixed(3)),
      full_resolution_equivalents: Number(totalFullResEquivalents.toFixed(3)),
      denoise_seconds: Number(estimatedDenoiseSecondsH200.toFixed(3)),
      fixed_overhead_seconds: fixedOverheadSeconds,
      total_seconds: Number(conservativeEstimatedTotalH200Seconds.toFixed(3)),
      projected_gpu_cost_usd: Number(
        (conservativeEstimatedTotalH200Seconds * H200_RATE_USD_PER_SECOND).toFixed(6),
      ),
      status: conservativeEstimatedTotalH200Seconds <= 540 ? "WITHIN_9_MINUTE_PLANNING_BOUND" : "REJECT",
      note: "Projection is intentionally conservative and is not a production billing measurement.",
    },
    selected_first_certification_gpu: {
      gpu: "B200",
      reason: "192GB Blackwell headroom for BF16 DFR plus faster production-class transformer execution; quality reference remains BF16.",
      quantization: "NONE_BF16_QUALITY_REFERENCE",
      hard_timeout_seconds: B200_HARD_TIMEOUT_SECONDS,
      current_rate_usd_per_second: B200_RATE_USD_PER_SECOND,
      absolute_gpu_cost_ceiling_usd: Number(
        (B200_HARD_TIMEOUT_SECONDS * B200_RATE_USD_PER_SECOND).toFixed(6),
      ),
      maximum_gpu_containers: 1,
      automatic_retry: false,
      scale_to_zero: true,
    },
  };
}

async function main() {
  const envFile = path.resolve(
    process.env.AVANTIQO_VIDEO_SCENE1_ENV_FILE || path.join(process.cwd(), ".env.local"),
  );
  const fileEnv = loadEnvFile(envFile);
  const env = { ...fileEnv, ...process.env };
  const token = text(env.HF_TOKEN || env.HUGGINGFACE_TOKEN || env.HUGGING_FACE_HUB_TOKEN);
  if (!token) throw new Error(`${CONTRACT}_HF_TOKEN_REQUIRED`);

  const sourcePath = path.resolve(
    process.env.AVANTIQO_VIDEO_SCENE1_SOURCE_FRAME ||
      path.join(process.cwd(), DEFAULT_SOURCE),
  );
  const source = verifySource(sourcePath);

  const detailingRevision = await resolveRepoSha(DETAILING_REPO, token);
  const probes = [];
  for (const file of BASE_FILES) {
    probes.push(await probeHfFile(BASE_REPO, BASE_REVISION, file, token));
  }
  probes.push(await probeHfFile(DETAILING_REPO, detailingRevision, DETAILING_FILE, token));

  const plan = {
    success: true,
    contract: CONTRACT,
    phase: "ZERO_COST_DFR_RESOLUTION_AND_ECONOMICS",
    approved_source: source,
    official_pipeline: {
      source_repository: "Lightricks/LTX-2",
      source_sha: OFFICIAL_LTX_SOURCE_SHA,
      pipeline: "ltx_pipelines.dfr_pipeline",
      production_quality_path: true,
      final_resolution: "3840x2176",
      fps: 24,
      frames: 121,
      spatial_upscalings: 2,
      temporal_upscalings: 0,
      pixel_resize_as_final_output: false,
      final_full_resolution_diffusion_detailing: true,
    },
    immutable_models: {
      base_repo: BASE_REPO,
      base_revision: BASE_REVISION,
      base_files: BASE_FILES,
      detailing_repo: DETAILING_REPO,
      resolved_detailing_revision: detailingRevision,
      detailing_file: DETAILING_FILE,
      entitlement_probes: probes,
    },
    economics: economicsPlan(),
    storage: {
      modal_volume: "avantiqo-video-models",
      second_video_volume_planned: false,
      model_download_performed: false,
      duplicate_model_copy_planned: false,
      retired_dev_transformer_cleanup_after_dfr_proof: true,
    },
    execution: {
      modal_gpu_function_defined_by_this_plan: false,
      gpu_requested: false,
      gpu_inference_performed: false,
      paid_generation_submitted: false,
      runpod_used: false,
      customer_charge_performed: false,
      pricing_activation_performed: false,
      production_deploy_performed: false,
      secrets_printed: false,
    },
  };

  console.log(JSON.stringify(plan, null, 2));
  console.log(`${CONTRACT}=PASS`);
}

main().catch((error) => {
  console.error(`${CONTRACT}=FAIL:${text(error?.message || error)}`);
  process.exitCode = 1;
});
