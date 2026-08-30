#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const CONTRACT = "AVANTIQO_VIDEO_V72_STUDIO_4K_CLOSURE_CI_V1";
const APPROVAL = "AVANTIQO_VIDEO_V72_STUDIO_4K_CLOSURE_APPROVED";
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000";
const USAGE_ID = "video-v72-ephemeral-pod-final-20260829";
const FOUNDATION_PATH = `${ORGANIZATION_ID}/generated/avantiqo-video/.foundation/${USAGE_ID}.mp4`;
const OUTPUT_PATH = `${ORGANIZATION_ID}/generated/avantiqo-video/${USAGE_ID}-studio-4k.mp4`;
const REPORT_PATH = process.env.AVANTIQO_VIDEO_V72_STUDIO_4K_REPORT || "/tmp/avantiqo-video-v72-studio-4k.json";

const text = (value) => String(value ?? "").trim();
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
if (!approved(process.env[APPROVAL])) throw new Error(`${APPROVAL}=YES_REQUIRED`);

const [
  { getServiceSupabase },
  { supabaseAdmin },
  { resolveCreativeProviderAssetUrl },
  { renderCreativeVideoStudioMaster, AVANTIQO_VIDEO_STUDIO_MASTER_CONTRACT, AVANTIQO_VIDEO_STUDIO_MASTER_MODEL },
] = await Promise.all([
  import("../lib/shared/supabase/service.js"),
  import("../lib/shared/supabase/admin.js"),
  import("../lib/creative/assets/storage/resolveCreativeProviderAssetUrl.js"),
  import("../lib/creative/video/runtime/CreativeVideoStudioMasterRuntime.js"),
]);

async function writeReport(report) {
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

try {
  const { data: activeLeases, error: leaseError } = await supabaseAdmin
    .from("avantiqo_video_runpod_leases")
    .select("id,endpoint_id,state")
    .eq("state", "ACTIVE")
    .like("endpoint_id", "pod-fallback:%");
  if (leaseError) throw leaseError;
  if (Array.isArray(activeLeases) && activeLeases.length) {
    throw new Error(`${CONTRACT}_ACTIVE_VIDEO_LEASE_PRECHECK:${activeLeases.length}`);
  }

  const supabase = getServiceSupabase();
  const { data: foundationBlob, error: foundationError } = await supabase.storage.from(BUCKET).download(FOUNDATION_PATH);
  if (foundationError) throw foundationError;
  if (!foundationBlob || foundationBlob.size <= 1_000_000) {
    throw new Error(`${CONTRACT}_FOUNDATION_REQUIRED`);
  }

  const foundationReference = `storage://${BUCKET}/${FOUNDATION_PATH}`;
  const sourceUrl = await resolveCreativeProviderAssetUrl({ organization_id: ORGANIZATION_ID, value: foundationReference });
  if (!sourceUrl) throw new Error(`${CONTRACT}_FOUNDATION_SIGNED_URL_REQUIRED`);

  console.log(`AVANTIQO_VIDEO_V72_STUDIO_4K_START=${JSON.stringify({
    contract: CONTRACT,
    existing_foundation_bytes: foundationBlob.size,
    new_generation_submitted: false,
    gpu_mastering_submitted: false,
    production_deploy_performed: false,
  })}`);

  const master = await renderCreativeVideoStudioMaster({
    organization_id: ORGANIZATION_ID,
    source_url: sourceUrl,
    target_resolution: "4k",
  });

  if (master?.success !== true) throw new Error(`${CONTRACT}_MASTER_FAILED`);
  if (master.contract !== AVANTIQO_VIDEO_STUDIO_MASTER_CONTRACT) throw new Error(`${CONTRACT}_MASTER_CONTRACT_INVALID`);
  if (master.model !== AVANTIQO_VIDEO_STUDIO_MASTER_MODEL) throw new Error(`${CONTRACT}_MASTER_MODEL_INVALID`);
  if (master.backend !== "STUDIO_CPU_FFMPEG_LANCZOS") throw new Error(`${CONTRACT}_MASTER_BACKEND_INVALID`);
  if (master.gpu_compute_used !== false) throw new Error(`${CONTRACT}_GPU_COMPUTE_FORBIDDEN`);
  if (master.paid_provider_contacted !== false) throw new Error(`${CONTRACT}_PAID_PROVIDER_FORBIDDEN`);
  if (master.fal_contacted !== false) throw new Error(`${CONTRACT}_FAL_FORBIDDEN`);
  if (master.output_probe?.width !== 3840 || master.output_probe?.height !== 2160) {
    throw new Error(`${CONTRACT}_FINAL_4K_INVALID:${master.output_probe?.width || 0}x${master.output_probe?.height || 0}`);
  }
  if (!Buffer.isBuffer(master.buffer) || master.buffer.length <= 1_000_000) {
    throw new Error(`${CONTRACT}_FINAL_BUFFER_INVALID`);
  }

  const inputDuration = Number(master.input_probe?.duration_seconds || 0);
  const outputDuration = Number(master.output_probe?.duration_seconds || 0);
  if (inputDuration > 0 && outputDuration > 0) {
    const drift = Math.abs(inputDuration - outputDuration);
    if (drift > Math.max(0.08, inputDuration * 0.01)) throw new Error(`${CONTRACT}_DURATION_DRIFT:${drift}`);
  }

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(OUTPUT_PATH, master.buffer, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const storageReference = `storage://${BUCKET}/${OUTPUT_PATH}`;
  const reviewUrl = await resolveCreativeProviderAssetUrl({ organization_id: ORGANIZATION_ID, value: storageReference });
  if (!reviewUrl) throw new Error(`${CONTRACT}_REVIEW_URL_REQUIRED`);

  const { data: postActive, error: postLeaseError } = await supabaseAdmin
    .from("avantiqo_video_runpod_leases")
    .select("id,endpoint_id,state")
    .eq("state", "ACTIVE")
    .like("endpoint_id", "pod-fallback:%");
  if (postLeaseError) throw postLeaseError;
  if (Array.isArray(postActive) && postActive.length) throw new Error(`${CONTRACT}_ACTIVE_VIDEO_LEASE_AFTER:${postActive.length}`);

  const report = {
    success: true,
    contract: CONTRACT,
    historical_wan_generation_reused: true,
    new_generation_submitted: false,
    gpu_mastering_submitted: false,
    master_contract: master.contract,
    master_model: master.model,
    master_backend: master.backend,
    input_width: master.input_probe?.width,
    input_height: master.input_probe?.height,
    input_duration_seconds: inputDuration,
    final_width: master.output_probe?.width,
    final_height: master.output_probe?.height,
    final_duration_seconds: outputDuration,
    final_video_codec: master.output_probe?.video_codec,
    final_has_audio: master.output_probe?.has_audio,
    final_bytes: master.buffer.length,
    processing_ms: master.processing_ms,
    studio_compute_only: true,
    studio_final_encoding: true,
    learned_super_resolution_used: false,
    gpu_compute_used: false,
    fal_contacted: false,
    external_mastering_provider_contacted: false,
    storage_reference: storageReference,
    review_url: reviewUrl,
    active_video_leases_after: 0,
    production_deploy_performed: false,
    secrets_printed: false,
  };
  await writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  console.log(`${CONTRACT}=PASS`);
} catch (error) {
  await writeReport({
    success: false,
    contract: CONTRACT,
    error_code: text(error?.message || error).split(":")[0] || "UNKNOWN",
    new_generation_submitted: false,
    gpu_mastering_submitted: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }).catch(() => null);
  throw error;
}
