import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  AVANTIQO_VIDEO_POD_DC,
  deleteVideoPod,
  getVideoPod,
  podRest,
  podTerminal,
  text,
  videoPodCandidateSnapshot,
} from "../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRunpod.js";

const BUCKET = "creative-assets";
const LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LANE = "cinema-production";
const ENDPOINT_NAME = "avantiqo-cinema-production-v1";
const MODEL_REPO = "Lightricks/LTX-2.5";
const PRELOAD_GPU_POOL = Object.freeze([
  "NVIDIA RTX PRO 4500 Blackwell",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
]);
const SCENE_GPU_POOL = Object.freeze([
  "NVIDIA B200",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
]);
const REQUIRED_MODEL_FILES = Object.freeze([
  "diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors",
  "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors",
  "vae/ltx-2.5-video-vae-bf16.safetensors",
  "vae/ltx-2.5-audio-vae-bf16.safetensors",
  "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors",
]);
const DISTILLED_WORKER_PATH = path.resolve("scripts/avantiqo-video-ltx25-distilled-scene-worker.py");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => new Date().toISOString();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function requiredEnv(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function cleanRunId(value) {
  return text(value || Date.now()).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) || String(Date.now());
}

const SUPABASE_URL = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const IMMUTABLE_IMAGE = requiredEnv("AVANTIQO_VIDEO_LTX25_IMAGE");
const ORGANIZATION_ID = requiredEnv("AVANTIQO_VIDEO_SCENE1_ORGANIZATION_ID");
const OPENING_FRAME = path.resolve(requiredEnv("AVANTIQO_VIDEO_SCENE1_OPENING_FRAME"));
const OUTPUT_FILE = path.resolve(process.env.AVANTIQO_VIDEO_SCENE1_OUTPUT || "avantiqo-video-ltx25-scene1.mp4");
const REPORT_FILE = path.resolve(process.env.AVANTIQO_VIDEO_SCENE1_REPORT || "avantiqo-video-ltx25-scene1-proof.json");
const RUN_ID = cleanRunId(process.env.GITHUB_RUN_ID);

if (!IMMUTABLE_IMAGE.includes("@sha256:")) throw new Error("AVANTIQO_VIDEO_LTX25_IMMUTABLE_IMAGE_REQUIRED");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function storageRef(storagePath) {
  return `storage://${BUCKET}/${storagePath}`;
}

async function removeStorage(storagePath) {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error && !text(error.message).toLowerCase().includes("not found")) throw error;
}

async function signedUpload(storagePath) {
  await removeStorage(storagePath).catch(() => null);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath, { upsert: false });
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("AVANTIQO_VIDEO_SCENE1_SIGNED_UPLOAD_REQUIRED");
  return { signed_url: data.signedUrl, storage_reference: storageRef(storagePath) };
}

async function readJson(storagePath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) {
    const code = Number(error.statusCode ?? error.status ?? 0);
    const message = text(error.message).toLowerCase();
    if ([400, 404].includes(code) || message.includes("not found") || message.includes("object not found")) return null;
    throw error;
  }
  return JSON.parse(await data.text());
}

async function waitForJson(storagePath, timeoutMs, onTick) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await readJson(storagePath);
    if (value) return value;
    if (onTick) await onTick();
    await sleep(15_000);
  }
  throw new Error(`AVANTIQO_VIDEO_SCENE1_RECEIPT_TIMEOUT:${storagePath}`);
}

async function acquireLease(ownerRequestId) {
  const endpointId = `pod-fallback:${ownerRequestId}`;
  const { data, error } = await supabase.rpc("acquire_avantiqo_video_runpod_lease_v2", {
    p_organization_id: ORGANIZATION_ID,
    p_lane: LANE,
    p_endpoint_id: endpointId,
    p_endpoint_name: ENDPOINT_NAME,
    p_owner_request_id: ownerRequestId,
    p_ttl_seconds: 1800,
  });
  if (error) throw new Error(`AVANTIQO_VIDEO_SCENE1_LEASE_ACQUIRE_FAILED:${error.code || "RPC"}`);
  if (!data?.id || data?.contract !== LEASE_CONTRACT || data?.state !== "ACTIVE") {
    throw new Error("AVANTIQO_VIDEO_SCENE1_LEASE_ACQUIRE_INVALID");
  }
  return data;
}

