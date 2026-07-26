import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import {
  resolveFirstCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""),
  );
}

function selectedAssets(input = {}) {
  if (Array.isArray(input.assets)) return input.assets;
  if (Array.isArray(input.assets?.selectedAssets)) return input.assets.selectedAssets;
  if (Array.isArray(input.source_assets)) return input.source_assets;
  if (Array.isArray(input.sourceAssets)) return input.sourceAssets;
  if (Array.isArray(input.selected_assets)) return input.selected_assets;
  if (Array.isArray(input.selectedAssets)) return input.selectedAssets;
  return [];
}

async function resolveCredential(credentialId) {
  const credential = credentialId
    ? await CredentialRuntime.resolve(credentialId)
    : null;
  const apiKey = credential?.secret_reference || process.env.FLUX_API_KEY;

  if (!apiKey) throw new Error("FLUX_CREDENTIAL_REQUIRED");
  return { credential, apiKey };
}

function extractImageUrl(result = {}) {
  return (
    result?.images?.[0]?.url ||
    result?.image?.url ||
    result?.output?.images?.[0]?.url ||
    result?.output?.image?.url ||
    result?.output?.url ||
    result?.image_url ||
    result?.imageUrl ||
    result?.url ||
    null
  );
}

function extractJobId(result = {}) {
  return (
    result.id ||
    result.job_id ||
    result.jobId ||
    result.task_id ||
    result.taskId ||
    result.output?.id ||
    null
  );
}

function resolveStatusEndpoint(template, jobId) {
  if (template.includes("{job_id}")) {
    return template.replace("{job_id}", encodeURIComponent(jobId));
  }
  return `${template.replace(/\/$/, "")}/${encodeURIComponent(jobId)}`;
}

export const FluxProvider = {
  id: "flux",

  async execute(input = {}) {
    const { apiKey } = await resolveCredential(input.credential_id);
    const endpoint = input.endpoint || input.api_url || input.apiUrl || process.env.FLUX_API_URL;
    if (!endpoint) throw new Error("FLUX_ENDPOINT_REQUIRED");

    const generation = input.generation || {};
    const prompt =
      input.prompt ||
      input.instructions?.prompt ||
      input.provider_prompt ||
      generation.provider_prompt ||
      null;
    const sourceImageUrl = await resolveFirstCreativeProviderAssetUrl({
      organization_id: input.context?.organization_id,
      values: [
        input.source,
        input.image,
        input.image_url,
        input.imageUrl,
        selectedAssets(input),
      ],
    });
    const providerOptions = {
      ...(generation.provider_parameters || {}),
      ...(input.provider_parameters || {}),
      ...(input.provider_options || input.providerOptions || {}),
    };
    const output = input.output_spec || input.outputSpec || generation.output_spec || {};
    const model = input.model || generation.model || null;

    if (!prompt && !sourceImageUrl) throw new Error("FLUX_PROMPT_OR_SOURCE_REQUIRED");

    const body = compactObject({
      model,
      prompt,
      image_urls: sourceImageUrl ? [sourceImageUrl] : undefined,
      strength: input.strength,
      guidance_scale: input.guidance_scale ?? input.guidanceScale,
      num_inference_steps: input.num_inference_steps ?? input.numInferenceSteps,
      safety_tolerance: input.safety_tolerance ?? input.safetyTolerance,
      enable_safety_checker: input.enable_safety_checker ?? input.enableSafetyChecker,
      sync_mode: input.sync_mode ?? input.syncMode,
      aspect_ratio: input.aspect_ratio ?? input.aspectRatio ?? output.aspect_ratio,
      output_format: input.output_format ?? input.outputFormat ?? output.format,
      seed: input.seed,
      ...providerOptions,
    });
    const response = await fetch(endpoint, {
      method: input.method || "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
        ...(input.headers || {}),
      },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result?.error?.message || result?.message || `Flux request failed with status ${response.status}`,
      );
    }

    const imageUrl = extractImageUrl(result);
    const jobId = extractJobId(result);
    if (!imageUrl && !jobId) throw new Error("FLUX_OUTPUT_OR_JOB_REQUIRED");

    return {
      success: true,
      provider: "flux",
      model,
      output: {
        image_url: imageUrl,
        source_image_url: sourceImageUrl,
        provider_job_id: jobId,
        status: jobId && !imageUrl ? "processing" : "completed",
        raw: result,
      },
    };
  },

  async getStatus(input = {}) {
    const jobId = input.job_id || input.jobId || input.provider_job_id;
    if (!jobId) throw new Error("FLUX_JOB_ID_REQUIRED");

    const { apiKey } = await resolveCredential(input.credential_id);
    const template =
      input.status_endpoint ||
      input.statusEndpoint ||
      process.env.FLUX_STATUS_API_URL;
    if (!template) throw new Error("FLUX_STATUS_ENDPOINT_REQUIRED");

    const response = await fetch(resolveStatusEndpoint(template, jobId), {
      method: input.method || "GET",
      headers: {
        Authorization: `Key ${apiKey}`,
        ...(input.headers || {}),
      },
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result?.error?.message || result?.message || `Flux status request failed with status ${response.status}`,
      );
    }

    return result;
  },
};
