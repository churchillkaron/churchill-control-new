import crypto from "node:crypto";

import {
  cleanupCreativeVideoFlashVsrObjects,
  finalizeCreativeVideoFlashVsrMaster,
  prepareCreativeVideoFlashVsrInput,
  readCreativeVideoFlashVsrReceipt,
  AVANTIQO_VIDEO_FLASHVSR_MODEL,
  AVANTIQO_VIDEO_FLASHVSR_MODEL_REVISION,
} from "@/lib/creative/video/runtime/CreativeVideoStudioFlashVsrRuntime";
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
import { presignAvantiqoVideoRunpodVolumeObject } from "./AvantiqoVideoRunpodVolumeS3.js";

export const AVANTIQO_VIDEO_FLASHVSR_POD_CONTRACT = "AVANTIQO_VIDEO_FLASHVSR_EPHEMERAL_POD_V1";
export const AVANTIQO_VIDEO_FLASHVSR_GPU_TYPE = "NVIDIA A100 80GB PCIe";
export const AVANTIQO_VIDEO_FLASHVSR_IMAGE = process.env.AVANTIQO_VIDEO_FLASHVSR_IMAGE || "";

const STARTUP_TIMEOUT = 12 * 60 * 1000;
const HARD_TIMEOUT = 45 * 60 * 1000;
const REQUIRED_WEIGHT_KEYS = Object.freeze([
  "flashvsr/FlashVSR-v1.1/diffusion_pytorch_model_streaming_dmd.safetensors",
  "flashvsr/FlashVSR-v1.1/LQ_proj_in.ckpt",
  "flashvsr/FlashVSR-v1.1/TCDecoder.ckpt",
]);

