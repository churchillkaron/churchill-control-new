import crypto from "node:crypto";

import {
  cleanupCreativeVideoFlashVsrObjects,
  finalizeCreativeVideoFlashVsrMaster,
  prepareCreativeVideoFlashVsrInput,
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
import { confirmAvantiqoVideoPodTerminal } from "./AvantiqoVideoPodTermination.js";
import {
  createAvantiqoVideoVolumeCpuBridge,
  deleteAvantiqoVideoVolumeCpuBridge,
  readAvantiqoVideoVolumeJsonViaCpuBridge,
  statAvantiqoVideoVolumeObjectViaCpuBridge,
} from "./AvantiqoVideoRunpodVolumeCpuBridge.js";

export const AVANTIQO_VIDEO_FLASHDREAMS_POD_CONTRACT = "AVANTIQO_VIDEO_FLASHDREAMS_EPHEMERAL_POD_V1";
export const AVANTIQO_VIDEO_FLASHDREAMS_RECEIPT_CONTRACT = "AVANTIQO_VIDEO_FLASHDREAMS_FLASHVSR_GPU_MASTER_V1";
export const AVANTIQO_VIDEO_FLASHDREAMS_SOURCE_COMMIT = "289da6f1d232de5abaa30d686c977b9c0040fe76";
export const AVANTIQO_VIDEO_FLASHDREAMS_GPU_POOL = Object.freeze([
  "NVIDIA B200",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
]);
export const AVANTIQO_VIDEO_FLASHDREAMS_IMAGE = text(process.env.AVANTIQO_VIDEO_FLASHDREAMS_IMAGE);

const STARTUP_TIMEOUT = 5 * 60 * 1000;
const HARD_TIMEOUT = 8 * 60 * 1000;
const FLASHDREAMS_INPUT_ALIGNMENT = 64;
const REQUIRED_WEIGHT_KEYS = Object.freeze([
  "flashvsr/FlashVSR-v1.1/diffusion_pytorch_model_streaming_dmd.safetensors",
  "flashvsr/FlashVSR-v1.1/LQ_proj_in.ckpt",
  "flashvsr/FlashVSR-v1.1/TCDecoder.ckpt",
]);

async function requireWeightsPreloaded(volumeBridge) {
  for (const key of REQUIRED_WEIGHT_KEYS) {
    const stat = await statAvantiqoVideoVolumeObjectViaCpuBridge(volumeBridge, key);
    if (stat?.exists !== true) throw new Error(`AVANTIQO_VIDEO_FLASHDREAMS_WEIGHT_MISSING:${key.split("/").pop()}`);
    if (finite(stat?.size, 0) <= 0) throw new Error(`AVANTIQO_VIDEO_FLASHDREAMS_WEIGHT_EMPTY:${key.split("/").pop()}`);
  }
}

function flashDreamsEfficientTarget(prepared = {}) {
  const sourceWidth = Math.max(1, Math.round(finite(prepared.source_width, 0)));
  const sourceHeight = Math.max(1, Math.round(finite(prepared.source_height, 0)));
  const alignedWidth = Math.max(FLASHDREAMS_INPUT_ALIGNMENT, Math.floor(sourceWidth / FLASHDREAMS_INPUT_ALIGNMENT) * FLASHDREAMS_INPUT_ALIGNMENT);
  const alignedHeight = Math.max(FLASHDREAMS_INPUT_ALIGNMENT, Math.floor(sourceHeight / FLASHDREAMS_INPUT_ALIGNMENT) * FLASHDREAMS_INPUT_ALIGNMENT);
  return {
    width: alignedWidth * 2,
    height: alignedHeight * 2,
    learned_target_profile: "SOURCE_ALIGNED_2X",
    learned_input_width: alignedWidth,
    learned_input_height: alignedHeight,
  };
}

function jobPayload(prepared) {
  return {
    contract: AVANTIQO_VIDEO_FLASHDREAMS_RECEIPT_CONTRACT,
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
  if (!AVANTIQO_VIDEO_FLASHDREAMS_IMAGE) throw new Error("AVANTIQO_VIDEO_FLASHDREAMS_IMMUTABLE_IMAGE_REQUIRED");
  if (!AVANTIQO_VIDEO_FLASHDREAMS_IMAGE.includes("@sha256:")) throw new Error("AVANTIQO_VIDEO_FLASHDREAMS_IMMUTABLE_IMAGE_DIGEST_REQUIRED");
  const body = {
    allowedCudaVersions: ["13.0"],
    cloudType: "SECURE",
    computeType: "GPU",
    containerDiskInGb: 60,
    ...(snapshot.registryAuthId ? { containerRegistryAuthId: snapshot.registryAuthId } : {}),
    dataCenterIds: [AVANTIQO_VIDEO_POD_DC],
    dataCenterPriority: "availability",
    dockerEntrypoint: [],
    dockerStartCmd: ["/opt/flashdreams/.venv/bin/python", "-u", "/app/flashdreams_flashvsr_worker.py"],
    env: {
      AVANTIQO_VIDEO_FLASHVSR_JOB_JSON: JSON.stringify(jobPayload(prepared)),
      AVANTIQO_FLASHVSR_WEIGHTS_ROOT: "/runpod-volume/flashvsr/FlashVSR-v1.1",
      AVANTIQO_FLASHVSR_PROMPT_PATH: "/opt/avantiqo-flashvsr/posi_prompt.pth",
      FLASHDREAMS_CACHE_DIR: "/runpod-volume/flashdreams-cache",
      TORCHINDUCTOR_CACHE_DIR: "/runpod-volume/flashdreams-cache/torchinductor",
      TRITON_CACHE_DIR: "/runpod-volume/flashdreams-cache/triton",
    },
    gpuCount: 1,
    gpuTypeIds: [...AVANTIQO_VIDEO_FLASHDREAMS_GPU_POOL],
    gpuTypePriority: "availability",
    imageName: AVANTIQO_VIDEO_FLASHDREAMS_IMAGE,
    interruptible: false,
    minRAMPerGPU: 64,
    minVCPUPerGPU: 8,
    name: `avantiqo-video-flashdreams-${ownerRequestId}`,
    networkVolumeId: text(snapshot.volume?.id),
    ports: [],
    volumeMountPath: "/runpod-volume",
  };
  const created = await podRest("/pods", { method: "POST", timeoutMs: 45_000, body });
  const id = text(created?.id ?? created?.pod?.id ?? created?.data?.id);
  if (!id) throw new Error("AVANTIQO_VIDEO_FLASHDREAMS_POD_ID_REQUIRED");
  const verified = await getVideoPod(id);
  if (!verified) throw new Error("AVANTIQO_VIDEO_FLASHDREAMS_POD_VERIFY_REQUIRED");
  const gpu = text(verified?.machine?.gpuTypeId ?? verified?.machine?.gpuType?.id ?? verified?.gpuTypeId ?? verified?.gpu_type_id);
  if (gpu && !AVANTIQO_VIDEO_FLASHDREAMS_GPU_POOL.includes(gpu)) {
    await deleteVideoPod(id).catch(() => null);
    await confirmAvantiqoVideoPodTerminal(id);
    throw new Error(`AVANTIQO_VIDEO_FLASHDREAMS_GPU_UNCERTIFIED:${gpu}`);
  }
  return { id, gpu_type_id: gpu || "PLACEMENT_PENDING" };
}

async function cleanupViaFreshBridge(prepared, ownerRequestId) {
  if (!prepared) return;
  let bridge = null;
  try {
    bridge = await createAvantiqoVideoVolumeCpuBridge({ owner_request_id: `${ownerRequestId}-fd-cleanup` });
    await cleanupCreativeVideoFlashVsrObjects(prepared, bridge).catch(() => null);
  } finally {
    if (bridge) await deleteAvantiqoVideoVolumeCpuBridge(bridge).catch(() => null);
  }
}

async function readFlashDreamsReceipt(receiptKey, volumeBridge) {
  try {
    const receipt = await readAvantiqoVideoVolumeJsonViaCpuBridge(volumeBridge, receiptKey, { max_bytes: 2 * 1024 * 1024 });
    if (receipt?.contract !== AVANTIQO_VIDEO_FLASHDREAMS_RECEIPT_CONTRACT) {
      throw new Error("AVANTIQO_VIDEO_FLASHDREAMS_RECEIPT_CONTRACT_INVALID");
    }
    if (receipt?.flashdreams_commit !== AVANTIQO_VIDEO_FLASHDREAMS_SOURCE_COMMIT) {
      throw new Error("AVANTIQO_VIDEO_FLASHDREAMS_SOURCE_COMMIT_DRIFT");
    }
    if (Number(receipt?.sparse_ratio) !== 1.5 || Number(receipt?.chunk_size) !== 8) {
      throw new Error("AVANTIQO_VIDEO_FLASHDREAMS_PERFORMANCE_PROFILE_DRIFT");
    }
    return receipt;
  } catch (error) {
    if (error?.code === "NOT_FOUND" || text(error?.message).includes("_NOT_FOUND")) return null;
    throw error;
  }
}

async function inspectAndCleanupViaFreshBridge(prepared, ownerRequestId) {
  if (!prepared) return null;
  let bridge = null;
  try {
    bridge = await createAvantiqoVideoVolumeCpuBridge({ owner_request_id: `${ownerRequestId}-fd-inspect-cleanup` });
    const receipt = await readFlashDreamsReceipt(prepared.receipt_key, bridge).catch(() => null);
    await cleanupCreativeVideoFlashVsrObjects(prepared, bridge).catch(() => null);
    return receipt;
  } finally {
    if (bridge) await deleteAvantiqoVideoVolumeCpuBridge(bridge).catch(() => null);
  }
}

async function retrieveAndFinalize(masterJob) {
  const owner = text(masterJob.owner_request_id);
  let bridge = null;
  try {
    bridge = await createAvantiqoVideoVolumeCpuBridge({ owner_request_id: `${owner}-fd-retrieve` });
    const receipt = await readFlashDreamsReceipt(masterJob.prepared?.receipt_key, bridge);
    if (!receipt) {
      await cleanupCreativeVideoFlashVsrObjects(masterJob.prepared, bridge).catch(() => null);
      return {
        status: "failed",
        error: "AVANTIQO_VIDEO_FLASHDREAMS_POD_EXITED_WITHOUT_RECEIPT",
        runpod_lease_active: false,
        gpu_deleted_before_studio_encode: true,
        cpu_bridge_deleted: false,
      };
    }
    if (!receipt.success) {
      await cleanupCreativeVideoFlashVsrObjects(masterJob.prepared, bridge).catch(() => null);
      return {
        status: "failed",
        error: receipt.error_code || "AVANTIQO_VIDEO_FLASHDREAMS_GPU_FAILED",
        receipt,
        runpod_lease_active: false,
        gpu_deleted_before_studio_encode: true,
        cpu_bridge_deleted: false,
      };
    }
    const final = await finalizeCreativeVideoFlashVsrMaster({
      organization_id: masterJob.organization_id,
      source_url: masterJob.source_url,
      prepared: masterJob.prepared,
      receipt,
      volume_bridge: bridge,
    });
    await cleanupCreativeVideoFlashVsrObjects(masterJob.prepared, bridge).catch(() => null);
    return {
      status: "completed",
      final,
      receipt,
      runpod_lease_active: false,
      gpu_deleted_before_studio_encode: true,
      cpu_bridge_deleted: false,
    };
  } catch (error) {
    if (bridge) await cleanupCreativeVideoFlashVsrObjects(masterJob.prepared, bridge).catch(() => null);
    return {
      status: "failed",
      error: text(error?.message).split(":")[0] || "AVANTIQO_VIDEO_FLASHDREAMS_STUDIO_FINALIZE_FAILED",
      studio_finalize_retryable: false,
      runpod_lease_active: false,
      gpu_deleted_before_studio_encode: true,
      cpu_bridge_deleted: false,
    };
  } finally {
    if (bridge) await deleteAvantiqoVideoVolumeCpuBridge(bridge).catch(() => null);
  }
}

export async function submitAvantiqoVideoFlashDreamsMaster({ organizationId, sourceUrl } = {}) {
  if (!organizationId) throw new Error("AVANTIQO_VIDEO_FLASHDREAMS_ORGANIZATION_REQUIRED");
  if (!sourceUrl) throw new Error("AVANTIQO_VIDEO_FLASHDREAMS_SOURCE_REQUIRED");
  if (!AVANTIQO_VIDEO_FLASHDREAMS_IMAGE || !AVANTIQO_VIDEO_FLASHDREAMS_IMAGE.includes("@sha256:")) {
    throw new Error("AVANTIQO_VIDEO_FLASHDREAMS_IMMUTABLE_IMAGE_REQUIRED");
  }
  const snapshot = await videoPodCandidateSnapshot();
  const owner = crypto.randomUUID();
  let uploadBridge = null;
  let prepared = null;
  let lease = null;
  let podId = null;
  try {
    uploadBridge = await createAvantiqoVideoVolumeCpuBridge({ owner_request_id: `${owner}-fd-upload` });
    await requireWeightsPreloaded(uploadBridge);
    prepared = await prepareCreativeVideoFlashVsrInput({
      organization_id: organizationId,
      source_url: sourceUrl,
      owner_request_id: owner,
      volume_bridge: uploadBridge,
    });
    prepared = { ...prepared, ...flashDreamsEfficientTarget(prepared) };

    const uploadBridgeDelete = await deleteAvantiqoVideoVolumeCpuBridge(uploadBridge);
    if (uploadBridgeDelete.confirmed_terminal !== true) {
      throw new Error("AVANTIQO_VIDEO_FLASHDREAMS_UPLOAD_BRIDGE_DELETE_NOT_CONFIRMED");
    }
    uploadBridge = null;

    lease = await acquireVideoPodLease({ organizationId, ownerRequestId: owner });
    const pod = await createMasterPod({ ownerRequestId: owner, snapshot, prepared });
    podId = pod.id;
    return {
      contract: AVANTIQO_VIDEO_FLASHDREAMS_POD_CONTRACT,
      owner_request_id: owner,
      pod_id: pod.id,
      lease_id: lease.id,
      lease_expires_at: lease.expires_at,
      organization_id: organizationId,
      source_url: sourceUrl,
      immutable_image: AVANTIQO_VIDEO_FLASHDREAMS_IMAGE,
      gpu_type_id: pod.gpu_type_id,
      gpu_type_pool: [...AVANTIQO_VIDEO_FLASHDREAMS_GPU_POOL],
      model: AVANTIQO_VIDEO_FLASHVSR_MODEL,
      model_revision: AVANTIQO_VIDEO_FLASHVSR_MODEL_REVISION,
      flashdreams_commit: AVANTIQO_VIDEO_FLASHDREAMS_SOURCE_COMMIT,
      prepared,
      submitted_at: new Date().toISOString(),
      startup_timeout_ms: STARTUP_TIMEOUT,
      hard_timeout_ms: HARD_TIMEOUT,
      persistent_compile_cache: true,
      transfer_backend: "RUNPOD_CPU_VOLUME_BRIDGE_COMPACT_MP4",
      upload_bridge_deleted_before_gpu: true,
      concurrent_volume_writers: false,
      s3_credentials_required: false,
      fal_contacted: false,
      production_deploy_performed: false,
      live_runtime_switched: false,
    };
  } catch (error) {
    if (podId) { await deleteVideoPod(podId).catch(() => null); await confirmAvantiqoVideoPodTerminal(podId); }
    if (lease) await releaseVideoPodLease({ leaseId: lease.id, ownerRequestId: owner, state: "FAILED", reason: text(error?.message).split(":")[0] }).catch(() => null);
    if (prepared && uploadBridge) await cleanupCreativeVideoFlashVsrObjects(prepared, uploadBridge).catch(() => null);
    if (uploadBridge) await deleteAvantiqoVideoVolumeCpuBridge(uploadBridge).catch(() => null);
    if (prepared && !uploadBridge) await cleanupViaFreshBridge(prepared, owner).catch(() => null);
    throw error;
  }
}

export async function getAvantiqoVideoFlashDreamsMasterStatus(masterJob = {}) {
  const owner = text(masterJob.owner_request_id);
  const leaseId = text(masterJob.lease_id);
  const podId = text(masterJob.pod_id);
  if (!owner || !leaseId || !podId || !masterJob.prepared) throw new Error("AVANTIQO_VIDEO_FLASHDREAMS_STATUS_IDENTITY_REQUIRED");

  const pod = await getVideoPod(podId);
  const age = Date.now() - Date.parse(text(masterJob.submitted_at));
  if (!pod && age < 120_000) {
    const fresh = await refreshVideoPodLease({ leaseId, ownerRequestId: owner });
    return {
      status: "processing",
      phase: "POD_CREATE_PROPAGATING",
      lease_expires_at: fresh.expires_at,
      runpod_lease_active: true,
      cpu_bridge_active: false,
    };
  }

  if (!pod || podTerminal(pod)) {
    if (pod) await deleteVideoPod(podId).catch(() => null);
    await confirmAvantiqoVideoPodTerminal(podId);
    await releaseVideoPodLease({
      leaseId,
      ownerRequestId: owner,
      state: "RELEASED",
      reason: "VIDEO_FLASHDREAMS_GPU_POD_TERMINAL_RETRIEVE_RECEIPT",
    }).catch(() => null);
    const retrieved = await retrieveAndFinalize(masterJob);
    return { ...retrieved, cpu_bridge_deleted: true };
  }

  const started = Date.parse(text(pod.lastStartedAt ?? pod.last_started_at));
  if (age >= HARD_TIMEOUT || (age >= STARTUP_TIMEOUT && !Number.isFinite(started))) {
    const code = age >= HARD_TIMEOUT ? "VIDEO_FLASHDREAMS_HARD_TIMEOUT" : "VIDEO_FLASHDREAMS_STARTUP_TIMEOUT";
    await deleteVideoPod(podId).catch(() => null);
    await confirmAvantiqoVideoPodTerminal(podId);
    const timeoutReceipt = await inspectAndCleanupViaFreshBridge(masterJob.prepared, owner).catch(() => null);
    await releaseVideoPodLease({ leaseId, ownerRequestId: owner, state: "FAILED", reason: code }).catch(() => null);
    return {
      status: "failed",
      error: `AVANTIQO_${code}`,
      receipt: timeoutReceipt,
      timeout_progress: timeoutReceipt ? {
        gpu_name: timeoutReceipt.gpu_name || null,
        chunks_completed: finite(timeoutReceipt.chunks_completed, 0),
        frames_read: finite(timeoutReceipt.frames_read, 0),
        frames_written: finite(timeoutReceipt.frames_written, 0),
        pipeline_setup_seconds: finite(timeoutReceipt.pipeline_setup_seconds, null),
        inference_elapsed_seconds: finite(timeoutReceipt.inference_elapsed_seconds, null),
      } : null,
      runpod_lease_active: false,
      cpu_bridge_deleted: true,
    };
  }

  const fresh = await refreshVideoPodLease({ leaseId, ownerRequestId: owner });
  return {
    status: "processing",
    phase: "GPU_SUPER_RESOLUTION_FLASHDREAMS",
    lease_expires_at: fresh.expires_at,
    runpod_lease_active: true,
    cpu_bridge_active: false,
  };
}

export async function abortAvantiqoVideoFlashDreamsMaster(masterJob = {}, reason = "VIDEO_FLASHDREAMS_ABORTED") {
  if (masterJob.pod_id) {
    await deleteVideoPod(text(masterJob.pod_id)).catch(() => null);
    await confirmAvantiqoVideoPodTerminal(text(masterJob.pod_id));
  }
  if (masterJob.lease_id && masterJob.owner_request_id) {
    await releaseVideoPodLease({ leaseId: masterJob.lease_id, ownerRequestId: masterJob.owner_request_id, state: "FAILED", reason }).catch(() => null);
  }
  if (masterJob.prepared && masterJob.owner_request_id) {
    await cleanupViaFreshBridge(masterJob.prepared, text(masterJob.owner_request_id)).catch(() => null);
  }
}
