import { resolveFirstCreativeProviderAssetUrl, resolveCreativeProviderAssetUrl } from "../../../../creative/assets/storage/resolveCreativeProviderAssetUrl.js";
import { supabaseAdmin } from "../../../../shared/supabase/admin.js";
import { getServiceSupabase } from "../../../../shared/supabase/service.js";

const CAPABILITY = "ai.image.generate";
const DEFAULT_QUANTIZATION = "Q3_K";
const ALLOWED_QUANTIZATIONS = new Set(["Q3_K", "Q4_K", "Q5_K", "Q6_K"]);
const FOUNDATION_MODEL = "Tongyi-MAI/Z-Image-Turbo";
const REALVISXL_FOUNDATION_MODEL = "SG161222/RealVisXL_V5.0";
const REALVISXL_RUNTIME_MODEL = "realvisxl-v5.0-fp16";
const INFRASTRUCTURE = "AVANTIQO_LOCAL_NODE_V1";
const JOB_PREFIX = "local-image-generate:";
const OUTPUT_BUCKET = "creative-assets";

function text(value) { return String(value ?? "").trim(); }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function boundedInt(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(number)));
}
function boundedFloat(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}
function generationPrompt(input = {}) {
  return text(input.prompt || input.provider_prompt || input.instruction || input.instructions || input.instructions_text || input.text);
}
function realVisStudioRoute(input = {}) {
  const rendererProfile = object(input.renderer_profile);
  const metadata = object(input.metadata);
  const certification = object(metadata.studio_visual_generation_certification);
  const explicitRealVis = text(rendererProfile.model).toLowerCase().includes("realvisxl");
  const certifiedStudioStill = text(metadata.workflow_kind).toUpperCase() === "STILL" && certification.passed === true;
  return explicitRealVis || certifiedStudioStill;
}
function sourceCandidates(input = {}) {
  return [
    input.init_image_url,
    input.initImageUrl,
    input.init_image,
    input.initImage,
    input.source_image,
    input.sourceImage,
    input.image,
    input.source,
    input.source_assets,
    input.sourceAssets,
    input.assets,
  ].flat(Infinity).filter(Boolean);
}
async function onlineNodeAvailable() {
  if (!enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED)) return false;
  if (text(process.env.AVANTIQO_LOCAL_IMAGE_GENERATION_ENABLED) && !enabled(process.env.AVANTIQO_LOCAL_IMAGE_GENERATION_ENABLED)) return false;
  const result = await supabaseAdmin.from("avantiqo_local_compute_nodes")
    .select("id,last_seen_at,enabled,capabilities")
    .eq("enabled", true)
    .contains("capabilities", [CAPABILITY])
    .order("last_seen_at", { ascending: false })
    .limit(4);
  if (result.error) throw result.error;
  const now = Date.now();
  return (result.data || []).some((node) => {
    const seen = new Date(node.last_seen_at || 0).getTime();
    return Number.isFinite(seen) && now - seen <= 90000;
  });
}
async function outputTarget(organizationId, usageId) {
  const safeUsage = text(usageId).replace(/[^A-Za-z0-9_-]/g, "");
  if (!organizationId || !safeUsage) throw new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_STORAGE_SCOPE_REQUIRED");
  const path = `${organizationId}/generated/avantiqo-image/${safeUsage}.png`;
  const storage = getServiceSupabase();
  const upload = await storage.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (upload.error || !upload.data?.signedUrl) throw upload.error || new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_UPLOAD_REQUIRED");
  return { signed_url: upload.data.signedUrl, storage_reference: `storage://${OUTPUT_BUCKET}/${path}` };
}
function rawJobId(value) {
  const id = text(value);
  if (!id.startsWith(JOB_PREFIX)) throw new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_JOB_REQUIRED");
  return id.slice(JOB_PREFIX.length);
}
export function isImageGenerateLocalJob(value) { return text(value).startsWith(JOB_PREFIX); }

