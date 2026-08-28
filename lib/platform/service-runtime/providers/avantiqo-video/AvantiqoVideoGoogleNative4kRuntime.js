import "../gemini/ManagedGeminiCredentialRegistration.js";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { resolveProviderCredential } from "../ProviderCredentialRuntime";

export const AVANTIQO_VIDEO_GOOGLE_NATIVE_4K_CONTRACT =
  "AVANTIQO_VIDEO_GOOGLE_VEO_3_1_FAST_NATIVE_4K_V1";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "veo-3.1-fast-generate-preview";
const JOB_PREFIX = "google-veo-native4k:v1:";
const BUCKET = "creative-assets";
const MAX_OUTPUT_BYTES = 384 * 1024 * 1024;

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function compact(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""),
  );
}

class SafeFallbackError extends Error {
  constructor(message) {
    super(message);
    this.name = "AvantiqoVideoGoogleNative4kSafeFallbackError";
    this.safe_to_fallback = true;
  }
}

function organizationId(input = {}) {
  const value = text(input.context?.organization_id || input.organization_id || input.organizationId);
  if (!value) throw new Error("AVANTIQO_VIDEO_GOOGLE_NATIVE4K_ORGANIZATION_REQUIRED");
  return value;
}

function usageId(input = {}) {
  const value = text(input.context?.usage_id || input.usage_id || input.usageId);
  if (!value) throw new Error("AVANTIQO_VIDEO_GOOGLE_NATIVE4K_USAGE_REQUIRED");
  return value;
}

function aspectRatio(input = {}) {
  const generation = object(input.generation);
  const value = text(input.aspect_ratio || input.aspectRatio || generation.aspect_ratio || generation.aspectRatio || "16:9");
  if (!["16:9", "9:16"].includes(value)) {
    throw new SafeFallbackError(`AVANTIQO_VIDEO_GOOGLE_NATIVE4K_ASPECT_UNSUPPORTED:${value}`);
  }
  return value;
}

function serializedInstruction(input = {}) {
  const generation = object(input.generation);
  const value = text(
    input.provider_prompt ||
    input.prompt ||
    input.instructions_text ||
    input.instructions ||
    generation.provider_prompt ||
    generation.prompt,
  );
  if (!value) throw new SafeFallbackError("AVANTIQO_VIDEO_GOOGLE_NATIVE4K_INSTRUCTION_REQUIRED");
  return value;
}

function negativeInstruction(input = {}) {
  const requirements = object(input.requirements);
  const control = object(input.cinematic_control);
  const values = [
    ...(Array.isArray(input.negative_constraints) ? input.negative_constraints : []),
    ...(Array.isArray(requirements.negative_constraints) ? requirements.negative_constraints : []),
    ...(Array.isArray(control.negative_constraints) ? control.negative_constraints : []),
  ].map(text).filter(Boolean);
  if (!values.length) return "";
  return ` Avoid: ${[...new Set(values)].join(", ")}.`;
}

async function managedCredential(input = {}) {
  let credential;
  try {
    credential = await resolveProviderCredential({
      organization_id: organizationId(input),
      provider: "google-veo",
      credential_id: input.context?.credential_id || null,
    });
  } catch (error) {
    throw new SafeFallbackError(`AVANTIQO_VIDEO_GOOGLE_NATIVE4K_CREDENTIAL_RESOLUTION_FAILED:${text(error?.message || error)}`);
  }
  const apiKey = text(credential?.api_key);
  if (!apiKey) {
    throw new SafeFallbackError("AVANTIQO_VIDEO_GOOGLE_NATIVE4K_CREDENTIAL_UNAVAILABLE");
  }
  return { credential, apiKey };
}

function encodeJob(operationName) {
  const name = text(operationName);
  if (!name || name.includes("..") || !/^[A-Za-z0-9._~/-]+$/.test(name)) {
    throw new Error("AVANTIQO_VIDEO_GOOGLE_NATIVE4K_OPERATION_INVALID");
  }
  return `${JOB_PREFIX}${Buffer.from(name, "utf8").toString("base64url")}`;
}

function decodeJob(jobId) {
  const value = text(jobId);
  if (!value.startsWith(JOB_PREFIX)) {
    throw new Error("AVANTIQO_VIDEO_GOOGLE_NATIVE4K_JOB_INVALID");
  }
  const encoded = value.slice(JOB_PREFIX.length);
  let name = "";
  try { name = Buffer.from(encoded, "base64url").toString("utf8"); } catch { name = ""; }
  if (!name || name.includes("..") || !/^[A-Za-z0-9._~/-]+$/.test(name)) {
    throw new Error("AVANTIQO_VIDEO_GOOGLE_NATIVE4K_OPERATION_INVALID");
  }
  return name;
}

