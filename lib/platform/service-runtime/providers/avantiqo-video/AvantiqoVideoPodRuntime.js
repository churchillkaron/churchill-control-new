import crypto from "node:crypto";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveFirstCreativeProviderAssetUrl, resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import {
  assembleCreativeVideoStudioFoundation,
  AVANTIQO_VIDEO_STUDIO_FOUNDATION_CONTRACT,
} from "@/lib/creative/video/runtime/CreativeVideoStudioFoundationRuntime";
import {
  AVANTIQO_VIDEO_POD_CACHE_VOLUME,
  AVANTIQO_VIDEO_POD_DC,
  AVANTIQO_VIDEO_POD_GPU,
  AVANTIQO_VIDEO_POD_IMAGE,
  deleteVideoPod,
  finite,
  getVideoPod,
  list,
  listVideoPods,
  podTerminal,
  text,
  videoPodCandidateSnapshot,
  videoPodCapacity,
} from "./AvantiqoVideoPodRunpod.js";
import { createVideoPodWithCertifiedVolumeFailover } from "./AvantiqoVideoPodVolumeFailover.js";
import {
  acquireVideoPodLease,
  activeVideoPodLeases,
  AVANTIQO_VIDEO_POD_LEASE_PREFIX,
  refreshVideoPodLease,
  releaseVideoPodLease,
} from "./AvantiqoVideoPodLease.js";

export { AVANTIQO_VIDEO_POD_LEASE_PREFIX };
export const AVANTIQO_VIDEO_POD_RUNTIME_CONTRACT = "AVANTIQO_VIDEO_EPHEMERAL_POD_RUNTIME_V1";
export const AVANTIQO_VIDEO_POD_COMPUTE_BOUNDARY_CONTRACT = "AVANTIQO_STUDIO_FIRST_COMPUTE_BOUNDARY_V1";
const BUCKET = "creative-assets";
const STARTUP_TIMEOUT = 15 * 60 * 1000;
const HARD_TIMEOUT = 105 * 60 * 1000;

const obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const safeId = (v) => text(v).replace(/[^A-Za-z0-9_-]/g, "");
const duration = (input) => Math.max(2, Math.min(10, Math.round(finite(input.duration_seconds ?? input.duration ?? obj(input.generation).duration_seconds ?? obj(input.generation).duration, 5))));
const ratio = (input) => {
  const value = text(input.aspect_ratio || input.aspectRatio || input.ratio || obj(input.generation).aspect_ratio || "16:9");
  return ["16:9", "9:16", "1:1"].includes(value) ? value : "16:9";
};
const seed = (input) => {
  const value = input.seed ?? obj(input.generation).seed ?? input.provider_parameters?.seed;
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 4294967295) throw new Error("AVANTIQO_VIDEO_SEED_INVALID");
  return n;
};
const instruction = (input) => {
  const g = obj(input.generation);
  const value = text(input.provider_prompt || input.prompt || input.instructions_text || input.instructions || g.instructions || g.prompt);
  if (!value) throw new Error("AVANTIQO_VIDEO_INSTRUCTION_REQUIRED");
  if (value.length > 12000) throw new Error("AVANTIQO_VIDEO_INSTRUCTION_TOO_LONG");
  return value;
};
function control(input) {
  const g = obj(input.generation);
  const shot = obj(input.shot_specification || input.shotSpecification || g.shot_specification);
  const requirements = obj(input.requirements);
  return {
    contract: "AVANTIQO_CINEMATIC_CONTROL_V1",
    identity_lock: obj(input.identity_lock || input.identityLock || g.identity_lock),
    shot_specification: shot,
    camera: obj(input.camera || shot.camera || requirements.camera),
    continuity: obj(input.continuity || shot.continuity || requirements.continuity),
    frame_contract: obj(input.frame_contract || input.frameContract || shot.frame_contract),
    negative_constraints: [...new Set([...list(input.negative_constraints), ...list(requirements.negative_constraints), ...list(input.cinematic_control?.negative_constraints)].map(text).filter(Boolean))],
  };
}
const foundationPath = (org, usage) => `${org}/generated/avantiqo-video/.foundation/${safeId(usage)}.mp4`;
const intermediatePath = (org, owner) => `${org}/generated/avantiqo-video/.gpu-intermediate/${safeId(owner)}.npy`;
const receiptPath = (org, owner) => `${org}/generated/avantiqo-video/.pod-receipts/${safeId(owner)}.json`;
const ref = (path) => `storage://${BUCKET}/${path}`;

