import {
  resolveFirstCreativeProviderAssetUrl,
  resolveCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const OUTPUT_BUCKET = "creative-assets";
const DEFAULT_TIMEOUT_MS = 30000;
const DIRECT_MODAL_TRANSPORT = "modal-js-sdk-function-call-v1";
const GATEWAY_MODAL_TRANSPORT = "modal-function-call";
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

let modalSdkPromise = null;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
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

function gatewayConfig({ baseUrlEnv, tokenEnv, enabledEnv, timeoutEnv, engineLabel }) {
  const baseUrl = text(process.env[baseUrlEnv]).replace(/\/+$/, "");
  const gatewayToken = text(process.env[tokenEnv]);
  if (!enabled(process.env[enabledEnv])) throw new Error(`${engineLabel}_ENGINE_DISABLED`);
  if (!baseUrl.startsWith("https://")) throw new Error(`${baseUrlEnv}_HTTPS_REQUIRED`);
  if (gatewayToken.length < 40) throw new Error(`${tokenEnv}_REQUIRED`);
  return {
    baseUrl,
    gatewayToken,
    timeoutMs: Math.max(1000, Number(process.env[timeoutEnv] || DEFAULT_TIMEOUT_MS)),
  };
}

function directConfig({ enabledEnv, timeoutEnv, engineLabel, appName, functionName, environmentEnv }) {
  if (!enabled(process.env[enabledEnv])) throw new Error(`${engineLabel}_ENGINE_DISABLED`);
  const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
  const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
  if (!tokenId) throw new Error(`${engineLabel}_MODAL_TOKEN_ID_REQUIRED`);
  if (!tokenSecret) throw new Error(`${engineLabel}_MODAL_TOKEN_SECRET_REQUIRED`);
  if (!text(appName)) throw new Error(`${engineLabel}_MODAL_APP_NAME_REQUIRED`);
  if (!text(functionName)) throw new Error(`${engineLabel}_MODAL_FUNCTION_NAME_REQUIRED`);
  return {
    tokenId,
    tokenSecret,
    appName: text(appName),
    functionName: text(functionName),
    environment: text(process.env[environmentEnv] || process.env.MODAL_ENVIRONMENT),
    timeoutMs: Math.max(1000, Number(process.env[timeoutEnv] || DEFAULT_TIMEOUT_MS)),
  };
}

async function modalSdk() {
  if (!modalSdkPromise) modalSdkPromise = import("modal");
  return modalSdkPromise;
}

async function modalClient(config) {
  const sdk = await modalSdk();
  return {
    sdk,
    client: new sdk.ModalClient({ tokenId: config.tokenId, tokenSecret: config.tokenSecret }),
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

function workerPayload({ input, engineContract, capability, model, workerInstruction, sourceAssetRoles, sourceAssets, organizationId, usageId, storageUpload }) {
  return {
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
  };
}

async function completedGatewayOutput(body, organizationId) {
  if (modalStatus(body?.status) !== "completed") return null;
  const output = object(body?.output);
  return completedDirectOutput(output, organizationId);
}

async function completedDirectOutput(value, organizationId) {
  const output = object(value);
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

function isZeroPollTimeout(error, sdk) {
  if (!(error instanceof sdk.FunctionTimeoutError)) return false;
  return /Timeout exceeded:\s*0ms/i.test(text(error?.message));
}

export function createAvantiqoOwnedModalWorker({
  providerId,
  family,
  engineContract,
  httpContract = null,
  transport = GATEWAY_MODAL_TRANSPORT,
  transportMode = "gateway",
  jobPrefix = "modal-owned:",
  baseUrlEnv,
  tokenEnv,
  enabledEnv,
  timeoutEnv,
  appName = null,
  functionName = "generate",
  environmentEnv = "AVANTIQO_MODAL_ENVIRONMENT",
  defaultModel,
  outputExtension = null,
  outputExtensions = null,
} = {}) {
  const engineLabel = text(providerId).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const direct = text(transportMode).toLowerCase() === "direct-sdk";
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

      const sourceAssets = await signedInputAssets(input);
      const sourceAssetRoles = await resolveSemanticAssetRoles(input);
      const storageUpload = await outputUploadTarget({
        organizationId,
        usageId,
        family,
        extension: outputExtensionForCapability(capability, outputExtension, outputExtensions),
      });
      const model = text(input.model) || defaultModel;
      const payload = workerPayload({
        input,
        engineContract,
        capability,
        model,
        workerInstruction,
        sourceAssetRoles,
        sourceAssets,
        organizationId,
        usageId,
        storageUpload,
      });

      if (direct) {
        const config = directConfig({ enabledEnv, timeoutEnv, engineLabel, appName, functionName, environmentEnv });
        const { client } = await modalClient(config);
        const lookupOptions = config.environment ? { environment: config.environment } : {};
        const worker = await client.functions.fromName(config.appName, config.functionName, lookupOptions);
        const call = await worker.spawn([payload]);
        const rawJobId = text(call.functionCallId);
        if (!rawJobId) throw new Error(`${engineLabel}_MODAL_CALL_ID_REQUIRED`);
        return {
          success: true,
          provider: providerId,
          model,
          output: {
            provider_job_id: `${jobPrefix}${rawJobId}`,
            status: "queued",
            ...(storageUpload ? { storage_reference: storageUpload.storage_reference } : {}),
            engine_contract: engineContract,
            capability,
            infrastructure_provider: "MODAL_DIRECT_ASYNC_V1",
            modal_transport: DIRECT_MODAL_TRANSPORT,
            modal_app: config.appName,
            modal_function: config.functionName,
            modal_gateway_used: false,
            runpod_safe_lease_required: false,
            raw_reasoning_persisted: false,
          },
        };
      }

      const { baseUrl, gatewayToken, timeoutMs } = gatewayConfig({
        baseUrlEnv, tokenEnv, enabledEnv, timeoutEnv, engineLabel,
      });
      const response = await fetchWithTimeout(`${baseUrl}/v1/jobs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${gatewayToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
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
          modal_gateway_used: true,
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

      if (direct) {
        const config = directConfig({ enabledEnv, timeoutEnv, engineLabel, appName, functionName, environmentEnv });
        const { sdk, client } = await modalClient(config);
        try {
          const call = await client.functionCalls.fromId(rawJobId);
          const result = await call.get({ timeoutMs: 0 });
          const output = await completedDirectOutput(result, organizationId);
          return cleanOutput({
            status: "completed",
            provider_job_id: jobId,
            ...(output ? { output } : {}),
            infrastructure_provider: "MODAL_DIRECT_ASYNC_V1",
            modal_transport: DIRECT_MODAL_TRANSPORT,
            modal_gateway_used: false,
            raw_reasoning_persisted: false,
          });
        } catch (error) {
          if (isZeroPollTimeout(error, sdk)) {
            return {
              status: "processing",
              provider_job_id: jobId,
              infrastructure_provider: "MODAL_DIRECT_ASYNC_V1",
              modal_transport: DIRECT_MODAL_TRANSPORT,
              modal_gateway_used: false,
              raw_reasoning_persisted: false,
            };
          }
          return cleanOutput({
            status: "failed",
            provider_job_id: jobId,
            error: `${engineLabel}_MODAL_EXECUTION_FAILED:${text(error?.name || "Error")}:${text(error?.message || error).slice(0, 800)}`,
            infrastructure_provider: "MODAL_DIRECT_ASYNC_V1",
            modal_transport: DIRECT_MODAL_TRANSPORT,
            modal_gateway_used: false,
            raw_reasoning_persisted: false,
          });
        }
      }

      const { baseUrl, gatewayToken, timeoutMs } = gatewayConfig({
        baseUrlEnv, tokenEnv, enabledEnv, timeoutEnv, engineLabel,
      });
      const response = await fetchWithTimeout(`${baseUrl}/v1/jobs/${encodeURIComponent(rawJobId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${gatewayToken}`, Accept: "application/json" },
      }, timeoutMs);
      const body = await responseJson(response, engineLabel, { httpContract, transport });
      const status = modalStatus(body.status);
      const output = await completedGatewayOutput(body, organizationId);
      return cleanOutput({
        status,
        provider_job_id: jobId,
        ...(status === "failed" ? { error: body.error_code || body.error || body.error_message || `${providerId} execution failed` } : {}),
        ...(output ? { output } : {}),
        infrastructure_provider: "MODAL_ASYNC_V1",
        modal_transport: transport,
        modal_gateway_used: true,
        raw_reasoning_persisted: false,
      });
    },
  };
}