function googleMessage(body = {}, status = null) {
  return text(body?.error?.message || body?.message || body?.error) ||
    (status ? `Google Veo API status ${status}` : "Google Veo API error");
}

async function googleJson(url, apiKey, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      cache: "no-store",
      redirect: "error",
      headers: {
        "x-goog-api-key": apiKey,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(options.timeout_ms || 30_000),
    });
  } catch (error) {
    const wrapped = new Error(`AVANTIQO_VIDEO_GOOGLE_NATIVE4K_TRANSPORT_AMBIGUOUS:${text(error?.name || error?.message || error)}`);
    wrapped.safe_to_fallback = false;
    throw wrapped;
  }

  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  if (!response.ok) {
    const error = new SafeFallbackError(
      `AVANTIQO_VIDEO_GOOGLE_NATIVE4K_HTTP_${response.status}:${googleMessage(body, response.status).slice(0, 600)}`,
    );
    error.http_status = response.status;
    throw error;
  }
  return body;
}

function generatedVideoUri(result = {}) {
  const sample = result?.response?.generateVideoResponse?.generatedSamples?.[0];
  return text(
    sample?.video?.uri ||
    sample?.uri ||
    (typeof sample === "string" ? sample : "") ||
    result?.response?.generatedVideos?.[0]?.video?.uri,
  ) || null;
}

function filteredReason(result = {}) {
  const response = object(result?.response?.generateVideoResponse);
  const reasons = Array.isArray(response.raiMediaFilteredReasons)
    ? response.raiMediaFilteredReasons.map(text).filter(Boolean)
    : [];
  return reasons[0] || null;
}

function trustedGoogleUrl(value) {
  const parsed = new URL(value);
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:") throw new Error("AVANTIQO_VIDEO_GOOGLE_NATIVE4K_DOWNLOAD_PROTOCOL_INVALID");
  if (!(
    hostname === "generativelanguage.googleapis.com" ||
    hostname.endsWith(".googleapis.com") ||
    hostname.endsWith(".googleusercontent.com")
  )) {
    throw new Error("AVANTIQO_VIDEO_GOOGLE_NATIVE4K_DOWNLOAD_HOST_INVALID");
  }
  return parsed;
}

async function downloadVideo(uri, apiKey) {
  let current = trustedGoogleUrl(uri);
  let includeKey = current.hostname.endsWith("googleapis.com");

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(current, {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      headers: includeKey ? { "x-goog-api-key": apiKey } : {},
      signal: AbortSignal.timeout(120_000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("AVANTIQO_VIDEO_GOOGLE_NATIVE4K_DOWNLOAD_REDIRECT_INVALID");
      current = trustedGoogleUrl(new URL(location, current).toString());
      includeKey = current.hostname.endsWith("googleapis.com");
      continue;
    }
    if (!response.ok) throw new Error(`AVANTIQO_VIDEO_GOOGLE_NATIVE4K_DOWNLOAD_HTTP_${response.status}`);

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_OUTPUT_BYTES) throw new Error("AVANTIQO_VIDEO_GOOGLE_NATIVE4K_OUTPUT_TOO_LARGE");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_OUTPUT_BYTES) throw new Error("AVANTIQO_VIDEO_GOOGLE_NATIVE4K_OUTPUT_SIZE_INVALID");
    const mime = text(response.headers.get("content-type")).split(";")[0].toLowerCase();
    if (mime && mime !== "video/mp4") throw new Error(`AVANTIQO_VIDEO_GOOGLE_NATIVE4K_OUTPUT_MIME_INVALID:${mime}`);
    return bytes;
  }
  throw new Error("AVANTIQO_VIDEO_GOOGLE_NATIVE4K_DOWNLOAD_REDIRECT_LIMIT");
}

function finalPath(input = {}) {
  const org = organizationId(input).replace(/[^A-Za-z0-9_-]/g, "");
  const usage = usageId(input).replace(/[^A-Za-z0-9_-]/g, "");
  if (!org || !usage) throw new Error("AVANTIQO_VIDEO_GOOGLE_NATIVE4K_STORAGE_IDENTITY_INVALID");
  return `${org}/generated/avantiqo-video/${usage}.mp4`;
}

