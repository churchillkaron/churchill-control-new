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
import { confirmAvantiqoVideoPodTerminal } from "./AvantiqoVideoPodTermination.js";
import {
  createAvantiqoVideoVolumeCpuBridge,
  deleteAvantiqoVideoVolumeCpuBridge,
  statAvantiqoVideoVolumeObjectViaCpuBridge,
} from "./AvantiqoVideoRunpodVolumeCpuBridge.js";

export const AVANTIQO_VIDEO_FLASHVSR_POD_CONTRACT = "AVANTIQO_VIDEO_FLASHVSR_EPHEMERAL_POD_V1";
export const AVANTIQO_VIDEO_FLASHVSR_GPU_TYPE = "NVIDIA A100 80GB PCIe";
export const AVANTIQO_VIDEO_FLASHVSR_IMAGE = "ghcr.io/churchillkaron/avantiqo-video-flashvsr-v11@sha256:55919408e355960cf35f3c87a8d2c875c92a9e586ea43bb207dfcb93dc4d20fc";

const STARTUP_TIMEOUT = 12 * 60 * 1000;
const HARD_TIMEOUT = 45 * 60 * 1000;
const REQUIRED_WEIGHT_KEYS = Object.freeze([
  "flashvsr/FlashVSR-v1.1/diffusion_pytorch_model_streaming_dmd.safetensors",
  "flashvsr/FlashVSR-v1.1/LQ_proj_in.ckpt",
  "flashvsr/FlashVSR-v1.1/TCDecoder.ckpt",
]);