async function signedUpload(path) {
  const { data, error } = await getServiceSupabase().storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("AVANTIQO_VIDEO_POD_SIGNED_UPLOAD_URL_REQUIRED");
  return { signed_url: data.signedUrl, storage_reference: ref(path) };
}
async function remove(paths) {
  const clean = paths.map(text).filter(Boolean);
  if (!clean.length) return;
  const { error } = await getServiceSupabase().storage.from(BUCKET).remove(clean);
  if (error && !text(error.message).toLowerCase().includes("not found")) throw error;
}
async function persistFoundation(path, buffer) {
  const { error } = await getServiceSupabase().storage.from(BUCKET).upload(path, buffer, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) throw error;
  return ref(path);
}
async function references(input, org) {
  const values = [input.image, input.source_image, input.sourceImage, input.reference_image, input.referenceImage, ...list(input.reference_images), ...list(input.referenceImages)].filter(Boolean);
  const urls = [];
  for (const value of values) {
    const url = await resolveFirstCreativeProviderAssetUrl({ organization_id: org, values: [value] });
    if (url && !urls.includes(url)) urls.push(url);
    if (urls.length >= 4) break;
  }
  return urls;
}
function oneShot() {
  return String.raw`import base64,json,os,time
import requests,runpod,handler_v6
runpod.serverless.progress_update=lambda *args,**kwargs:None
job=json.loads(base64.b64decode(os.environ.pop("AVANTIQO_VIDEO_POD_JOB_B64")).decode("utf-8"))
receipt_url=os.environ.pop("AVANTIQO_VIDEO_POD_RECEIPT_SIGNED_URL")
receipt_ref=os.environ.pop("AVANTIQO_VIDEO_POD_RECEIPT_STORAGE_REFERENCE")
started=time.time()
try:
 out=handler_v6.handler(job); receipt={"success":True,"contract":"AVANTIQO_VIDEO_EPHEMERAL_POD_RECEIPT_V1","status":"completed","output":out,"receipt_storage_reference":receipt_ref,"elapsed_seconds":round(time.time()-started,3)}
except Exception as exc:
 receipt={"success":False,"contract":"AVANTIQO_VIDEO_EPHEMERAL_POD_RECEIPT_V1","status":"failed","error_code":str(exc).split(":",1)[0][:180],"elapsed_seconds":round(time.time()-started,3)}
response=requests.put(receipt_url,data=json.dumps(receipt,separators=(",",":")).encode(),headers={"content-type":"application/json","x-upsert":"false"},timeout=120)
response.raise_for_status()
print("AVANTIQO_VIDEO_EPHEMERAL_POD_RECEIPT_WRITTEN="+str(receipt.get("success") is True).lower(),flush=True)`;
}
async function job(input, intermediateUpload, org) {
  const capability = text(input.capability);
  if (!["ai.video.generate", "ai.video.image_to_video"].includes(capability)) throw new Error(`AVANTIQO_VIDEO_POD_CAPABILITY_UNSUPPORTED:${capability}`);
  const refs = capability === "ai.video.image_to_video" ? await references(input, org) : [];
  if (capability === "ai.video.image_to_video" && !refs.length) throw new Error("AVANTIQO_VIDEO_IMAGE_TO_VIDEO_REFERENCE_REQUIRED");
  return { input: {
    contract: "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1", capability, model: "avantiqo-cinema-v1",
    instruction: instruction(input), duration_seconds: duration(input), aspect_ratio: ratio(input),
    resolution: "720p", fps: 24, seed: seed(input), reference_images: refs,
    cinematic_control: control(input), quality_profile: "cinema", organization_id: org,
    usage_id: text(input.context?.usage_id), certification_execution: false,
    intermediate_upload: intermediateUpload,
  }};
}
async function receipt(org, owner) {
  const { data, error } = await getServiceSupabase().storage.from(BUCKET).download(receiptPath(org, owner));
  if (error) {
    const status = Number(error.statusCode ?? error.status ?? 0);
    const message = text(error.message).toLowerCase();
    if ([400,404].includes(status) || message.includes("not found")) return null;
    throw error;
  }
  const parsed = JSON.parse(await data.text());
  if (parsed?.contract !== "AVANTIQO_VIDEO_EPHEMERAL_POD_RECEIPT_V1") throw new Error("AVANTIQO_VIDEO_POD_RECEIPT_CONTRACT_INVALID");
  return parsed;
}
async function finalizeStudioFoundation({ organizationId, podJob, saved }) {
  const intermediateReference = text(saved?.output?.intermediate_storage_reference || podJob?.intermediate_storage_reference);
  if (!intermediateReference) throw new Error("AVANTIQO_VIDEO_GPU_INTERMEDIATE_REFERENCE_REQUIRED");
  if (saved?.output?.paid_worker_intermediate_egress_only !== true) throw new Error("AVANTIQO_VIDEO_GPU_ONLY_EGRESS_CONTRACT_REQUIRED");
  if (saved?.output?.video_encoded_on_paid_worker !== false) throw new Error("AVANTIQO_VIDEO_GPU_VIDEO_ENCODING_FORBIDDEN");
  if (saved?.output?.final_artifact_persisted_on_paid_worker !== false) throw new Error("AVANTIQO_VIDEO_GPU_FINAL_PERSISTENCE_FORBIDDEN");
  if (text(saved?.output?.compute_boundary_contract) !== AVANTIQO_VIDEO_POD_COMPUTE_BOUNDARY_CONTRACT) {
    throw new Error("AVANTIQO_VIDEO_GPU_COMPUTE_BOUNDARY_CONTRACT_REQUIRED");
  }
  const assembled = await assembleCreativeVideoStudioFoundation({
    organization_id: organizationId,
    frame_tensor_reference: intermediateReference,
    fps: finite(saved?.output?.fps, 24),
  });
  if (assembled?.contract !== AVANTIQO_VIDEO_STUDIO_FOUNDATION_CONTRACT || assembled?.studio_compute_only !== true || assembled?.gpu_compute_used !== false) {
    throw new Error("AVANTIQO_VIDEO_STUDIO_FOUNDATION_CONTRACT_INVALID");
  }
  const path = text(podJob?.foundation_path) || foundationPath(organizationId, podJob?.usage_id);
  const storageReference = await persistFoundation(path, assembled.buffer);
  const rawIntermediatePath = intermediateReference.startsWith(`storage://${BUCKET}/`)
    ? intermediateReference.slice(`storage://${BUCKET}/`.length)
    : null;
  if (rawIntermediatePath) await remove([rawIntermediatePath]).catch(() => null);
  return {
    storage_reference: storageReference,
    video_url: await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: storageReference }),
    studio_foundation_contract: assembled.contract,
    studio_foundation_processing_ms: assembled.processing_ms,
    paid_worker_intermediate_egress_only: true,
    ffmpeg_location: "STUDIO",
  };
}