async function requireWeightsPreloaded() {
  for (const key of REQUIRED_WEIGHT_KEYS) {
    const signed = presignAvantiqoVideoRunpodVolumeObject({ key, method: "HEAD", expires_seconds: 300 });
    const response = await fetch(signed.url, { method: "HEAD", signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`AVANTIQO_VIDEO_FLASHVSR_WEIGHT_MISSING:${key.split("/").pop()}:${response.status}`);
    const bytes = finite(response.headers.get("content-length"), 0);
    if (bytes <= 0) throw new Error(`AVANTIQO_VIDEO_FLASHVSR_WEIGHT_EMPTY:${key.split("/").pop()}`);
  }
}

function jobPayload(prepared) {
  return {
    contract: "AVANTIQO_VIDEO_FLASHVSR_GPU_MASTER_V1",
    input_path: prepared.input_path,
    output_path: prepared.output_path,
    receipt_path: prepared.receipt_path,
    width: prepared.width,
    height: prepared.height,
    source_frame_count: prepared.source_frame_count,
    padded_frame_count: prepared.padded_frame_count,
    fps: prepared.fps,
    seed: 0,
  };
}

async function createMasterPod({ ownerRequestId, snapshot, prepared }) {
  if (!AVANTIQO_VIDEO_FLASHVSR_IMAGE) throw new Error("AVANTIQO_VIDEO_FLASHVSR_IMMUTABLE_IMAGE_REQUIRED");
  const body = {
    allowedCudaVersions: ["12.4", "12.8", "12.9"],
    cloudType: "SECURE",
    computeType: "GPU",
    containerDiskInGb: 40,
    ...(snapshot.registryAuthId ? { containerRegistryAuthId: snapshot.registryAuthId } : {}),
    dataCenterIds: [AVANTIQO_VIDEO_POD_DC],
    dataCenterPriority: "availability",
    dockerEntrypoint: [],
    dockerStartCmd: ["python", "-u", "/app/flashvsr_worker.py"],
    env: {
      AVANTIQO_VIDEO_FLASHVSR_JOB_JSON: JSON.stringify(jobPayload(prepared)),
      AVANTIQO_FLASHVSR_WEIGHTS_ROOT: "/runpod-volume/flashvsr/FlashVSR-v1.1",
    },
    gpuCount: 1,
    gpuTypeIds: [AVANTIQO_VIDEO_FLASHVSR_GPU_TYPE],
    gpuTypePriority: "availability",
    imageName: AVANTIQO_VIDEO_FLASHVSR_IMAGE,
    interruptible: false,
    minRAMPerGPU: 64,
    minVCPUPerGPU: 4,
    name: `avantiqo-video-flashvsr-${ownerRequestId}`,
    networkVolumeId: text(snapshot.volume?.id),
    ports: [],
    volumeMountPath: "/runpod-volume",
  };
  const created = await podRest("/pods", { method: "POST", timeoutMs: 45_000, body });
  const id = text(created?.id ?? created?.pod?.id ?? created?.data?.id);
  if (!id) throw new Error("AVANTIQO_VIDEO_FLASHVSR_POD_ID_REQUIRED");
  const verified = await getVideoPod(id);
  if (!verified) throw new Error("AVANTIQO_VIDEO_FLASHVSR_POD_VERIFY_REQUIRED");
  const gpu = text(verified?.machine?.gpuTypeId ?? verified?.machine?.gpuType?.id ?? verified?.gpuTypeId ?? verified?.gpu_type_id);
  if (gpu && gpu !== AVANTIQO_VIDEO_FLASHVSR_GPU_TYPE) {
    await deleteVideoPod(id).catch(() => null);
    throw new Error(`AVANTIQO_VIDEO_FLASHVSR_GPU_UNCERTIFIED:${gpu}`);
  }
  return { id, gpu_type_id: gpu || AVANTIQO_VIDEO_FLASHVSR_GPU_TYPE };
}

export async function submitAvantiqoVideoFlashVsrMaster({ organizationId, sourceUrl } = {}) {
  if (!organizationId) throw new Error("AVANTIQO_VIDEO_FLASHVSR_ORGANIZATION_REQUIRED");
  if (!sourceUrl) throw new Error("AVANTIQO_VIDEO_FLASHVSR_SOURCE_REQUIRED");
  await requireWeightsPreloaded();
  const snapshot = await videoPodCandidateSnapshot();
  const owner = `master-${crypto.randomUUID()}`;
  const prepared = await prepareCreativeVideoFlashVsrInput({
    organization_id: organizationId,
    source_url: sourceUrl,
    owner_request_id: owner,
  });
  const lease = await acquireVideoPodLease({ organizationId, ownerRequestId: owner });
  let podId = null;
  try {
    const pod = await createMasterPod({ ownerRequestId: owner, snapshot, prepared });
    podId = pod.id;
    return {
      contract: AVANTIQO_VIDEO_FLASHVSR_POD_CONTRACT,
      owner_request_id: owner,
      pod_id: pod.id,
      lease_id: lease.id,
      lease_expires_at: lease.expires_at,
      organization_id: organizationId,
      source_url: sourceUrl,
      immutable_image: AVANTIQO_VIDEO_FLASHVSR_IMAGE,
      gpu_type_id: pod.gpu_type_id,
      model: AVANTIQO_VIDEO_FLASHVSR_MODEL,
      model_revision: AVANTIQO_VIDEO_FLASHVSR_MODEL_REVISION,
      prepared,
      submitted_at: new Date().toISOString(),
      startup_timeout_ms: STARTUP_TIMEOUT,
      hard_timeout_ms: HARD_TIMEOUT,
      fal_contacted: false,
      production_deploy_performed: false,
    };
  } catch (error) {
    if (podId) await deleteVideoPod(podId).catch(() => null);
    await releaseVideoPodLease({ leaseId: lease.id, ownerRequestId: owner, state: "FAILED", reason: text(error?.message).split(":")[0] }).catch(() => null);
    await cleanupCreativeVideoFlashVsrObjects(prepared).catch(() => null);
    throw error;
  }
}

export async function getAvantiqoVideoFlashVsrMasterStatus(masterJob = {}) {
  const owner = text(masterJob.owner_request_id);
  const leaseId = text(masterJob.lease_id);
  const podId = text(masterJob.pod_id);
  if (!owner || !leaseId || !podId) throw new Error("AVANTIQO_VIDEO_FLASHVSR_STATUS_IDENTITY_REQUIRED");

  const receipt = await readCreativeVideoFlashVsrReceipt(masterJob.prepared?.receipt_key);
  if (receipt) {
    await deleteVideoPod(podId).catch(() => null);
    await releaseVideoPodLease({
      leaseId,
      ownerRequestId: owner,
      state: receipt.success ? "RELEASED" : "FAILED",
      reason: receipt.success ? "VIDEO_FLASHVSR_GPU_RESULT_COMPLETED" : text(receipt.error_code) || "VIDEO_FLASHVSR_GPU_FAILED",
    }).catch(() => null);
    if (!receipt.success) {
      await cleanupCreativeVideoFlashVsrObjects(masterJob.prepared).catch(() => null);
      return { status: "failed", error: receipt.error_code || "AVANTIQO_VIDEO_FLASHVSR_GPU_FAILED", runpod_lease_active: false };
    }
    try {
      const final = await finalizeCreativeVideoFlashVsrMaster({
        organization_id: masterJob.organization_id,
        source_url: masterJob.source_url,
        prepared: masterJob.prepared,
        receipt,
      });
      await cleanupCreativeVideoFlashVsrObjects(masterJob.prepared).catch(() => null);
      return {
        status: "completed",
        final,
        receipt,
        runpod_lease_active: false,
        gpu_deleted_before_studio_encode: true,
      };
    } catch (error) {
      return {
        status: "failed",
        error: text(error?.message).split(":")[0] || "AVANTIQO_VIDEO_FLASHVSR_STUDIO_FINALIZE_FAILED",
        studio_finalize_retryable: true,
        runpod_lease_active: false,
      };
    }
  }

  const pod = await getVideoPod(podId);
  const age = Date.now() - Date.parse(text(masterJob.submitted_at));
  if (!pod && age < 120_000) {
    const fresh = await refreshVideoPodLease({ leaseId, ownerRequestId: owner });
    return { status: "processing", phase: "POD_CREATE_PROPAGATING", lease_expires_at: fresh.expires_at };
  }
  if (!pod || podTerminal(pod)) {
    if (pod) await deleteVideoPod(podId).catch(() => null);
    await releaseVideoPodLease({ leaseId, ownerRequestId: owner, state: "FAILED", reason: "VIDEO_FLASHVSR_POD_EXITED_WITHOUT_RECEIPT" }).catch(() => null);
    return { status: "failed", error: "AVANTIQO_VIDEO_FLASHVSR_POD_EXITED_WITHOUT_RECEIPT", runpod_lease_active: false };
  }
  const started = Date.parse(text(pod.lastStartedAt ?? pod.last_started_at));
  if (age >= HARD_TIMEOUT || (age >= STARTUP_TIMEOUT && !Number.isFinite(started))) {
    const code = age >= HARD_TIMEOUT ? "VIDEO_FLASHVSR_HARD_TIMEOUT" : "VIDEO_FLASHVSR_STARTUP_TIMEOUT";
    await deleteVideoPod(podId).catch(() => null);
    await releaseVideoPodLease({ leaseId, ownerRequestId: owner, state: "FAILED", reason: code }).catch(() => null);
    return { status: "failed", error: `AVANTIQO_${code}`, runpod_lease_active: false };
  }
  const fresh = await refreshVideoPodLease({ leaseId, ownerRequestId: owner });
  return { status: "processing", phase: "GPU_SUPER_RESOLUTION", lease_expires_at: fresh.expires_at, runpod_lease_active: true };
}

export async function abortAvantiqoVideoFlashVsrMaster(masterJob = {}, reason = "VIDEO_FLASHVSR_ABORTED") {
  if (masterJob.pod_id) await deleteVideoPod(text(masterJob.pod_id)).catch(() => null);
  if (masterJob.lease_id && masterJob.owner_request_id) {
    await releaseVideoPodLease({ leaseId: masterJob.lease_id, ownerRequestId: masterJob.owner_request_id, state: "FAILED", reason }).catch(() => null);
  }
  await cleanupCreativeVideoFlashVsrObjects(masterJob.prepared).catch(() => null);
}
