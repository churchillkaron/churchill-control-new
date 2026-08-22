import {
  resolveFirstCreativeProviderAssetUrl,
  resolveCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const OUTPUT_BUCKET = "creative-assets";
const DEFAULT_TIMEOUT_MS = 30000;
const PRIVATE_KEYS = new Set([
  "reasoning",
  "reasoning_content",
  "chain_of_thought",
  "chainofthought",
  "cot",
  "thoughts",
  "scratchpad",
  "analysis",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanOutput(value, depth = 0) {
  if (depth > 8) return "[depth-limited]";
  if (Array.isArray(value)) return value.map((entry) => cleanOutput(entry, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PRIVATE_KEYS.has(String(key).toLowerCase()))
      .map(([key, child]) => [key, cleanOutput(child, depth + 1)]),
  );
}

function runpodStatus(value) {
  const status = text(value).toUpperCase();
  if (["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(status)) return "completed";
  if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(status)) return "failed";
  if (["IN_QUEUE", "QUEUED", "PENDING"].includes(status)) return "queued";
  return "processing";
}

function config({ endpointEnv, enabledEnv, timeoutEnv, engineLabel }) {
  const endpointId = text(process.env[endpointEnv]);
  const apiKey = text(process.env.RUNPOD_API_KEY);
  const enabled = ["1", "true", "yes", "on"].includes(
    text(process.env[enabledEnv]).toLowerCase(),
  );
  if (!enabled) throw new Error(`${engineLabel}_ENGINE_DISABLED`);
  if (!endpointId) throw new Error(`${endpointEnv}_REQUIRED`);
  if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
  if (!/^[A-Za-z0-9_-]+$/.test(endpointId)) throw new Error(`${endpointEnv}_INVALID`);
  return {
    baseUrl: `${RUNPOD_API_BASE}/${endpointId}`,
    apiKey,
    timeoutMs: Math.max(
      1000,
      Number(process.env[timeoutEnv] || DEFAULT_TIMEOUT_MS),
    ),
  };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function responseJson(response, engineLabel) {
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { message: raw };
  }
  if (!response.ok) {
    const message = text(body?.error?.message || body?.error || body?.message);
    throw new Error(`${engineLabel}_RUNPOD_REQUEST_FAILED:${response.status}:${message || "UNKNOWN"}`);
  }
  return body;
}

function candidateAssets(input = {}) {
  return [
    input.source,
    input.image,
    input.video,
    input.audio,
    input.source_image,
    input.sourceImage,
    input.mask_image,
    input.maskImage,
    input.source_video,
    input.sourceVideo,
    input.source_audio,
    input.sourceAudio,
    input.reference_images,
    input.referenceImages,
    input.reference_assets,
    input.referenceAssets,
    input.source_assets,
    input.sourceAssets,
    input.assets,
  ].flat(Infinity).filter(Boolean);
}

async function signedInputAssets(input = {}) {
  const organizationId = text(input.context?.organization_id);
  if (!organizationId) throw new Error("organization_id required");
  const urls = [];
  for (const candidate of candidateAssets(input)) {
    const resolved = await resolveFirstCreativeProviderAssetUrl({
      organization_id: organizationId,
      values: [candidate],
    });
    if (resolved && !urls.includes(resolved)) urls.push(resolved);
    if (urls.length >= 12) break;
  }
  return urls;
}

async function resolveSemanticAssetRoles(input = {}) {
  const organizationId = text(input.context?.organization_id);
  if (!organizationId) throw new Error("organization_id required");
  const roleCandidates = {
    source_image: [input.source_image, input.sourceImage, input.image, input.source],
    mask_image: [input.mask_image, input.maskImage, input.mask],
    source_video: [input.source_video, input.sourceVideo, input.input_video, input.inputVideo, input.video],
    source_audio: [input.source_audio, input.sourceAudio, input.audio],
  };
  const resolvedRoles = {};
  for (const [role, values] of Object.entries(roleCandidates)) {
    const resolved = await resolveFirstCreativeProviderAssetUrl({
      organization_id: organizationId,
      values: values.flat(Infinity).filter(Boolean),
    });
    if (resolved) resolvedRoles[role] = resolved;
  }
  return resolvedRoles;
}

async function outputUploadTarget({ organizationId, usageId, family, extension }) {
  if (!extension) return null;
  const safeUsage = text(usageId).replace(/[^A-Za-z0-9_-]/g, "");
  if (!organizationId || !safeUsage) throw new Error("OWNED_WORKER_STORAGE_SCOPE_REQUIRED");
  const path = `${organizationId}/generated/avantiqo-${family}/${safeUsage}.${extension}`;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(OUTPUT_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("OWNED_WORKER_SIGNED_UPLOAD_URL_REQUIRED");
  return {
    signed_url: data.signedUrl,
    storage_reference: `storage://${OUTPUT_BUCKET}/${path}`,
  };
}

function instruction(input = {}) {
  return text(
    input.provider_prompt ||
      input.prompt ||
      input.instructions_text ||
      input.instructions ||
      input.input ||
      input.description ||
      input.title ||
      input.generation?.instructions,
  );
}

async function completedOutput(body, organizationId) {
  if (runpodStatus(body?.status) !== "completed") return null;
  const output = object(body?.output);
  const storageReference = text(output.storage_reference || output.storageReference);
  if (!storageReference) return cleanOutput(output);
  const url = await resolveCreativeProviderAssetUrl({
    organization_id: organizationId,
    value: storageReference,
  });
  return cleanOutput({
    ...output,
    storage_reference: storageReference,
    asset_url: url,
  });
}

export function createAvantiqoOwnedRunpodWorker({
  providerId,
  family,
  engineContract,
  endpointEnv,
  enabledEnv,
  timeoutEnv,
  defaultModel,
  outputExtension = null,
} = {}) {
  const engineLabel = text(providerId).toUpperCase().replace(/[^A-Z0-9]+/g, "_");

  return {
    id: providerId,

    async execute(input = {}) {
      const organizationId = text(input.context?.organization_id);
      const organizationServiceId = text(input.context?.organization_service_id);
      const usageId = text(input.context?.usage_id);
      if (!organizationId || !organizationServiceId || !usageId) {
        throw new Error(`${engineLabel}_GOVERNED_SERVICE_EXECUTION_REQUIRED`);
      }

      const capability = text(input.capability);
      if (!capability) throw new Error(`${engineLabel}_CAPABILITY_REQUIRED`);
      const workerInstruction = instruction(input);
      if (!workerInstruction) throw new Error(`${engineLabel}_INSTRUCTION_REQUIRED`);
      const { baseUrl, apiKey, timeoutMs } = config({
        endpointEnv,
        enabledEnv,
        timeoutEnv,
        engineLabel,
      });
      const sourceAssets = await signedInputAssets(input);
      const sourceAssetRoles = await resolveSemanticAssetRoles(input);
      const storageUpload = await outputUploadTarget({
        organizationId,
        usageId,
        family,
        extension: outputExtension,
      });
      const model = text(input.model) || defaultModel;
      const response = await fetchWithTimeout(`${baseUrl}/run`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          input: {
            contract: engineContract,
            capability,
            model,
            instruction: workerInstruction,
            structured_specification: cleanOutput({
              generation: input.generation,
              requirements: input.requirements,
              intent: input.intent,
              output_spec: input.output_spec,
              provider_parameters: input.provider_parameters,
              identity_lock: input.identity_lock,
              repair_contract: input.repair_contract,
              repair_specification: input.repair_specification,
              metadata: input.metadata,
            }),
            source_asset_roles: sourceAssetRoles,
            source_assets: sourceAssets,
            organization_id: organizationId,
            usage_id: usageId,
            ...(storageUpload ? { storage_upload: storageUpload } : {}),
          },
        }),
      }, timeoutMs);
      const body = await responseJson(response, engineLabel);
      const jobId = text(body.id || body.job_id || body.jobId);
      if (!jobId) throw new Error(`${engineLabel}_RUNPOD_JOB_ID_REQUIRED`);

      return {
        success: true,
        provider: providerId,
        model,
        output: {
          provider_job_id: jobId,
          status: runpodStatus(body.status || "IN_QUEUE"),
          ...(storageUpload
            ? { storage_reference: storageUpload.storage_reference }
            : {}),
          engine_contract: engineContract,
          capability,
          infrastructure_provider: "RUNPOD_SERVERLESS",
          raw_reasoning_persisted: false,
        },
      };
    },

    async getStatus(input = {}) {
      const organizationId = text(input.context?.organization_id);
      const jobId = text(input.job_id || input.jobId || input.provider_job_id);
      if (!organizationId) throw new Error("organization_id required");
      if (!jobId) throw new Error(`${engineLabel}_JOB_ID_REQUIRED`);
      const { baseUrl, apiKey, timeoutMs } = config({
        endpointEnv,
        enabledEnv,
        timeoutEnv,
        engineLabel,
      });
      const response = await fetchWithTimeout(
        `${baseUrl}/status/${encodeURIComponent(jobId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
        },
        timeoutMs,
      );
      const body = await responseJson(response, engineLabel);
      const status = runpodStatus(body.status);
      const output = await completedOutput(body, organizationId);
      return cleanOutput({
        status,
        provider_job_id: jobId,
        ...(status === "failed"
          ? { error: body.error || body.output?.error || `${providerId} execution failed` }
          : {}),
        ...(output ? { output } : {}),
        raw_reasoning_persisted: false,
      });
    },
  };
}