export async function inspectAvantiqoVideoPodReadiness() {
  if (["0","false","no","off","disabled"].includes(text(process.env.AVANTIQO_VIDEO_POD_FALLBACK_ENABLED).toLowerCase())) return { ready: false, reason: "POD_FALLBACK_DISABLED" };
  try {
    const [snapshot, capacity] = await Promise.all([videoPodCandidateSnapshot(), videoPodCapacity()]);
    const ready = capacity.secure_cloud && capacity.available && capacity.stock_rank >= 3 && finite(capacity.memory_gb, 0) >= 32;
    return { ready, reason: ready ? "GPU_ONLY_VIDEO_EU_RO_1_MEDIUM_OR_HIGH" : "GPU_ONLY_VIDEO_EU_RO_1_NOT_MEDIUM_OR_HIGH", contract: AVANTIQO_VIDEO_POD_RUNTIME_CONTRACT, compute_boundary_contract: AVANTIQO_VIDEO_POD_COMPUTE_BOUNDARY_CONTRACT, capacity, immutable_image: AVANTIQO_VIDEO_POD_IMAGE, network_volume_id: text(snapshot.volume.id), network_volume_name: AVANTIQO_VIDEO_POD_CACHE_VOLUME, gpu_type_id: AVANTIQO_VIDEO_POD_GPU, data_center_id: AVANTIQO_VIDEO_POD_DC, mutation_performed: false };
  } catch (error) {
    return { ready: false, reason: "POD_READINESS_CHECK_FAILED", error: text(error.message).split(":")[0], contract: AVANTIQO_VIDEO_POD_RUNTIME_CONTRACT, compute_boundary_contract: AVANTIQO_VIDEO_POD_COMPUTE_BOUNDARY_CONTRACT, mutation_performed: false };
  }
}
export async function submitAvantiqoVideoPodGeneration(input = {}) {
  const org = text(input.context?.organization_id), usage = text(input.context?.usage_id);
  if (!org) throw new Error("organization_id required");
  if (!usage) throw new Error("usage_id required");
  const readiness = await inspectAvantiqoVideoPodReadiness();
  if (!readiness.ready) { const error = new Error(`AVANTIQO_VIDEO_POD_NOT_READY:${readiness.reason}`); error.safeFallback = true; throw error; }
  const [snapshot, capacity] = await Promise.all([videoPodCandidateSnapshot(), videoPodCapacity()]);
  if (!(capacity.available && capacity.secure_cloud && capacity.stock_rank >= 3)) { const error = new Error("AVANTIQO_VIDEO_POD_CAPACITY_CHANGED_BEFORE_CREATE"); error.safeFallback = true; throw error; }
  const owner = crypto.randomUUID();
  const fpath = foundationPath(org, usage), ipath = intermediatePath(org, owner), rpath = receiptPath(org, owner);
  await remove([fpath, ipath, rpath]);
  const [intermediateUpload, receiptUpload] = await Promise.all([signedUpload(ipath), signedUpload(rpath)]);
  const payload = await job(input, intermediateUpload, org);
  const lease = await acquireVideoPodLease({ organizationId: org, ownerRequestId: owner });
  let podId = null;
  try {
    const pod = await createVideoPodWithCertifiedVolumeFailover({ ownerRequestId: owner, snapshot, env: {
      ...snapshot.templateEnv,
      AVANTIQO_VIDEO_POD_JOB_B64: Buffer.from(JSON.stringify(payload)).toString("base64"),
      AVANTIQO_VIDEO_POD_RECEIPT_SIGNED_URL: receiptUpload.signed_url,
      AVANTIQO_VIDEO_POD_RECEIPT_STORAGE_REFERENCE: receiptUpload.storage_reference,
    }, command: oneShot() });
    podId = text(pod.id);
    return {
      contract: AVANTIQO_VIDEO_POD_RUNTIME_CONTRACT,
      compute_boundary_contract: AVANTIQO_VIDEO_POD_COMPUTE_BOUNDARY_CONTRACT,
      pod_id: podId,
      lease_id: lease.id,
      lease_owner_request_id: owner,
      lease_endpoint_id: `${AVANTIQO_VIDEO_POD_LEASE_PREFIX}${owner}`,
      lease_expires_at: lease.expires_at,
      organization_id: org,
      usage_id: usage,
      foundation_path: fpath,
      foundation_storage_reference: ref(fpath),
      intermediate_storage_reference: intermediateUpload.storage_reference,
      receipt_storage_reference: receiptUpload.storage_reference,
      submitted_at: new Date().toISOString(),
      hard_timeout_ms: HARD_TIMEOUT,
      startup_timeout_ms: STARTUP_TIMEOUT,
      immutable_image: AVANTIQO_VIDEO_POD_IMAGE,
      gpu_type_id: text(pod.avantiqoSelectedGpuTypeId) || null,
      eligible_gpu_type_ids: list(pod.avantiqoEligibleGpuTypeIds).map(text).filter(Boolean),
      gpu_type_certified: pod.avantiqoGpuTypeCertified === true,
      data_center_id: text(pod.avantiqoSelectedDataCenterId) || AVANTIQO_VIDEO_POD_DC,
      network_volume_id: text(pod.avantiqoSelectedVolumeId) || text(snapshot.volume.id),
      network_volume_name: text(pod.avantiqoSelectedVolumeName) || AVANTIQO_VIDEO_POD_CACHE_VOLUME,
      placement_mode: text(pod.avantiqoPlacementMode) || "EU_RO1_REPLICA_PRIMARY",
      paid_worker_intermediate_egress_only: true,
      studio_postprocessing_required: true,
      prompt_persisted: false,
    };
  } catch (error) {
    if (podId) await deleteVideoPod(podId).catch(() => null);
    await releaseVideoPodLease({ leaseId: lease.id, ownerRequestId: owner, state: "FAILED", reason: text(error.message).split(":")[0] }).catch(() => null);
    await remove([fpath, ipath, rpath]).catch(() => null);
    throw error;
  }
}
export async function getAvantiqoVideoPodGenerationStatus({ organizationId, podJob }) {
  const owner = text(podJob?.lease_owner_request_id), leaseId = text(podJob?.lease_id), podId = text(podJob?.pod_id);
  if (!organizationId || !owner || !leaseId || !podId) throw new Error("AVANTIQO_VIDEO_POD_STATUS_IDENTITY_REQUIRED");
  const saved = await receipt(organizationId, owner);
  if (saved) {
    // The paid GPU lifecycle ends before any Studio CPU processing begins.
    await deleteVideoPod(podId).catch(() => null);
    await releaseVideoPodLease({ leaseId, ownerRequestId: owner, state: saved.success ? "RELEASED" : "FAILED", reason: saved.success ? "VIDEO_GPU_RESULT_RECEIPT_COMPLETED" : text(saved.error_code) || "VIDEO_POD_RECEIPT_FAILED" }).catch(() => null);
    if (!saved.success) return { status: "failed", error: text(saved.error_code) || "AVANTIQO_VIDEO_POD_GENERATION_FAILED" };
    try {
      const foundation = await finalizeStudioFoundation({ organizationId, podJob, saved });
      return { status: "completed", ...foundation, receipt: saved, runpod_lease_active: false };
    } catch (error) {
      return {
        status: "failed",
        error: text(error?.message || error).split(":")[0] || "AVANTIQO_VIDEO_STUDIO_FOUNDATION_FAILED",
        studio_foundation_retryable: true,
        runpod_lease_active: false,
      };
    }
  }
  const pod = await getVideoPod(podId), age = Date.now() - Date.parse(text(podJob.submitted_at));
  if (!pod && age < 120_000) { const fresh = await refreshVideoPodLease({ leaseId, ownerRequestId: owner }); return { status: "processing", phase: "POD_CREATE_PROPAGATING", lease_expires_at: fresh.expires_at }; }
  if (!pod || podTerminal(pod)) { if (pod) await deleteVideoPod(podId).catch(() => null); await releaseVideoPodLease({ leaseId, ownerRequestId: owner, state: "FAILED", reason: "VIDEO_POD_EXITED_WITHOUT_RECEIPT" }).catch(() => null); return { status: "failed", error: "AVANTIQO_VIDEO_POD_EXITED_WITHOUT_RECEIPT" }; }
  const started = Date.parse(text(pod.lastStartedAt ?? pod.last_started_at));
  if (age >= HARD_TIMEOUT || (age >= STARTUP_TIMEOUT && !Number.isFinite(started))) {
    const code = age >= HARD_TIMEOUT ? "VIDEO_POD_HARD_TIMEOUT" : "VIDEO_POD_STARTUP_TIMEOUT";
    await deleteVideoPod(podId).catch(() => null); await releaseVideoPodLease({ leaseId, ownerRequestId: owner, state: "FAILED", reason: code }).catch(() => null);
    return { status: "failed", error: `AVANTIQO_${code}` };
  }
  const fresh = await refreshVideoPodLease({ leaseId, ownerRequestId: owner });
  return { status: "processing", phase: "POD_RUNNING", lease_expires_at: fresh.expires_at };
}
export async function abortAvantiqoVideoPodGeneration(podJob, reason = "VIDEO_POD_ABORTED") {
  if (podJob?.pod_id) await deleteVideoPod(text(podJob.pod_id)).catch(() => null);
  if (podJob?.lease_id && podJob?.lease_owner_request_id) await releaseVideoPodLease({ leaseId: podJob.lease_id, ownerRequestId: podJob.lease_owner_request_id, state: "FAILED", reason }).catch(() => null);
}
export async function listActiveAvantiqoVideoPods() {
  return (await listVideoPods()).filter((pod) => !podTerminal(pod)).map((pod) => ({ id: text(pod.id), name: text(pod.name) }));
}
export async function reconcileAvantiqoVideoPodLeases({ limit = 10 } = {}) {
  const leases = await activeVideoPodLeases({ limit }), pods = await listVideoPods(), results = [];
  for (const lease of leases) {
    const owner = text(lease.owner_request_id), pod = pods.find((row) => text(row.name).endsWith(owner)) || null;
    try {
      const saved = await receipt(text(lease.organization_id), owner).catch(() => null);
      const age = Date.now() - Date.parse(text(lease.acquired_at));
      const expiresAt = Date.parse(text(lease.expires_at));
      if (saved) {
        if (pod?.id) await deleteVideoPod(text(pod.id)).catch(() => null);
        await releaseVideoPodLease({ leaseId: lease.id, ownerRequestId: owner, state: saved.success ? "RELEASED" : "FAILED", reason: "VIDEO_POD_RECONCILED_RECEIPT" });
        results.push({ lease_id: lease.id, action: "RECEIPT_FINALIZED" });
        continue;
      }
      if (!pod) {
        if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
          await releaseVideoPodLease({ leaseId: lease.id, ownerRequestId: owner, state: "EXPIRED", reason: "VIDEO_POD_RECONCILED_LEASE_TTL_EXPIRED" });
          results.push({ lease_id: lease.id, action: "MISSING_POD_LEASE_EXPIRED" });
        } else {
          results.push({ lease_id: lease.id, action: "POD_LIST_MISS_LEASE_PRESERVED" });
        }
        continue;
      }
      const started = Date.parse(text(pod.lastStartedAt ?? pod.last_started_at));
      if (podTerminal(pod) || age >= HARD_TIMEOUT || (age >= STARTUP_TIMEOUT && !Number.isFinite(started))) {
        await deleteVideoPod(text(pod.id)).catch(() => null);
        await releaseVideoPodLease({ leaseId: lease.id, ownerRequestId: owner, state: "FAILED", reason: age >= HARD_TIMEOUT ? "VIDEO_POD_RECONCILED_HARD_TIMEOUT" : "VIDEO_POD_RECONCILED_TERMINAL" });
        results.push({ lease_id: lease.id, action: "TERMINATED_RELEASED" });
        continue;
      }
      await refreshVideoPodLease({ leaseId: lease.id, ownerRequestId: owner });
      results.push({ lease_id: lease.id, action: "ACTIVE_REFRESHED" });
    } catch (error) {
      results.push({ lease_id: lease.id, action: "RECONCILE_ERROR", error: text(error.message).slice(0,180) });
    }
  }
  return { success: results.every((row) => row.action !== "RECONCILE_ERROR"), contract: AVANTIQO_VIDEO_POD_RUNTIME_CONTRACT, compute_boundary_contract: AVANTIQO_VIDEO_POD_COMPUTE_BOUNDARY_CONTRACT, results };
}