async function refreshLease(leaseId, ownerRequestId) {
  const { data, error } = await supabase.rpc("refresh_avantiqo_video_runpod_lease_v2", {
    p_lease_id: leaseId,
    p_owner_request_id: ownerRequestId,
    p_ttl_seconds: 1800,
  });
  if (error) throw new Error(`AVANTIQO_VIDEO_SCENE1_LEASE_REFRESH_FAILED:${error.code || "RPC"}`);
  if (!data?.id || data?.state !== "ACTIVE") throw new Error("AVANTIQO_VIDEO_SCENE1_LEASE_REFRESH_INVALID");
  return data;
}

async function releaseLease(leaseId, ownerRequestId, state = "RELEASED", reason = "SCENE1_COMPLETE") {
  if (!leaseId || !ownerRequestId) return;
  const { error } = await supabase.rpc("release_avantiqo_video_runpod_lease_v2", {
    p_lease_id: leaseId,
    p_owner_request_id: ownerRequestId,
    p_state: state,
    p_reason: reason,
  });
  if (error) throw new Error(`AVANTIQO_VIDEO_SCENE1_LEASE_RELEASE_FAILED:${error.code || "RPC"}`);
}

async function deleteAndConfirm(podId) {
  if (!podId) return;
  await deleteVideoPod(podId).catch(() => null);
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const pod = await getVideoPod(podId).catch(() => null);
    if (!pod || podTerminal(pod)) return;
    await sleep(5_000);
  }
  throw new Error(`AVANTIQO_VIDEO_SCENE1_POD_TERMINATION_TIMEOUT:${podId}`);
}

function placementUnavailable(error) {
  const status = Number(error?.httpStatus || 0);
  const message = text(error?.message).toLowerCase();
  return status === 500 && (message.includes("no instances currently available") || message.includes("no instances"));
}

async function createExactPod({ snapshot, name, imageName, gpuTypeId, minRamGb, env, command }) {
  const body = {
    allowedCudaVersions: ["12.8", "12.9", "13.0"],
    cloudType: "SECURE",
    computeType: "GPU",
    containerDiskInGb: Math.max(40, Number(snapshot.template?.containerDiskInGb ?? snapshot.template?.container_disk_gb ?? 40)),
    ...(snapshot.registryAuthId ? { containerRegistryAuthId: snapshot.registryAuthId } : {}),
    dataCenterIds: [AVANTIQO_VIDEO_POD_DC],
    dataCenterPriority: "availability",
    dockerEntrypoint: [],
    dockerStartCmd: command,
    env,
    gpuCount: 1,
    gpuTypeIds: [gpuTypeId],
    gpuTypePriority: "availability",
    imageName,
    interruptible: false,
    minRAMPerGPU: minRamGb,
    minVCPUPerGPU: 8,
    name,
    networkVolumeId: text(snapshot.volume.id),
    ports: [],
    volumeMountPath: "/runpod-volume",
  };
  const created = await podRest("/pods", { method: "POST", timeoutMs: 45_000, body });
  const id = text(created?.id ?? created?.pod?.id ?? created?.data?.id);
  if (!id) throw new Error("AVANTIQO_VIDEO_SCENE1_POD_ID_REQUIRED");
  const verified = await getVideoPod(id);
  if (!verified) throw new Error("AVANTIQO_VIDEO_SCENE1_POD_VERIFY_REQUIRED");
  const selected = text(verified?.machine?.gpuTypeId ?? verified?.machine?.gpuType?.id ?? verified?.gpuTypeId ?? verified?.gpu_type_id);
  if (selected && selected !== gpuTypeId) {
    await deleteAndConfirm(id);
    throw new Error(`AVANTIQO_VIDEO_SCENE1_GPU_MISMATCH:${selected}`);
  }
  return { id, gpu_type_id: selected || gpuTypeId };
}

