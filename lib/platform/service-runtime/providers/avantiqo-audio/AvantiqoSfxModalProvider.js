import {
  resolveCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const PROVIDER_ID = "avantiqo-audio";
const CAPABILITY = "ai.sfx.generate";
const ENGINE_CONTRACT = "AVANTIQO_SFX_ENGINE_V1";
const PRODUCT_MODEL = "avantiqo-sfx-v1";
const FOUNDATION_MODEL = "OpenMOSS-Team/MOSS-SoundEffect-v2.0";
const OUTPUT_BUCKET = "creative-assets";
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

function text(value) { return String(value ?? "").trim(); }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

function endpointConfig() {
  if (!enabled(process.env.AVANTIQO_SFX_ENGINE_ENABLED)) throw new Error("AVANTIQO_SFX_ENGINE_DISABLED");
  if (!enabled(process.env.AVANTIQO_SFX_ENGINE_CERTIFIED)) throw new Error("AVANTIQO_SFX_ENGINE_NOT_CERTIFIED");
  const endpoint = text(process.env.AVANTIQO_SFX_MODAL_ENDPOINT_URL);
  if (!endpoint) throw new Error("AVANTIQO_SFX_MODAL_ENDPOINT_URL_REQUIRED");
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:") throw new Error("AVANTIQO_SFX_MODAL_ENDPOINT_HTTPS_REQUIRED");
  return { endpoint: parsed.toString(), timeoutMs: Math.max(1000, Number(process.env.AVANTIQO_SFX_ENGINE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)) };
}

async function outputUploadTarget({ organizationId, usageId }) {
  const safeUsage = text(usageId).replace(/[^A-Za-z0-9_-]/g, "");
  if (!organizationId || !safeUsage) throw new Error("AVANTIQO_SFX_STORAGE_SCOPE_REQUIRED");
  const path = `${organizationId}/generated/avantiqo-sfx/${safeUsage}.wav`;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("AVANTIQO_SFX_SIGNED_UPLOAD_URL_REQUIRED");
  return { signed_url: data.signedUrl, storage_reference: `storage://${OUTPUT_BUCKET}/${path}` };
}

function instruction(input = {}) {
  return text(input.provider_prompt || input.prompt || input.instructions_text || input.instructions || input.input || input.description || input.title || input.generation?.instructions);
}

async function fetchJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = { error_detail: raw }; }
    if (!response.ok) throw new Error(`AVANTIQO_SFX_MODAL_REQUEST_FAILED:${response.status}:${text(body.error_detail || body.error)}`);
    return body;
  } finally { clearTimeout(timer); }
}

export const AvantiqoSfxModalProvider = {
  id: PROVIDER_ID,
  async execute(input = {}) {
    if (text(input.capability) !== CAPABILITY) throw new Error(`AVANTIQO_SFX_CAPABILITY_NOT_SUPPORTED:${text(input.capability)}`);
    const organizationId = text(input.context?.organization_id);
    const organizationServiceId = text(input.context?.organization_service_id);
    const usageId = text(input.context?.usage_id);
    if (!organizationId || !organizationServiceId || !usageId) throw new Error("AVANTIQO_SFX_GOVERNED_SERVICE_EXECUTION_REQUIRED");
    const prompt = instruction(input);
    if (!prompt) throw new Error("AVANTIQO_SFX_INSTRUCTION_REQUIRED");
    const { endpoint, timeoutMs } = endpointConfig();
    const storageUpload = await outputUploadTarget({ organizationId, usageId });
    const body = await fetchJson(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        contract: ENGINE_CONTRACT,
        capability: CAPABILITY,
        model: PRODUCT_MODEL,
        instruction: prompt,
        structured_specification: {
          generation: object(input.generation),
          requirements: object(input.requirements),
          intent: object(input.intent),
          output_spec: object(input.output_spec || input.outputSpec),
          provider_parameters: object(input.provider_parameters),
        },
        organization_id: organizationId,
        usage_id: usageId,
        storage_upload: storageUpload,
      }),
    }, timeoutMs);
    if (body?.success !== true || text(body?.status).toLowerCase() !== "completed") {
      throw new Error(`AVANTIQO_SFX_MODAL_GENERATION_FAILED:${text(body?.error_code || body?.error_detail || "UNKNOWN")}`);
    }
    if (text(body?.storage_reference) !== storageUpload.storage_reference) throw new Error("AVANTIQO_SFX_STORAGE_REFERENCE_MISMATCH");
    const assetUrl = await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: storageUpload.storage_reference });
    if (!assetUrl) throw new Error("AVANTIQO_SFX_PRIVATE_ASSET_URL_REQUIRED");
    return {
      success: true,
      provider: PROVIDER_ID,
      model: PRODUCT_MODEL,
      output: {
        ...body,
        status: "completed",
        asset_url: assetUrl,
        url: assetUrl,
        storage_reference: storageUpload.storage_reference,
        foundation_model: FOUNDATION_MODEL,
        engine_contract: ENGINE_CONTRACT,
        infrastructure_provider: "MODAL",
        raw_reasoning_persisted: false,
      },
    };
  },
  async getStatus() { throw new Error("AVANTIQO_SFX_MODAL_SYNCHRONOUS_STATUS_ONLY"); },
};
