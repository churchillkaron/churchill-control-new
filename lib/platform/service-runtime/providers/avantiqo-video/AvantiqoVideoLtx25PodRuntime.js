import crypto from "node:crypto";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeProviderAssetUrl, resolveFirstCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import {
  AVANTIQO_VIDEO_POD_DC,
  deleteVideoPod,
  finite,
  getVideoPod,
  podRest,
  podTerminal,
  text,
  videoPodCandidateSnapshot,
} from "./AvantiqoVideoPodRunpod.js";
import {
  acquireVideoPodLease,
  refreshVideoPodLease,
  releaseVideoPodLease,
} from "./AvantiqoVideoPodLease.js";
import { confirmAvantiqoVideoPodTerminal } from "./AvantiqoVideoPodTermination.js";

export const AVANTIQO_VIDEO_LTX25_RUNTIME_CONTRACT = "AVANTIQO_VIDEO_LTX25_BLACKWELL_POD_V1";
export const AVANTIQO_VIDEO_LTX25_ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V2";
export const AVANTIQO_VIDEO_LTX25_MODEL = "Lightricks/LTX-2.5";
export const AVANTIQO_VIDEO_LTX25_PRODUCTION_GPU = "NVIDIA RTX PRO 6000 Blackwell Server Edition";
export const AVANTIQO_VIDEO_LTX25_HERO_GPU = "NVIDIA B200";

const BUCKET = "creative-assets";
const STARTUP_TIMEOUT = 12 * 60 * 1000;
const HARD_TIMEOUT = 110 * 60 * 1000;

const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const safeId = (value) => text(value).replace(/[^A-Za-z0-9_-]/g, "");

function image() {
  const value = text(process.env.AVANTIQO_VIDEO_LTX25_IMAGE);
  if (!value || !value.includes("@sha256:")) throw new Error("AVANTIQO_VIDEO_LTX25_IMMUTABLE_IMAGE_REQUIRED");
  return value;
}

function lane(input = {}) {
  const generation = object(input.generation);
  const parameters = { ...object(generation.provider_parameters), ...object(input.provider_parameters) };
  const value = text(input.quality_lane || input.qualityLane || parameters.quality_lane || parameters.qualityLane).toLowerCase();
  return ["hero", "film"].includes(value) ? "hero" : "production";
}

function gpuForLane(value) {
  return value === "hero" ? AVANTIQO_VIDEO_LTX25_HERO_GPU : AVANTIQO_VIDEO_LTX25_PRODUCTION_GPU;
}

function duration(input = {}) {
  const generation = object(input.generation);
  const value = finite(input.duration_seconds ?? input.duration ?? generation.duration_seconds ?? generation.duration, 5);
  return Math.max(2, Math.min(20, Math.round(value)));
}

function ratio(input = {}) {
  const generation = object(input.generation);
  const value = text(input.aspect_ratio || input.aspectRatio || input.ratio || generation.aspect_ratio || generation.ratio || "16:9");
  return ["16:9", "9:16", "1:1"].includes(value) ? value : "16:9";
}

function seed(input = {}) {
  const generation = object(input.generation);
  const value = input.seed ?? generation.seed ?? input.provider_parameters?.seed;
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 4294967295) throw new Error("AVANTIQO_VIDEO_SEED_INVALID");
  return number;
}

function instruction(input = {}) {
  const generation = object(input.generation);
  const value = text(input.provider_prompt || input.prompt || input.instructions_text || input.instructions || generation.instructions || generation.prompt);
  if (!value) throw new Error("AVANTIQO_VIDEO_INSTRUCTION_REQUIRED");
  if (value.length > 12000) throw new Error("AVANTIQO_VIDEO_INSTRUCTION_TOO_LONG");
  return value;
}

function control(input = {}) {
  const generation = object(input.generation);
  const shot = object(input.shot_specification || input.shotSpecification || generation.shot_specification);
  const requirements = object(input.requirements);
  return {
    contract: "AVANTIQO_CINEMATIC_CONTROL_V1",
    identity_lock: object(input.identity_lock || input.identityLock || generation.identity_lock),
    shot_specification: shot,
    camera: object(input.camera || shot.camera || requirements.camera),
    continuity: object(input.continuity || shot.continuity || requirements.continuity),
    frame_contract: object(input.frame_contract || input.frameContract || shot.frame_contract),
    negative_constraints: [...new Set([
      ...list(input.negative_constraints),
      ...list(requirements.negative_constraints),
      ...list(input.cinematic_control?.negative_constraints),
    ].map(text).filter(Boolean))],
  };
}

