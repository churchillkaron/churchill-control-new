#!/usr/bin/env node

import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const CONTRACT = "AVANTIQO_VIDEO_V72_FLASHVSR_4K_QUALITY_FINAL_CI_V1";
const APPROVAL = "AVANTIQO_VIDEO_V72_FLASHVSR_4K_CI_APPROVED";
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000";
const USAGE_ID = "video-v72-ephemeral-pod-final-20260829";
const FOUNDATION_PATH = `${ORGANIZATION_ID}/generated/avantiqo-video/.foundation/${USAGE_ID}.mp4`;
const OUTPUT_PATH = `${ORGANIZATION_ID}/generated/avantiqo-video/${USAGE_ID}-flashvsr-4k.mp4`;
const REPORT_PATH = process.env.AVANTIQO_VIDEO_V72_FLASHVSR_CI_REPORT || "/tmp/avantiqo-video-v72-flashvsr-ci.json";
const POLL_MS = 15_000;
const TIMEOUT_MS = 20 * 60 * 1000;
const MAX_GPU_ELAPSED_SECONDS = 12 * 60;

const text = (value) => String(value ?? "").trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
if (!approved(process.env[APPROVAL])) throw new Error(`${APPROVAL}=YES_REQUIRED`);

const [
  { getServiceSupabase },
  { supabaseAdmin },
  { resolveCreativeProviderAssetUrl },
  {
    AVANTIQO_VIDEO_FLASHVSR_GPU_TYPE,
    AVANTIQO_VIDEO_FLASHVSR_IMAGE,
    abortAvantiqoVideoFlashVsrMaster,
    getAvantiqoVideoFlashVsrMasterStatus,
    submitAvantiqoVideoFlashVsrMaster,
  },
  { AVANTIQO_VIDEO_FLASHVSR_MODEL, AVANTIQO_VIDEO_FLASHVSR_MODEL_REVISION },
  { AVANTIQO_VIDEO_POD_IMAGE },
] = await Promise.all([
  import("../lib/shared/supabase/service.js"),
  import("../lib/shared/supabase/admin.js"),
  import("../lib/creative/assets/storage/resolveCreativeProviderAssetUrl.js"),
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoFlashVsrPodRuntime.js"),
  import("../lib/creative/video/runtime/CreativeVideoStudioFlashVsrRuntime.js"),
  import("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRunpod.js"),
]);