async function createFromPool({ snapshot, name, imageName, gpuPool, minRamGb, env, command }) {
  let last = null;
  for (const gpuTypeId of gpuPool) {
    try {
      const pod = await createExactPod({ snapshot, name, imageName, gpuTypeId, minRamGb, env, command });
      console.log(`AVANTIQO_VIDEO_SCENE1_GPU_SELECTED=${pod.gpu_type_id}`);
      return pod;
    } catch (error) {
      last = error;
      if (!placementUnavailable(error)) throw error;
      console.log(`AVANTIQO_VIDEO_SCENE1_GPU_UNAVAILABLE=${gpuTypeId}`);
    }
  }
  throw last || new Error("AVANTIQO_VIDEO_SCENE1_GPU_POOL_EXHAUSTED");
}

function preloadPython() {
  const files = JSON.stringify(REQUIRED_MODEL_FILES);
  return `
import json, os
from pathlib import Path
import requests
from huggingface_hub import HfApi, hf_hub_download

repo = ${JSON.stringify(MODEL_REPO)}
root = Path('/runpod-volume/ltx-2.5')
files = json.loads(${JSON.stringify(files)})
receipt_url = os.environ['AVANTIQO_VIDEO_LTX25_PRELOAD_RECEIPT_URL']
token = os.environ.get('HF_TOKEN') or ''
receipt = {'success': False, 'contract': 'AVANTIQO_VIDEO_LTX25_PRELOAD_DISTILLED_V1', 'repo': repo, 'revision': None, 'files': []}
try:
    root.mkdir(parents=True, exist_ok=True)
    missing = [name for name in files if not (root / name).is_file() or (root / name).stat().st_size <= 0]
    revision = 'CACHED_EXISTING'
    if missing:
        if not token:
            raise RuntimeError('AVANTIQO_VIDEO_LTX25_HF_TOKEN_REQUIRED')
        revision = HfApi(token=token).model_info(repo_id=repo, token=token).sha
        if not revision:
            raise RuntimeError('AVANTIQO_VIDEO_LTX25_HF_REVISION_REQUIRED')
        for name in missing:
            try:
                hf_hub_download(repo_id=repo, filename=name, revision=revision, token=token, local_dir=str(root))
            except Exception as exc:
                raise RuntimeError('AVANTIQO_VIDEO_LTX25_MAIN_MODEL_DOWNLOAD_FAILED:' + name + ':' + exc.__class__.__name__)
    for name in files:
        p = root / name
        if not p.is_file() or p.stat().st_size <= 0:
            raise RuntimeError('AVANTIQO_VIDEO_LTX25_PRELOAD_FILE_MISSING:' + name)
        receipt['files'].append({'name': name, 'size_bytes': p.stat().st_size})
    receipt['success'] = True
    receipt['revision'] = revision
except Exception as exc:
    receipt['error_code'] = str(exc).split(':', 1)[0][:180]
    receipt['error_detail'] = str(exc)[:1200]
response = requests.put(receipt_url, data=json.dumps(receipt, separators=(',', ':')).encode(), headers={'content-type':'application/json','x-upsert':'false'}, timeout=120)
response.raise_for_status()
print('AVANTIQO_VIDEO_LTX25_PRELOAD_RECEIPT_WRITTEN=' + str(receipt.get('success') is True).lower(), flush=True)
`;
}