async function references(input = {}, organizationId) {
  const values = [
    input.image,
    input.source_image,
    input.sourceImage,
    input.reference_image,
    input.referenceImage,
    ...list(input.reference_images),
    ...list(input.referenceImages),
    ...list(input.provider_parameters?.reference_images),
    ...list(input.generation?.provider_parameters?.reference_images),
  ].filter(Boolean);
  const urls = [];
  for (const value of values) {
    const resolved = await resolveFirstCreativeProviderAssetUrl({ organization_id: organizationId, values: [value] });
    if (resolved && !urls.includes(resolved)) urls.push(resolved);
    if (urls.length >= 4) break;
  }
  return urls;
}

function paths(organizationId, usageId, ownerRequestId) {
  const usage = safeId(usageId);
  const owner = safeId(ownerRequestId);
  if (!usage || !owner) throw new Error("AVANTIQO_VIDEO_LTX25_IDENTITY_INVALID");
  return {
    output: `${organizationId}/generated/avantiqo-video/.ltx25-foundation/${usage}.mp4`,
    receipt: `${organizationId}/generated/avantiqo-video/.ltx25-receipts/${owner}.json`,
  };
}

const storageRef = (path) => `storage://${BUCKET}/${path}`;

async function signedUpload(path) {
  const { data, error } = await getServiceSupabase().storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("AVANTIQO_VIDEO_LTX25_SIGNED_UPLOAD_URL_REQUIRED");
  return { signed_url: data.signedUrl, storage_reference: storageRef(path) };
}

async function remove(pathsToRemove) {
  const clean = pathsToRemove.map(text).filter(Boolean);
  if (!clean.length) return;
  const { error } = await getServiceSupabase().storage.from(BUCKET).remove(clean);
  if (error && !text(error.message).toLowerCase().includes("not found")) throw error;
}

async function readReceipt(path) {
  const { data, error } = await getServiceSupabase().storage.from(BUCKET).download(path);
  if (error) {
    const status = Number(error.statusCode ?? error.status ?? 0);
    const message = text(error.message).toLowerCase();
    if ([400, 404].includes(status) || message.includes("not found")) return null;
    throw error;
  }
  const parsed = JSON.parse(await data.text());
  if (parsed?.contract !== "AVANTIQO_VIDEO_LTX25_BLACKWELL_V1") throw new Error("AVANTIQO_VIDEO_LTX25_RECEIPT_CONTRACT_INVALID");
  return parsed;
}

async function createPod({ snapshot, ownerRequestId, gpuTypeId, env }) {
  const body = {
    allowedCudaVersions: ["12.8", "12.9", "13.0"],
    cloudType: "SECURE",
    computeType: "GPU",
    containerDiskInGb: Math.max(40, finite(snapshot.template?.containerDiskInGb ?? snapshot.template?.container_disk_gb, 40)),
    ...(snapshot.registryAuthId ? { containerRegistryAuthId: snapshot.registryAuthId } : {}),
    dataCenterIds: [AVANTIQO_VIDEO_POD_DC],
    dataCenterPriority: "availability",
    dockerEntrypoint: [],
    dockerStartCmd: ["python", "-u", "/app/ltx25_worker.py"],
    env,
    gpuCount: 1,
    gpuTypeIds: [gpuTypeId],
    gpuTypePriority: "availability",
    imageName: image(),
    interruptible: false,
    minRAMPerGPU: 96,
    minVCPUPerGPU: 8,
    name: `avantiqo-video-ltx25-${ownerRequestId}`,
    networkVolumeId: text(snapshot.volume.id),
    ports: [],
    volumeMountPath: "/runpod-volume",
  };
  const created = await podRest("/pods", { method: "POST", timeoutMs: 45_000, body });
  const id = text(created?.id ?? created?.pod?.id ?? created?.data?.id);
  if (!id) throw new Error("AVANTIQO_VIDEO_LTX25_POD_ID_REQUIRED");
  const verified = await getVideoPod(id);
  if (!verified) throw new Error("AVANTIQO_VIDEO_LTX25_POD_VERIFY_REQUIRED");
  const selected = text(verified?.machine?.gpuTypeId ?? verified?.machine?.gpuType?.id ?? verified?.gpuTypeId ?? verified?.gpu_type_id);
  if (selected && selected !== gpuTypeId) {
    await deleteVideoPod(id).catch(() => null);
    await confirmAvantiqoVideoPodTerminal(id);
    throw new Error(`AVANTIQO_VIDEO_LTX25_GPU_MISMATCH:${selected}`);
  }
  return { id, gpu_type_id: selected || gpuTypeId };
}