async function requireWeightsPreloaded(volumeBridge) {
  for (const key of REQUIRED_WEIGHT_KEYS) {
    const stat = await statAvantiqoVideoVolumeObjectViaCpuBridge(volumeBridge, key);
    if (stat?.exists !== true) throw new Error(`AVANTIQO_VIDEO_FLASHVSR_WEIGHT_MISSING:${key.split("/").pop()}`);
    const bytes = finite(stat?.size, 0);
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
  if (!AVANTIQO_VIDEO_FLASHVSR_IMAGE.includes("@sha256:")) throw new Error("AVANTIQO_VIDEO_FLASHVSR_IMMUTABLE_IMAGE_DIGEST_REQUIRED");
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

async function cleanupViaFreshBridge(prepared, ownerRequestId) {
  if (!prepared) return;
  let bridge = null;
  try {
    bridge = await createAvantiqoVideoVolumeCpuBridge({ owner_request_id: `${ownerRequestId}-cleanup` });
    await cleanupCreativeVideoFlashVsrObjects(prepared, bridge).catch(() => null);
  } finally {
    if (bridge) await deleteAvantiqoVideoVolumeCpuBridge(bridge).catch(() => null);
  }
}

async function retrieveAndFinalize(masterJob) {
  const owner = text(masterJob.owner_request_id);
  let bridge = null;
  try {
    bridge = await createAvantiqoVideoVolumeCpuBridge({ owner_request_id: `${owner}-retrieve` });
    const receipt = await readCreativeVideoFlashVsrReceipt(masterJob.prepared?.receipt_key, bridge);
    if (!receipt) {
      await cleanupCreativeVideoFlashVsrObjects(masterJob.prepared, bridge).catch(() => null);
      return {
        status: "failed",
        error: "AVANTIQO_VIDEO_FLASHVSR_POD_EXITED_WITHOUT_RECEIPT",
        runpod_lease_active: false,
        gpu_deleted_before_studio_encode: true,
        cpu_bridge_deleted: false,
      };
    }
    if (!receipt.success) {
      await cleanupCreativeVideoFlashVsrObjects(masterJob.prepared, bridge).catch(() => null);
      return {
        status: "failed",
        error: receipt.error_code || "AVANTIQO_VIDEO_FLASHVSR_GPU_FAILED",
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
      error: text(error?.message).split(":")[0] || "AVANTIQO_VIDEO_FLASHVSR_STUDIO_FINALIZE_FAILED",
      studio_finalize_retryable: false,
      runpod_lease_active: false,
      gpu_deleted_before_studio_encode: true,
      cpu_bridge_deleted: false,
    };
  } finally {
    if (bridge) await deleteAvantiqoVideoVolumeCpuBridge(bridge).catch(() => null);
  }
}

export async function submitAvantiqoVideoFlashVsrMaster({ organizationId, sourceUrl } = {}) {
  if (!organizationId) throw new Error("AVANTIQO_VIDEO_FLASHVSR_ORGANIZATION_REQUIRED");
  if (!sourceUrl) throw new Error("AVANTIQO_VIDEO_FLASHVSR_SOURCE_REQUIRED");
  if (!AVANTIQO_VIDEO_FLASHVSR_IMAGE || !AVANTIQO_VIDEO_FLASHVSR_IMAGE.includes("@sha256:")) {
    throw new Error("AVANTIQO_VIDEO_FLASHVSR_IMMUTABLE_IMAGE_REQUIRED");
  }
  const snapshot = await videoPodCandidateSnapshot();
  const owner = crypto.randomUUID();
  let uploadBridge = null;
  let prepared = null;
  let lease = null;
  let podId = null;
  try {
    uploadBridge = await createAvantiqoVideoVolumeCpuBridge({ owner_request_id: `${owner}-upload` });
    await requireWeightsPreloaded(uploadBridge);
    prepared = await prepareCreativeVideoFlashVsrInput({
      organization_id: organizationId,
      source_url: sourceUrl,
      owner_request_id: owner,
      volume_bridge: uploadBridge,
    });

    const uploadBridgeDelete = await deleteAvantiqoVideoVolumeCpuBridge(uploadBridge);
    if (uploadBridgeDelete.confirmed_terminal !== true) {
      throw new Error("AVANTIQO_VIDEO_FLASHVSR_UPLOAD_BRIDGE_DELETE_NOT_CONFIRMED");
    }
    uploadBridge = null;

    lease = await acquireVideoPodLease({ organizationId, ownerRequestId: owner });
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
      transfer_backend: "RUNPOD_CPU_VOLUME_BRIDGE_SEQUENTIAL",
      upload_bridge_deleted_before_gpu: true,
      concurrent_volume_writers: false,
      s3_credentials_required: false,
      fal_contacted: false,
      production_deploy_performed: false,
    };
  } catch (error) {
    if (podId) await deleteVideoPod(podId).catch(() => null);
    if (lease) await releaseVideoPodLease({ leaseId: lease.id, ownerRequestId: owner, state: "FAILED", reason: text(error?.message).split(":")[0] }).catch(() => null);
    if (prepared && uploadBridge) await cleanupCreativeVideoFlashVsrObjects(prepared, uploadBridge).catch(() => null);
    if (uploadBridge) await deleteAvantiqoVideoVolumeCpuBridge(uploadBridge).catch(() => null);
    if (prepared && !uploadBridge) await cleanupViaFreshBridge(prepared, owner).catch(() => null);
    throw error;
  }
}

export async function getAvantiqoVideoFlashVsrMasterStatus(masterJob = {}) {
  const owner = text(masterJob.owner_request_id);
  const leaseId = text(masterJob.lease_id);
  const podId = text(masterJob.pod_id);
  if (!owner || !leaseId || !podId || !masterJob.prepared) throw new Error("AVANTIQO_VIDEO_FLASHVSR_STATUS_IDENTITY_REQUIRED");

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
      reason: "VIDEO_FLASHVSR_GPU_POD_TERMINAL_RETRIEVE_RECEIPT",
    }).catch(() => null);
    const retrieved = await retrieveAndFinalize(masterJob);
    return {
      ...retrieved,
      cpu_bridge_deleted: true,
    };
  }

  const started = Date.parse(text(pod.lastStartedAt ?? pod.last_started_at));
  if (age >= HARD_TIMEOUT || (age >= STARTUP_TIMEOUT && !Number.isFinite(started))) {
    const code = age >= HARD_TIMEOUT ? "VIDEO_FLASHVSR_HARD_TIMEOUT" : "VIDEO_FLASHVSR_STARTUP_TIMEOUT";
    await deleteVideoPod(podId).catch(() => null);
    await releaseVideoPodLease({ leaseId, ownerRequestId: owner, state: "FAILED", reason: code }).catch(() => null);
    await cleanupViaFreshBridge(masterJob.prepared, owner).catch(() => null);
    return {
      status: "failed",
      error: `AVANTIQO_${code}`,
      runpod_lease_active: false,
      cpu_bridge_deleted: true,
    };
  }

  const fresh = await refreshVideoPodLease({ leaseId, ownerRequestId: owner });
  return {
    status: "processing",
    phase: "GPU_SUPER_RESOLUTION",
    lease_expires_at: fresh.expires_at,
    runpod_lease_active: true,
    cpu_bridge_active: false,
  };
}

export async function abortAvantiqoVideoFlashVsrMaster(masterJob = {}, reason = "VIDEO_FLASHVSR_ABORTED") {
  if (masterJob.pod_id) await deleteVideoPod(text(masterJob.pod_id)).catch(() => null);
  if (masterJob.lease_id && masterJob.owner_request_id) {
    await releaseVideoPodLease({ leaseId: masterJob.lease_id, ownerRequestId: masterJob.owner_request_id, state: "FAILED", reason }).catch(() => null);
  }
  if (masterJob.prepared && masterJob.owner_request_id) {
    await cleanupViaFreshBridge(masterJob.prepared, text(masterJob.owner_request_id)).catch(() => null);
  }
}