async function runPreload(snapshot) {
  const ownerRequestId = crypto.randomUUID();
  const receiptPath = `${ORGANIZATION_ID}/generated/avantiqo-video/.ltx25-receipts/scene1-distilled-preload-${RUN_ID}.json`;
  const receiptUpload = await signedUpload(receiptPath);
  let lease = null;
  let pod = null;
  try {
    lease = await acquireLease(ownerRequestId);
    pod = await createFromPool({
      snapshot,
      name: `avantiqo-video-ltx25-distilled-preload-${RUN_ID}`.slice(0, 100),
      imageName: IMMUTABLE_IMAGE,
      gpuPool: PRELOAD_GPU_POOL,
      minRamGb: 32,
      env: {
        ...object(snapshot.templateEnv),
        AVANTIQO_VIDEO_LTX25_PRELOAD_RECEIPT_URL: receiptUpload.signed_url,
        AVANTIQO_VIDEO_LTX25_MODEL_ROOT: "/runpod-volume/ltx-2.5",
        ...(process.env.HF_TOKEN ? { HF_TOKEN: process.env.HF_TOKEN } : {}),
      },
      command: ["python", "-u", "-c", preloadPython()],
    });
    let lastRefresh = Date.now();
    const receipt = await waitForJson(receiptPath, 45 * 60 * 1000, async () => {
      if (Date.now() - lastRefresh >= 8 * 60 * 1000) {
        await refreshLease(lease.id, ownerRequestId);
        lastRefresh = Date.now();
      }
      const live = await getVideoPod(pod.id).catch(() => null);
      if (live && podTerminal(live)) {
        const maybeReceipt = await readJson(receiptPath);
        if (!maybeReceipt) throw new Error("AVANTIQO_VIDEO_LTX25_PRELOAD_POD_EXITED_WITHOUT_RECEIPT");
      }
    });
    if (receipt?.success !== true) {
      throw new Error(`${receipt?.error_code || "AVANTIQO_VIDEO_LTX25_PRELOAD_FAILED"}:${text(receipt?.error_detail)}`);
    }
    if (!Array.isArray(receipt.files) || receipt.files.length !== REQUIRED_MODEL_FILES.length) {
      throw new Error("AVANTIQO_VIDEO_LTX25_PRELOAD_INVENTORY_INVALID");
    }
    console.log(`AVANTIQO_VIDEO_LTX25_PRELOAD_REVISION=${text(receipt.revision) || "UNKNOWN"}`);
    console.log("AVANTIQO_VIDEO_LTX25_DISTILLED_PRELOAD=PASS");
    return receipt;
  } finally {
    if (pod?.id) await deleteAndConfirm(pod.id).catch(() => null);
    if (lease?.id) await releaseLease(lease.id, ownerRequestId, "RELEASED", "VIDEO_LTX25_DISTILLED_PRELOAD_COMPLETE").catch(() => null);
  }
}

async function uploadOpeningFrame() {
  const bytes = await fs.readFile(OPENING_FRAME);
  if (bytes.length < 20_000) throw new Error("AVANTIQO_VIDEO_SCENE1_OPENING_FRAME_INVALID");
  const storagePath = `${ORGANIZATION_ID}/generated/avantiqo-video/.ltx25-inputs/scene1-opening-${RUN_ID}.jpg`;
  await removeStorage(storagePath).catch(() => null);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "image/jpeg",
    upsert: false,
    cacheControl: "3600",
  });
  if (error) throw error;
  const { data, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3 * 60 * 60);
  if (signedError) throw signedError;
  if (!data?.signedUrl) throw new Error("AVANTIQO_VIDEO_SCENE1_REFERENCE_SIGNED_URL_REQUIRED");
  return { signed_url: data.signedUrl, size_bytes: bytes.length };
}

function sceneInstruction() {
  return [
    "SCENE 1 — BEFORE THE DAY BEGINS.",
    "Begin from the supplied approved opening frame with the same composition, skyline geometry, cool pre-dawn blue atmosphere, warm sunrise at the left horizon, river reflections, illuminated streets and towers.",
    "Over five seconds execute an extremely restrained stabilized cinematic aerial push forward with a barely perceptible gentle descent. The movement must feel like a top New York commercial film, never like an AI demo or a time-lapse.",
    "The sunrise brightens only subtly; low clouds drift naturally; water reflections and tiny traffic movement remain physically plausible. Preserve the city architecture without melting, bending, duplicate buildings, jump cuts, yaw, roll, sudden zoom, or focal-length pumping.",
    "Treat the existing 04:47 AM / BEFORE THE DAY BEGINS typography and black cinematic bars as locked graphic elements: no spelling changes, no new text, no drift, no deformation, no flicker.",
    "Hold premium photographic realism, controlled contrast, fine atmospheric depth, natural motion blur and coherent exposure. End on a clean continuity frame that can cut directly into the next business-awakening scene.",
  ].join(" ");
}