export async function submitAvantiqoVideoLtx25Generation(input = {}) {
  const organizationId = text(input.context?.organization_id);
  const usageId = text(input.context?.usage_id);
  const capability = text(input.capability);
  if (!organizationId) throw new Error("organization_id required");
  if (!usageId) throw new Error("usage_id required");
  if (!["ai.video.generate", "ai.video.image_to_video"].includes(capability)) {
    throw new Error(`AVANTIQO_VIDEO_LTX25_CAPABILITY_UNSUPPORTED:${capability || "MISSING"}`);
  }
  const refs = await references(input, organizationId);
  if (capability === "ai.video.image_to_video" && !refs.length) throw new Error("AVANTIQO_VIDEO_IMAGE_TO_VIDEO_REFERENCE_REQUIRED");

  const qualityLane = lane(input);
  const gpuTypeId = gpuForLane(qualityLane);
  const ownerRequestId = crypto.randomUUID();
  const target = paths(organizationId, usageId, ownerRequestId);
  await remove([target.output, target.receipt]);
  const [outputUpload, receiptUpload] = await Promise.all([signedUpload(target.output), signedUpload(target.receipt)]);
  const snapshot = await videoPodCandidateSnapshot();
  const lease = await acquireVideoPodLease({ organizationId, ownerRequestId });
  let podId = null;
  try {
    const payload = {
      input: {
        contract: AVANTIQO_VIDEO_LTX25_ENGINE_CONTRACT,
        capability,
        model: "avantiqo-ltx-2.5",
        instruction: instruction(input),
        duration_seconds: duration(input),
        aspect_ratio: ratio(input),
        resolution: "native-4k",
        fps: 24,
        seed: seed(input),
        reference_images: refs,
        cinematic_control: control(input),
        quality_lane: qualityLane,
        organization_id: organizationId,
        usage_id: usageId,
        output_upload: outputUpload,
      },
    };
    const pod = await createPod({
      snapshot,
      ownerRequestId,
      gpuTypeId,
      env: {
        ...snapshot.templateEnv,
        AVANTIQO_VIDEO_LTX25_JOB_B64: Buffer.from(JSON.stringify(payload)).toString("base64"),
        AVANTIQO_VIDEO_LTX25_RECEIPT_SIGNED_URL: receiptUpload.signed_url,
        AVANTIQO_VIDEO_LTX25_RECEIPT_STORAGE_REFERENCE: receiptUpload.storage_reference,
        AVANTIQO_VIDEO_LTX25_MODEL_ROOT: text(process.env.AVANTIQO_VIDEO_LTX25_MODEL_ROOT || "/runpod-volume/ltx-2.5"),
        AVANTIQO_VIDEO_LTX25_NVFP4_ENABLED: qualityLane === "production" ? text(process.env.AVANTIQO_VIDEO_LTX25_NVFP4_ENABLED || "0") : "0",
      },
    });
    podId = pod.id;
    return {
      contract: AVANTIQO_VIDEO_LTX25_RUNTIME_CONTRACT,
      provider: "avantiqo-video",
      model: AVANTIQO_VIDEO_LTX25_MODEL,
      pod_id: pod.id,
      gpu_type_id: pod.gpu_type_id,
      quality_lane: qualityLane,
      lease_id: lease.id,
      lease_owner_request_id: ownerRequestId,
      lease_expires_at: lease.expires_at,
      organization_id: organizationId,
      usage_id: usageId,
      output_storage_reference: outputUpload.storage_reference,
      receipt_path: target.receipt,
      receipt_storage_reference: receiptUpload.storage_reference,
      submitted_at: new Date().toISOString(),
      startup_timeout_ms: STARTUP_TIMEOUT,
      hard_timeout_ms: HARD_TIMEOUT,
      external_provider_contacted: false,
      production_deploy_performed: false,
    };
  } catch (error) {
    if (podId) {
      await deleteVideoPod(podId).catch(() => null);
      await confirmAvantiqoVideoPodTerminal(podId).catch(() => null);
    }
    await releaseVideoPodLease({
      leaseId: lease.id,
      ownerRequestId,
      state: "FAILED",
      reason: text(error?.message).split(":")[0] || "VIDEO_LTX25_SUBMIT_FAILED",
    }).catch(() => null);
    throw error;
  }
}