export const AvantiqoImageGenerateLocalQueueProvider = {
  id: "avantiqo-image",
  available: onlineNodeAvailable,
  async execute(input = {}) {
    const organizationId = text(input.context?.organization_id);
    const usageId = text(input.context?.usage_id);
    if (!organizationId || !usageId) throw new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_GOVERNED_CONTEXT_REQUIRED");
    if (!(await onlineNodeAvailable())) throw new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_NODE_UNAVAILABLE");
    const prompt = generationPrompt(input);
    if (!prompt) throw new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_PROMPT_REQUIRED");

    const rendererProfile = object(input.renderer_profile);
    const generationParameters = object(input.generation?.provider_parameters);
    const useRealVisXL = realVisStudioRoute(input);
    const width = boundedInt(rendererProfile.width || input.width || generationParameters.width || input.size?.width, 768, 256, 1536);
    const height = boundedInt(rendererProfile.height || input.height || generationParameters.height || input.size?.height, 768, 256, 1536);
    if (width * height > 1_048_576) throw new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_PIXEL_BUDGET_EXCEEDED");

    const requestedQuantization = text(input.quantization || generationParameters.quantization || DEFAULT_QUANTIZATION).toUpperCase();
    const quantization = ALLOWED_QUANTIZATIONS.has(requestedQuantization)
      ? requestedQuantization
      : DEFAULT_QUANTIZATION;
    const samplingMethod = text(
      rendererProfile.sampling_method ||
      input.sampling_method ||
      input.sampler ||
      generationParameters.sampling_method ||
      (useRealVisXL ? "dpm++2m_sde" : "euler")
    ).toLowerCase();
    const scheduler = text(
      rendererProfile.scheduler ||
      input.scheduler ||
      generationParameters.scheduler ||
      (useRealVisXL ? "karras" : "flux")
    ).toLowerCase();

    const sourceValues = sourceCandidates(input);
    const initImageUrl = sourceValues.length
      ? await resolveFirstCreativeProviderAssetUrl({ organization_id: organizationId, values: sourceValues })
      : null;
    const storageUpload = await outputTarget(organizationId, usageId);
    const hiresWidth = boundedInt(input.hires_width || input.hiresWidth, 0, 0, 1536);
    const hiresHeight = boundedInt(input.hires_height || input.hiresHeight, 0, 0, 1536);
    const resolvedSteps = useRealVisXL
      ? boundedInt(rendererProfile.steps || input.steps || generationParameters.steps, 30, 1, 50)
      : boundedInt(input.steps || generationParameters.steps, 8, 1, 12);
    const resolvedCfg = useRealVisXL
      ? boundedFloat(rendererProfile.cfg_scale ?? input.cfg_scale ?? input.guidance_scale ?? generationParameters.cfg_scale, 4.5, 0.0, 12.0)
      : boundedFloat(input.cfg_scale ?? input.guidance_scale ?? generationParameters.cfg_scale, 1.0, 0.0, 4.0);
    const resolvedSeedValue = rendererProfile.seed ?? input.seed ?? generationParameters.seed;
    const resolvedSeed = Number.isFinite(Number(resolvedSeedValue)) ? Math.trunc(Number(resolvedSeedValue)) : -1;
    const foundationModel = useRealVisXL ? REALVISXL_FOUNDATION_MODEL : FOUNDATION_MODEL;
    const runtimeModel = useRealVisXL
      ? REALVISXL_RUNTIME_MODEL
      : "z-image-turbo-" + quantization.toLowerCase().replaceAll("_", "-");
    const runtimeContract = useRealVisXL
      ? "AVANTIQO_NODE01_REALVISXL_V5_FP16_V1"
      : "AVANTIQO_NODE01_Z_IMAGE_TURBO_GGUF_V1";

    const payload = {
      prompt,
      negative_prompt: text(input.negative_prompt || input.negativePrompt),
      width,
      height,
      steps: resolvedSteps,
      cfg_scale: resolvedCfg,
      guidance: useRealVisXL ? 0.0 : boundedFloat(input.guidance, 0.0, 0.0, 4.0),
      sampling_method: samplingMethod,
      scheduler,
      flow_shift: useRealVisXL ? 0.0 : boundedFloat(input.flow_shift, 3.0, 0.0, 10.0),
      seed: resolvedSeed,
      ...(useRealVisXL ? {
        renderer_profile: {
          model: "RealVisXL_V5.0_fp16",
          steps: resolvedSteps,
          cfg_scale: resolvedCfg,
          sampling_method: samplingMethod,
          scheduler,
          seed: resolvedSeed,
          width,
          height,
          studio_creative_authority_preserved: true,
        },
      } : {}),
      ...(initImageUrl ? {
        init_image_url: initImageUrl,
        img2img_strength: boundedFloat(input.img2img_strength ?? input.strength, 0.22, 0.05, 0.95),
      } : {}),
      ...(hiresWidth > 0 && hiresHeight > 0 ? {
        hires_width: hiresWidth,
        hires_height: hiresHeight,
        hires_steps: boundedInt(input.hires_steps ?? input.hiresSteps, 7, 1, 8),
        hires_denoising_strength: boundedFloat(input.hires_denoising_strength ?? input.hiresDenoisingStrength, 0.22, 0.05, 0.5),
      } : {}),
      storage_upload: storageUpload,
      runtime_contract: runtimeContract,
      foundation_model: foundationModel,
      ...(useRealVisXL ? {} : { quantization, image_quantization: quantization }),
      low_vram: true,
    };
    const inserted = await supabaseAdmin.from("avantiqo_local_compute_jobs").insert({
      organization_id: organizationId,
      usage_id: usageId,
      capability: CAPABILITY,
      lane: "gpu",
      workload: "image_generate",
      model: runtimeModel,
      payload,
      priority: 68,
      max_attempts: 2,
    }).select("id").single();
    if (inserted.error || !inserted.data?.id) throw inserted.error || new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_QUEUE_INSERT_FAILED");
    return {
      success: true,
      provider: "avantiqo-image",
      model: "avantiqo-image-v1",
      output: {
        provider_job_id: `${JOB_PREFIX}${inserted.data.id}`,
        status: "queued",
        capability: CAPABILITY,
        foundation_model: foundationModel,
        runtime_model: runtimeModel,
        ...(useRealVisXL ? {} : { quantization }),
        width,
        height,
        steps: payload.steps,
        cfg_scale: payload.cfg_scale,
        guidance: payload.guidance,
        sampling_method: payload.sampling_method,
        scheduler: payload.scheduler,
        flow_shift: payload.flow_shift,
        storage_reference: storageUpload.storage_reference,
        infrastructure_provider: INFRASTRUCTURE,
        local_node: true,
        raw_reasoning_persisted: false,
      },
    };
  },
  async cancel(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    const organizationId = text(input.context?.organization_id);
    if (!organizationId) throw new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_CANCEL_SCOPE_REQUIRED");
    const id = rawJobId(jobId);
    const result = await supabaseAdmin.from("avantiqo_local_compute_jobs")
      .update({
        status: "CANCELLED",
        payload: {},
        leased_until: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_code: "CANCELLED_BY_CALLER",
      })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .in("status", ["QUEUED", "RUNNING"])
      .select("id,status,node_id")
      .maybeSingle();
    if (result.error) throw result.error;
    return {
      success: true,
      cancelled: Boolean(result.data),
      provider_job_id: jobId,
      node_id: result.data?.node_id || null,
      exact_job_only: true,
    };
  },
  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    const organizationId = text(input.context?.organization_id);
    if (!organizationId) throw new Error("AVANTIQO_LOCAL_IMAGE_GENERATE_STATUS_SCOPE_REQUIRED");
    const result = await supabaseAdmin.from("avantiqo_local_compute_jobs")
      .select("status,result,metrics,error_code,node_id,model")
      .eq("id", rawJobId(jobId))
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (result.error) throw result.error;
    const row = result.data;
    if (!row) return { status: "failed", provider_job_id: jobId, error: "AVANTIQO_LOCAL_IMAGE_GENERATE_JOB_NOT_FOUND" };
    const status = text(row.status).toUpperCase();
    if (status === "COMPLETED") {
      const output = object(row.result);
      const storageReference = text(output.storage_reference);
      const organizationId = text(input.context?.organization_id);
      const assetUrl = organizationId && storageReference
        ? await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: storageReference })
        : null;
      return {
        status: "completed",
        provider_job_id: jobId,
        infrastructure_provider: INFRASTRUCTURE,
        output: {
          ...output,
          ...(assetUrl ? { asset_url: assetUrl } : {}),
          node_id: row.node_id,
          metrics: object(row.metrics),
          raw_reasoning_persisted: false,
        },
      };
    }
    if (status === "CANCELLED") {
      return {
        status: "cancelled",
        provider_job_id: jobId,
        error: text(row.error_code) || "CANCELLED_BY_CALLER",
        node_id: row.node_id || null,
      };
    }
    if (status === "FAILED") {
      return { status: "failed", provider_job_id: jobId, error: text(row.error_code) || "AVANTIQO_LOCAL_IMAGE_GENERATE_FAILED" };
    }
    return {
      status: status === "RUNNING" ? "processing" : "queued",
      provider_job_id: jobId,
      infrastructure_provider: INFRASTRUCTURE,
      local_node: true,
      node_id: row.node_id || null,
      metrics: object(row.metrics),
    };
  },
};

export const AVANTIQO_IMAGE_GENERATE_LOCAL_JOB_PREFIX = JOB_PREFIX;