function sceneJob(referenceUrl, outputUpload) {
  return {
    input: {
      contract: "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V2",
      capability: "ai.video.image_to_video",
      model: "avantiqo-ltx-2.5",
      instruction: sceneInstruction(),
      duration_seconds: 5,
      aspect_ratio: "16:9",
      resolution: "native-4k",
      fps: 24,
      seed: 4747,
      reference_images: [referenceUrl],
      cinematic_control: {
        contract: "AVANTIQO_CINEMATIC_CONTROL_V1",
        camera: {
          support: "stabilized aerial platform",
          framing: "ultra-wide city establishing shot",
          movement: "very slow push forward with barely perceptible descent",
          yaw: "locked",
          roll: "locked",
        },
        continuity: {
          opening_frame_locked: true,
          skyline_geometry_locked: true,
          title_graphics_locked: true,
          time_of_day: "04:47 AM pre-dawn into first sunrise",
        },
        frame_contract: { first_frame: "SUPPLIED_REFERENCE_FRAME", no_reset: true, no_jump_cut: true },
        negative_constraints: [
          "no architecture morphing",
          "no duplicate towers",
          "no warped horizon",
          "no camera roll",
          "no sudden zoom",
          "no time-lapse acceleration",
          "no text mutation",
          "no text flicker",
          "no added logos or words",
          "no artificial neon look",
          "no 720p intermediate",
          "no pixel-space upscale",
        ],
      },
      quality_lane: "hero",
      organization_id: ORGANIZATION_ID,
      usage_id: `scene1-distilled-${RUN_ID}`,
      output_upload: outputUpload,
    },
  };
}

async function runScene(snapshot, reference) {
  const ownerRequestId = crypto.randomUUID();
  const outputPath = `${ORGANIZATION_ID}/generated/avantiqo-video/.ltx25-foundation/scene1-${RUN_ID}.mp4`;
  const receiptPath = `${ORGANIZATION_ID}/generated/avantiqo-video/.ltx25-receipts/scene1-distilled-${RUN_ID}.json`;
  const [outputUpload, receiptUpload, workerSource] = await Promise.all([
    signedUpload(outputPath),
    signedUpload(receiptPath),
    fs.readFile(DISTILLED_WORKER_PATH, "utf8"),
  ]);
  const job = sceneJob(reference.signed_url, outputUpload);
  let lease = null;
  let pod = null;
  try {
    lease = await acquireLease(ownerRequestId);
    pod = await createFromPool({
      snapshot,
      name: `avantiqo-video-ltx25-scene1-distilled-${RUN_ID}`.slice(0, 100),
      imageName: IMMUTABLE_IMAGE,
      gpuPool: SCENE_GPU_POOL,
      minRamGb: 96,
      env: {
        ...object(snapshot.templateEnv),
        AVANTIQO_VIDEO_LTX25_JOB_B64: Buffer.from(JSON.stringify(job)).toString("base64"),
        AVANTIQO_VIDEO_LTX25_RECEIPT_SIGNED_URL: receiptUpload.signed_url,
        AVANTIQO_VIDEO_LTX25_RECEIPT_STORAGE_REFERENCE: receiptUpload.storage_reference,
        AVANTIQO_VIDEO_LTX25_MODEL_ROOT: "/runpod-volume/ltx-2.5",
        AVANTIQO_VIDEO_LTX25_HARD_TIMEOUT_SECONDS: "6300",
        AVANTIQO_VIDEO_LTX25_DISTILLED_WORKER_B64: Buffer.from(workerSource).toString("base64"),
      },
      command: [
        "python",
        "-u",
        "-c",
        "import base64,os; src=base64.b64decode(os.environ['AVANTIQO_VIDEO_LTX25_DISTILLED_WORKER_B64']); exec(compile(src,'<avantiqo-ltx25-distilled-worker>','exec'))",
      ],
    });
    let lastRefresh = Date.now();
    const receipt = await waitForJson(receiptPath, 110 * 60 * 1000, async () => {
      if (Date.now() - lastRefresh >= 8 * 60 * 1000) {
        await refreshLease(lease.id, ownerRequestId);
        lastRefresh = Date.now();
      }
      const live = await getVideoPod(pod.id).catch(() => null);
      if (live && podTerminal(live)) {
        const maybeReceipt = await readJson(receiptPath);
        if (!maybeReceipt) throw new Error("AVANTIQO_VIDEO_LTX25_SCENE1_POD_EXITED_WITHOUT_RECEIPT");
      }
    });
    if (receipt?.success !== true) {
      throw new Error(`${receipt?.error_code || "AVANTIQO_VIDEO_LTX25_SCENE1_FAILED"}:${text(receipt?.error_detail)}`);
    }
    const output = object(receipt.output);
    if (output.pixel_720p_stage_used !== false || output.lanczos_upscale_used !== false || output.external_provider_contacted !== false) {
      throw new Error("AVANTIQO_VIDEO_LTX25_SCENE1_QUALITY_BOUNDARY_INVALID");
    }
    if (Number(output.width) !== 3840 || Number(output.height) !== 2176 || Number(output.fps) !== 24) {
      throw new Error(`AVANTIQO_VIDEO_LTX25_SCENE1_NATIVE_OUTPUT_INVALID:${output.width}x${output.height}@${output.fps}`);
    }
    const { data, error } = await supabase.storage.from(BUCKET).download(outputPath);
    if (error) throw error;
    const buffer = Buffer.from(await data.arrayBuffer());
    if (!buffer.length) throw new Error("AVANTIQO_VIDEO_LTX25_SCENE1_OUTPUT_EMPTY");
    await fs.writeFile(OUTPUT_FILE, buffer);
    console.log(`AVANTIQO_VIDEO_LTX25_SCENE1_OUTPUT_BYTES=${buffer.length}`);
    console.log("AVANTIQO_VIDEO_LTX25_SCENE1_GENERATION=PASS");
    return { receipt, output_path: outputPath, pod_gpu_type_id: pod.gpu_type_id, output_bytes: buffer.length };
  } finally {
    if (pod?.id) await deleteAndConfirm(pod.id).catch(() => null);
    if (lease?.id) await releaseLease(lease.id, ownerRequestId, "RELEASED", "VIDEO_LTX25_SCENE1_COMPLETE").catch(() => null);
  }
}