export async function getAvantiqoVideoLtx25GenerationStatus({ organizationId, job } = {}) {
  if (!organizationId) throw new Error("organization_id required");
  const podId = text(job?.pod_id);
  const leaseId = text(job?.lease_id);
  const ownerRequestId = text(job?.lease_owner_request_id);
  const receiptPath = text(job?.receipt_path);
  if (!podId || !leaseId || !ownerRequestId || !receiptPath) throw new Error("AVANTIQO_VIDEO_LTX25_STATUS_IDENTITY_REQUIRED");

  const age = Date.now() - Date.parse(text(job.submitted_at));
  const pod = await getVideoPod(podId);
  if (!pod && age < 120_000) {
    const fresh = await refreshVideoPodLease({ leaseId, ownerRequestId });
    return { status: "processing", phase: "POD_CREATE_PROPAGATING", lease_expires_at: fresh.expires_at, runpod_lease_active: true };
  }

  if (!pod || podTerminal(pod)) {
    if (pod) await deleteVideoPod(podId).catch(() => null);
    await confirmAvantiqoVideoPodTerminal(podId).catch(() => null);
    await releaseVideoPodLease({ leaseId, ownerRequestId, state: "RELEASED", reason: "VIDEO_LTX25_POD_TERMINAL" }).catch(() => null);
    const receipt = await readReceipt(receiptPath);
    if (!receipt) return { status: "failed", error: "AVANTIQO_VIDEO_LTX25_POD_EXITED_WITHOUT_RECEIPT", runpod_lease_active: false };
    if (receipt.success !== true) return { status: "failed", error: receipt.error_code || "AVANTIQO_VIDEO_LTX25_GENERATION_FAILED", runpod_lease_active: false };
    const output = object(receipt.output);
    if (output.pixel_720p_stage_used !== false || output.lanczos_upscale_used !== false || output.external_provider_contacted !== false) {
      return { status: "failed", error: "AVANTIQO_VIDEO_LTX25_QUALITY_BOUNDARY_INVALID", runpod_lease_active: false };
    }
    const storageReference = text(output.storage_reference || job.output_storage_reference);
    const videoUrl = await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: storageReference });
    if (!videoUrl) return { status: "failed", error: "AVANTIQO_VIDEO_LTX25_SIGNED_OUTPUT_REQUIRED", runpod_lease_active: false };
    return {
      status: "completed",
      output: { ...output, storage_reference: storageReference, video_url: videoUrl, result: videoUrl },
      runpod_lease_active: false,
    };
  }

  const started = Date.parse(text(pod.lastStartedAt ?? pod.last_started_at));
  if (age >= HARD_TIMEOUT || (age >= STARTUP_TIMEOUT && !Number.isFinite(started))) {
    const reason = age >= HARD_TIMEOUT ? "VIDEO_LTX25_HARD_TIMEOUT" : "VIDEO_LTX25_STARTUP_TIMEOUT";
    await deleteVideoPod(podId).catch(() => null);
    await confirmAvantiqoVideoPodTerminal(podId).catch(() => null);
    await releaseVideoPodLease({ leaseId, ownerRequestId, state: "FAILED", reason }).catch(() => null);
    return { status: "failed", error: `AVANTIQO_${reason}`, runpod_lease_active: false };
  }

  const fresh = await refreshVideoPodLease({ leaseId, ownerRequestId });
  return { status: "processing", phase: "LTX25_DFR_GENERATION", lease_expires_at: fresh.expires_at, runpod_lease_active: true };
}

export async function abortAvantiqoVideoLtx25Generation(job = {}, reason = "VIDEO_LTX25_ABORTED") {
  const podId = text(job.pod_id);
  const ownerRequestId = text(job.lease_owner_request_id);
  const leaseId = text(job.lease_id);
  if (podId) {
    await deleteVideoPod(podId).catch(() => null);
    await confirmAvantiqoVideoPodTerminal(podId).catch(() => null);
  }
  if (leaseId && ownerRequestId) {
    await releaseVideoPodLease({ leaseId, ownerRequestId, state: "FAILED", reason }).catch(() => null);
  }
}