async function writeReport(report) {
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

let masterJob = null;
let completed = false;
let finalReport = null;

try {
  if (!AVANTIQO_VIDEO_FLASHVSR_IMAGE.includes("@sha256:")) throw new Error(`${CONTRACT}_IMMUTABLE_FLASHVSR_IMAGE_REQUIRED`);
  if (AVANTIQO_VIDEO_FLASHVSR_GPU_TYPE !== "NVIDIA A100 80GB PCIe") throw new Error(`${CONTRACT}_A100_CERTIFIED_TARGET_REQUIRED`);
  if (AVANTIQO_VIDEO_FLASHVSR_MODEL !== "JunhaoZhuang/FlashVSR-v1.1") throw new Error(`${CONTRACT}_MODEL_DRIFT`);
  if (AVANTIQO_VIDEO_FLASHVSR_MODEL_REVISION !== "a258bf2d58ac5a7d7193fb6ce4326aaff98ea6cb") throw new Error(`${CONTRACT}_MODEL_REVISION_DRIFT`);

  const supabase = getServiceSupabase();
  const { data: foundationBlob, error: foundationError } = await supabase.storage.from(BUCKET).download(FOUNDATION_PATH);
  if (foundationError) throw foundationError;
  if (!foundationBlob || foundationBlob.size <= 1_000_000) throw new Error(`${CONTRACT}_EXISTING_FOUNDATION_REQUIRED_NO_NEW_GENERATION_ALLOWED`);
  const foundationReference = `storage://${BUCKET}/${FOUNDATION_PATH}`;
  const sourceUrl = await resolveCreativeProviderAssetUrl({ organization_id: ORGANIZATION_ID, value: foundationReference });
  if (!sourceUrl) throw new Error(`${CONTRACT}_FOUNDATION_SIGNED_URL_REQUIRED`);

  console.log(`AVANTIQO_VIDEO_V72_FLASHVSR_CI_START=${JSON.stringify({
    contract: CONTRACT,
    existing_foundation_required: true,
    existing_foundation_bytes: foundationBlob.size,
    historical_wan_generation_reused: true,
    new_generation_submitted: false,
    generation_image_untouched: AVANTIQO_VIDEO_POD_IMAGE,
    master_model: AVANTIQO_VIDEO_FLASHVSR_MODEL,
    master_model_revision: AVANTIQO_VIDEO_FLASHVSR_MODEL_REVISION,
    master_image: AVANTIQO_VIDEO_FLASHVSR_IMAGE,
    master_gpu_type: AVANTIQO_VIDEO_FLASHVSR_GPU_TYPE,
    production_deploy_performed: false,
    secrets_printed: false,
  })}`);

  masterJob = await submitAvantiqoVideoFlashVsrMaster({
    organizationId: ORGANIZATION_ID,
    sourceUrl,
  });

  const deadline = Date.now() + TIMEOUT_MS;
  let final = null;
  let poll = 0;
  while (Date.now() < deadline) {
    poll += 1;
    const status = await getAvantiqoVideoFlashVsrMasterStatus(masterJob);
    console.log(`AVANTIQO_VIDEO_V72_FLASHVSR_CI_PROGRESS=${JSON.stringify({
      poll,
      status: status.status,
      phase: status.phase || null,
      runpod_lease_active: status.runpod_lease_active === true,
      gpu_deleted_before_studio_encode: status.gpu_deleted_before_studio_encode === true,
    })}`);
    if (status.status === "completed") {
      final = status;
      completed = true;
      break;
    }
    if (status.status === "failed") throw new Error(`${CONTRACT}_FAILED:${status.error || "UNKNOWN"}`);
    await sleep(POLL_MS);
  }
  if (!final) throw new Error(`${CONTRACT}_TIMEOUT`);

  const result = final.final;
  const gpuElapsedSeconds = Number(final.receipt?.elapsed_seconds ?? 0);
  if (!Number.isFinite(gpuElapsedSeconds) || gpuElapsedSeconds <= 0) throw new Error(`${CONTRACT}_GPU_ELAPSED_REQUIRED`);
  if (gpuElapsedSeconds > MAX_GPU_ELAPSED_SECONDS) throw new Error(`${CONTRACT}_GPU_COST_CEILING_EXCEEDED:${gpuElapsedSeconds}`);
  if (result?.learned_super_resolution_used !== true) throw new Error(`${CONTRACT}_LEARNED_SUPER_RESOLUTION_REQUIRED`);
  if (result?.studio_final_encoding !== true) throw new Error(`${CONTRACT}_STUDIO_FINAL_ENCODING_REQUIRED`);
  if (result?.gpu_video_encoding_used !== false) throw new Error(`${CONTRACT}_GPU_VIDEO_ENCODING_FORBIDDEN`);
  if (result?.fal_contacted !== false) throw new Error(`${CONTRACT}_FAL_CONTACT_FORBIDDEN`);
  if (final.gpu_deleted_before_studio_encode !== true) throw new Error(`${CONTRACT}_GPU_DELETE_BEFORE_STUDIO_REQUIRED`);
  if (result?.output_probe?.width !== 3840 || result?.output_probe?.height !== 2160) {
    throw new Error(`${CONTRACT}_FINAL_4K_INVALID:${result?.output_probe?.width || 0}x${result?.output_probe?.height || 0}`);
  }
  if (!Buffer.isBuffer(result.buffer) || result.buffer.length <= 1_000_000) throw new Error(`${CONTRACT}_FINAL_BUFFER_INVALID`);

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(OUTPUT_PATH, result.buffer, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (uploadError) throw uploadError;
  const outputReference = `storage://${BUCKET}/${OUTPUT_PATH}`;
  const reviewUrl = await resolveCreativeProviderAssetUrl({ organization_id: ORGANIZATION_ID, value: outputReference });
  if (!reviewUrl) throw new Error(`${CONTRACT}_REVIEW_URL_REQUIRED`);

  const { data: activeLeases, error: leaseError } = await supabaseAdmin
    .from("avantiqo_video_runpod_leases")
    .select("id,endpoint_id,state")
    .eq("state", "ACTIVE")
    .like("endpoint_id", "pod-fallback:%");
  if (leaseError) throw leaseError;
  if (Array.isArray(activeLeases) && activeLeases.length) throw new Error(`${CONTRACT}_ACTIVE_VIDEO_LEASE_REMAINS:${activeLeases.length}`);

  finalReport = {
    success: true,
    contract: CONTRACT,
    historical_wan_generation_reused: true,
    new_generation_submitted: false,
    learned_super_resolution_used: true,
    master_backend: result.backend,
    master_model: result.model,
    master_model_revision: result.model_revision,
    master_gpu_type: AVANTIQO_VIDEO_FLASHVSR_GPU_TYPE,
    immutable_master_image: AVANTIQO_VIDEO_FLASHVSR_IMAGE,
    gpu_elapsed_seconds: gpuElapsedSeconds,
    max_gpu_elapsed_seconds: MAX_GPU_ELAPSED_SECONDS,
    final_master_resolution: "4k",
    final_width: result.output_probe.width,
    final_height: result.output_probe.height,
    final_frame_rate: result.output_probe.fps,
    final_frame_count: result.output_probe.frame_count,
    gpu_deleted_before_studio_encode: true,
    studio_final_encoding: true,
    gpu_video_encoding_used: false,
    fal_contacted: false,
    external_mastering_provider_contacted: false,
    storage_reference: outputReference,
    review_url: reviewUrl,
    active_video_leases_after: 0,
    production_deploy_performed: false,
    new_wan_generation_cost_incurred: false,
    secrets_printed: false,
  };
  await writeReport(finalReport);
  console.log(JSON.stringify(finalReport, null, 2));
  console.log(`${CONTRACT}=PASS`);
} catch (error) {
  finalReport = {
    success: false,
    contract: CONTRACT,
    error_code: text(error?.message || error).split(":")[0] || "UNKNOWN",
    historical_wan_generation_reused: true,
    new_generation_submitted: false,
    production_deploy_performed: false,
    secrets_printed: false,
  };
  await writeReport(finalReport).catch(() => null);
  throw error;
} finally {
  if (masterJob && !completed) {
    await abortAvantiqoVideoFlashVsrMaster(masterJob, "VIDEO_V72_FLASHVSR_CI_ABORT_AFTER_FAILURE").catch(() => null);
  }
}