async function main() {
  const report = {
    success: false,
    contract: "AVANTIQO_VIDEO_LTX25_SCENE1_DISTILLED_PROOF_V1",
    started_at: now(),
    run_id: RUN_ID,
    v5_immutable_image: IMMUTABLE_IMAGE,
    foundation_model: MODEL_REPO,
    production_deploy_performed: false,
    external_provider_contacted: false,
    wallet_mutation_performed: false,
    old_video_renderer_used: false,
    separately_gated_detailing_lora_used: false,
    opening_frame_source: path.basename(OPENING_FRAME),
    opening_frame_reference_uploaded: false,
    preload: null,
    generation: null,
    error_code: null,
  };
  try {
    const openingFrame = await uploadOpeningFrame();
    report.opening_frame_reference_uploaded = true;
    report.opening_frame_size_bytes = openingFrame.size_bytes;

    const preload = await runPreload(await videoPodCandidateSnapshot());
    report.preload = {
      success: true,
      revision: preload.revision,
      file_count: preload.files.length,
      total_bytes: preload.files.reduce((sum, item) => sum + Number(item.size_bytes || 0), 0),
    };

    const generation = await runScene(await videoPodCandidateSnapshot(), openingFrame);
    const output = object(generation.receipt?.output);
    report.generation = {
      success: true,
      gpu_type_id: generation.pod_gpu_type_id,
      storage_reference: storageRef(generation.output_path),
      output_size_bytes: generation.output_bytes,
      width: output.width,
      height: output.height,
      fps: output.fps,
      frame_count: output.frame_count,
      seed: output.seed,
      precision: output.precision,
      pipeline: output.pipeline,
      generation_seconds: output.generation_seconds,
      native_audio_generated: output.native_audio_generated === true,
      learned_spatial_upscaler_used: output.learned_spatial_upscaler_used === true,
      detailing_dfr_used: output.detailing_dfr_used === true,
      pixel_720p_stage_used: output.pixel_720p_stage_used,
      lanczos_upscale_used: output.lanczos_upscale_used,
      external_provider_contacted: output.external_provider_contacted,
    };
    report.success = true;
    report.completed_at = now();
  } catch (error) {
    report.error_code = text(error?.message).split(":")[0] || "AVANTIQO_VIDEO_LTX25_SCENE1_UNKNOWN_FAILURE";
    report.error_detail = text(error?.message).slice(0, 1800);
    report.completed_at = now();
    throw error;
  } finally {
    await fs.writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`AVANTIQO_VIDEO_LTX25_SCENE1_REPORT=${REPORT_FILE}`);
  }
}

main().catch((error) => {
  console.error(`AVANTIQO_VIDEO_LTX25_SCENE1_PROOF_FAILED=${text(error?.message).split(":")[0] || "UNKNOWN"}`);
  process.exitCode = 1;
});