async function persistFinal(input, bytes) {
  const path = finalPath(input);
  const supabase = getServiceSupabase();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) throw error;
  const storageReference = `storage://${BUCKET}/${path}`;
  const signed = await resolveCreativeProviderAssetUrl({
    organization_id: organizationId(input),
    value: storageReference,
  });
  if (!signed) throw new Error("AVANTIQO_VIDEO_GOOGLE_NATIVE4K_SIGNED_URL_REQUIRED");
  return { storage_reference: storageReference, video_url: signed };
}

export function isAvantiqoVideoGoogleNative4kJob(value) {
  return text(value).startsWith(JOB_PREFIX);
}

export function isAvantiqoVideoGoogleNative4kSafeFallbackError(error) {
  return error?.safe_to_fallback === true;
}

export async function inspectAvantiqoVideoGoogleNative4kReadiness(input = {}) {
  const { apiKey } = await managedCredential(input);
  const model = await googleJson(`${API_BASE}/models/${encodeURIComponent(MODEL)}`, apiKey, {
    method: "GET",
    timeout_ms: 15_000,
  });
  const name = text(model?.name);
  if (name && !name.endsWith(MODEL)) {
    throw new SafeFallbackError(`AVANTIQO_VIDEO_GOOGLE_NATIVE4K_MODEL_MISMATCH:${name}`);
  }
  return {
    ready: true,
    contract: AVANTIQO_VIDEO_GOOGLE_NATIVE_4K_CONTRACT,
    provider: "google-veo",
    model: MODEL,
    resolution: "4k",
    duration_seconds: 8,
    paid_generation_performed: false,
    secrets_printed: false,
  };
}

export async function submitAvantiqoVideoGoogleNative4k(input = {}) {
  if (text(input.capability) !== "ai.video.generate") {
    throw new SafeFallbackError(`AVANTIQO_VIDEO_GOOGLE_NATIVE4K_CAPABILITY_UNSUPPORTED:${text(input.capability)}`);
  }
  const { apiKey } = await managedCredential(input);
  const instruction = `${serializedInstruction(input)}${negativeInstruction(input)}`.trim();
  const result = await googleJson(
    `${API_BASE}/models/${encodeURIComponent(MODEL)}:predictLongRunning`,
    apiKey,
    {
      method: "POST",
      body: JSON.stringify({
        instances: [{ prompt: instruction }],
        parameters: compact({
          durationSeconds: 8,
          aspectRatio: aspectRatio(input),
          resolution: "4k",
          personGeneration: "allow_all",
        }),
      }),
      timeout_ms: 30_000,
    },
  );
  const operationName = text(result?.name);
  if (!operationName) throw new Error("AVANTIQO_VIDEO_GOOGLE_NATIVE4K_OPERATION_REQUIRED");
  return {
    contract: AVANTIQO_VIDEO_GOOGLE_NATIVE_4K_CONTRACT,
    provider: "google-veo",
    model: MODEL,
    provider_job_id: encodeJob(operationName),
    provider_operation_name: operationName,
    status: "processing",
    resolution: "4k",
    duration_seconds: 8,
    prompt_persisted: false,
  };
}

export async function getAvantiqoVideoGoogleNative4kStatus({ input = {}, jobId } = {}) {
  const { apiKey } = await managedCredential(input);
  const operationName = decodeJob(jobId);
  const result = await googleJson(`${API_BASE}/${operationName}`, apiKey, {
    method: "GET",
    timeout_ms: 30_000,
  });

  if (result?.error) {
    return {
      status: "failed",
      provider: "google-veo",
      model: MODEL,
      provider_job_id: jobId,
      error: googleMessage(result.error),
    };
  }
  if (result?.done !== true) {
    return {
      status: "processing",
      provider: "google-veo",
      model: MODEL,
      provider_job_id: jobId,
    };
  }

  const uri = generatedVideoUri(result);
  if (!uri) {
    return {
      status: "failed",
      provider: "google-veo",
      model: MODEL,
      provider_job_id: jobId,
      error: filteredReason(result) || "AVANTIQO_VIDEO_GOOGLE_NATIVE4K_COMPLETED_URI_REQUIRED",
    };
  }

  const bytes = await downloadVideo(uri, apiKey);
  const persisted = await persistFinal(input, bytes);
  return {
    status: "completed",
    provider: "google-veo",
    model: MODEL,
    provider_job_id: jobId,
    resolution: "4k",
    duration_seconds: 8,
    storage_reference: persisted.storage_reference,
    video_url: persisted.video_url,
    result: persisted.video_url,
    prompt_persisted: false,
  };
}

export const AVANTIQO_VIDEO_GOOGLE_NATIVE_4K_MODEL = MODEL;
