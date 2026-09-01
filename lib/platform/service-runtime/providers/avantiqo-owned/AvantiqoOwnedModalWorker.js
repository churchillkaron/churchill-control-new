import {
  resolveFirstCreativeProviderAssetUrl,
  resolveCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

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

function modalStatus(value) {
  const status = text(value).toUpperCase();
  if (["SUCCEEDED", "COMPLETED", "COMPLETE", "SUCCESS", "DONE"].includes(status)) return "completed";
  if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(status)) return "failed";
  if (["QUEUED", "PENDING"].includes(status)) return "queued";
  return "processing";
}

function config({ baseUrlEnv, tokenEnv, enabledEnv, timeoutEnv, engineLabel }) {
  const baseUrl = text(process.env[baseUrlEnv]).replace(/\/+$/, "");
  const gatewayToken = text(process.env[tokenEnv]);
  const enabled = ["1", "true", "yes", "on"].includes(text(process.env[enabledEnv]).toLowerCase());
  if (!enabled) throw new Error(`${engineLabel}_ENGINE_DISABLED`);
  if (!baseUrl.startsWith("https://")) throw new Error(`${baseUrlEnv}_HTTPS_REQUIRED`);
  if (gatewayToken.length < 40) throw new Error(`${tokenEnv}_REQUIRED`);
  return {
    baseUrl,
    gatewayToken,
    timeoutMs: Math.max(1000, Number(process.env[timeoutEnv] || DEFAULT_TIMEOUT_MS)),
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

async function responseJson(response, engineLabel, { httpContract = null, transport = null } = {}) {
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { message: raw };
  }
  if (!response.ok) {
    const message = text(body?.detail || body?.error?.message || body?.error || body?.message);
    throw new Error(`${engineLabel}_MODAL_REQUEST_FAILED:${response.status}:${message || "UNKNOWN"}`);
  }
  if (httpContract && text(body?.contract) !== httpContract) {
    throw new Error(`${engineLabel}_MODAL_HTTP_CONTRACT_INVALID`);
  }
  if (transport && text(body?.transport) !== transport) {
    throw new Error(`${engineLabel}_MODAL_TRANSPORT_INVALID`);
  }
  if (body?.raw_reasoning_persisted !== false) {
    throw new Error(`${engineLabel}_MODAL_REASONING_BOUNDARY_INVALID`);
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
    input.provider_prompt || input.prompt || input.instructions_text || input.instructions ||
      input.input || input.description || input.title || input.generation?.instructions,
  );
}

function outputExtensionForCapability(capability, outputExtension, outputExtensions) {
  if (outputExtensions && typeof outputExtensions === "object" && Object.prototype.hasOwnProperty.call(outputExtensions, capability)) {
    return outputExtensions[capability] || null;
  }
  return outputExtension;
}

async function completedOutput(body, organizationId) {
  if (modalStatus(body?.status) !== "completed") return null;
  const output = object(body?.output);
  if (output.raw_reasoning_persisted !== false) {
    throw new Error("OWNED_MODAL_WORKER_REASONING_BOUNDARY_INVALID");
  }
  const storageReference = text(output.storage_reference || output.storageReference);
  if (!storageReference) return cleanOutput(output);
  const url = await resolveCreativeProviderAssetUrl({
    organization_id: organizationId,
    value: storageReference,
  });
  return cleanOutput({ ...output, storage_reference: storageReference, asset_url: url });
}

export function createAvantiqoOwnedModalWorker({
  providerId,
  family,
  engineContract,
  httpContract = null,
  transport = "modal-function-call",
  jobPrefix = "modal-owned:",
  baseUrlEnv,
  tokenEnv,
  enabledEnv,
  timeoutEnv,
  defaultModel,
  outputExtension = null,
  outputExtensions = null,
} = {}) {
  const engineLabel = text(providerId).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (!jobPrefix) throw new Error("OWNED_MODAL_WORKER_JOB_PREFIX_REQUIRED");

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
      const { baseUrl, gatewayToken, timeoutMs } = config({
        baseUrlEnv, tokenEnv, enabledEnv, timeoutEnv, engineLabel,
      });
      const sourceAssets = await signedInputAssets(input);
      const sourceAssetRoles = await resolveSemanticAssetRoles(input);
      const storageUpload = await outputUploadTarget({
        organizationId,
        usageId,
        family,
        extension: outputExtensionForCapability(capability, outputExtension, outputExtensions),
      });
      const model = text(input.model) || defaultModel;
      const response = await fetchWithTimeout(`${baseUrl}/v1/jobs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${gatewayToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
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
        }),
      }, timeoutMs);
      const body = await responseJson(response, engineLabel, { httpContract, transport });
      if (body?.proxy_timeout_safe !== true) {
        throw new Error(`${engineLabel}_MODAL_PROXY_TIMEOUT_SAFE_REQUIRED`);
      }
      const rawJobId = text(body.job_id || body.jobId || body.id);
      if (!rawJobId) throw new Error(`${engineLabel}_MODAL_JOB_ID_REQUIRED`);
      return {
        success: true,
        provider: providerId,
        model,
        output: {
          provider_job_id: `${jobPrefix}${rawJobId}`,
          status: modalStatus(body.status || "QUEUED"),
          ...(storageUpload ? { storage_reference: storageUpload.storage_reference } : {}),
          engine_contract: engineContract,
          capability,
          infrastructure_provider: "MODAL_ASYNC_V1",
          modal_http_contract: httpContract,
          modal_transport: transport,
          runpod_safe_lease_required: false,
          raw_reasoning_persisted: false,
        },
      };
    },

    async getStatus(input = {}) {
      const organizationId = text(input.context?.organization_id);
      const jobId = text(input.job_id || input.jobId || input.provider_job_id);
      if (!organizationId) throw new Error("organization_id required");
      if (!jobId || !jobId.startsWith(jobPrefix)) throw new Error(`${engineLabel}_MODAL_JOB_ID_REQUIRED`);
      const rawJobId = jobId.slice(jobPrefix.length);
      if (!rawJobId) throw new Error(`${engineLabel}_MODAL_JOB_ID_REQUIRED`);
      const { baseUrl, gatewayToken, timeoutMs } = config({
        baseUrlEnv, tokenEnv, enabledEnv, timeoutEnv, engineLabel,
      });
      const response = await fetchWithTimeout(`${baseUrl}/v1/jobs/${encodeURIComponent(rawJobId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${gatewayToken}`, Accept: "application/json" },
      }, timeoutMs);
      const body = await responseJson(response, engineLabel, { httpContract, transport });
      const status = modalStatus(body.status);
      const output = await completedOutput(body, organizationId);
      return cleanOutput({
        status,
        provider_job_id: jobId,
        ...(status === "failed" ? { error: body.error_code || body.error || body.error_message || `${providerId} execution failed` } : {}),
        ...(output ? { output } : {}),
        infrastructure_provider: "MODAL_ASYNC_V1",
        raw_reasoning_persisted: false,
      });
    },
  };
}
