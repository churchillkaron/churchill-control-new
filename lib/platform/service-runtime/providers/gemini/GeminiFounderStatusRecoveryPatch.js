import {
  uploadCreativeAsset,
} from "@/lib/creative/assets/storage/uploadCreativeAsset";

import {
  GeminiProvider,
} from "./GeminiProvider.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;

function text(value) {
  return String(value ?? "").trim();
}

function apiKey(input = {}) {
  const key = text(input.api_key || input.credential?.api_key);
  if (!key) throw new Error("GEMINI_API_KEY_REQUIRED");
  return key;
}

function organizationId(input = {}) {
  const value = text(
    input.context?.organization_id ||
    input.organization_id ||
    input.organizationId,
  );
  if (!value) throw new Error("GEMINI_ORGANIZATION_ID_REQUIRED");
  return value;
}

function model(input = {}) {
  return text(input.model) || "gemini-omni-flash-preview";
}

function interactionId(input = {}) {
  return text(
    input.interaction_id ||
    input.interactionId ||
    input.provider_interaction_id ||
    input.providerInteractionId,
  ) || null;
}

function videoContent(result = {}) {
  if (result.output_video && typeof result.output_video === "object") {
    return result.output_video;
  }
  for (const step of Array.isArray(result.steps) ? result.steps : []) {
    if (text(step?.type).toLowerCase() !== "model_output") continue;
    for (const content of Array.isArray(step?.content) ? step.content : []) {
      if (text(content?.type).toLowerCase() === "video") return content;
    }
  }
  return null;
}

async function googleJson(path, key) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${API_BASE}${path}${separator}key=${encodeURIComponent(key)}`, {
    method: "GET",
    redirect: "error",
    headers: { Accept: "application/json" },
  });
  const raw = await response.text();
  let result = {};
  if (raw) {
    try {
      result = JSON.parse(raw);
    } catch {
      result = {};
    }
  }
  return { response, result };
}

function trustedRedirect(value) {
  const parsed = new URL(value);
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:") {
    throw new Error("GEMINI_DOWNLOAD_REDIRECT_PROTOCOL_INVALID");
  }
  if (!(
    hostname === "generativelanguage.googleapis.com" ||
    hostname.endsWith(".googleapis.com") ||
    hostname.endsWith(".googleusercontent.com")
  )) {
    throw new Error("GEMINI_DOWNLOAD_REDIRECT_HOST_INVALID");
  }
  return parsed;
}

async function downloadFile(fileId, key) {
  let current = new URL(
    `${API_BASE}/files/${encodeURIComponent(fileId)}:download?alt=media&key=${encodeURIComponent(key)}`,
  );

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) {
        throw new Error("GEMINI_DOWNLOAD_REDIRECT_INVALID");
      }
      current = trustedRedirect(new URL(location, current).toString());
      continue;
    }

    if (!response.ok) {
      throw new Error(`GEMINI_DOWNLOAD_FAILED:${response.status}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_OUTPUT_BYTES) {
      throw new Error("GEMINI_OUTPUT_SIZE_INVALID");
    }

    return {
      bytes,
      mime_type: text(response.headers.get("content-type")).split(";")[0] || "video/mp4",
    };
  }

  throw new Error("GEMINI_DOWNLOAD_REDIRECT_LIMIT");
}

async function persistVideo(bytes, mimeType, fileId, input = {}) {
  const upload = await uploadCreativeAsset({
    file: {
      buffer: bytes,
      name: `gemini-founder-${fileId}.mp4`,
      type: mimeType || "video/mp4",
    },
    organizationId: organizationId(input),
    creativeMissionId: null,
    creativeProjectId: null,
    uploadedBy: null,
  });

  return {
    video_url: upload.file_url,
    file_url: upload.file_url,
    storage_reference: upload.file_url,
    storage_bucket: upload.bucket,
    storage_path: upload.path,
    signed_url_required: true,
    mime_type: upload.mime_type,
    media_kind: upload.media_kind,
    size_bytes: upload.size_bytes,
    checksum_sha256: upload.checksum_sha256,
  };
}

async function persistInline(content, fileId, input = {}) {
  const base64 = text(content?.data);
  if (!base64) return null;
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > MAX_OUTPUT_BYTES) {
    throw new Error("GEMINI_INLINE_OUTPUT_SIZE_INVALID");
  }
  return persistVideo(
    bytes,
    text(content?.mime_type) || "video/mp4",
    fileId,
    input,
  );
}

async function interactionFallback(input, fileId, key) {
  const id = interactionId(input);
  if (!id) return null;

  const { response, result } = await googleJson(
    `/interactions/${encodeURIComponent(id)}`,
    key,
  );

  if (!response.ok) {
    const message = text(result?.error?.message || result?.message || result?.error);
    throw new Error(`GEMINI_INTERACTION_RECOVERY_ERROR:${message || response.status}`);
  }

  const status = text(result.status).toLowerCase();
  if (["failed", "cancelled", "incomplete"].includes(status)) {
    return {
      success: false,
      failed: true,
      pending: false,
      provider: "gemini",
      model: model(input),
      provider_job_id: fileId,
      provider_status: status,
      error: text(result?.error?.message || result?.error) || `Gemini interaction ${status}`,
    };
  }

  const content = videoContent(result);
  const stored = content?.data
    ? await persistInline(content, fileId, input)
    : null;

  if (stored) {
    return {
      success: true,
      failed: false,
      pending: false,
      provider: "gemini",
      model: model(input),
      provider_job_id: fileId,
      provider_status: "completed",
      output: {
        provider_job_id: fileId,
        status: "completed",
        provider_status: "completed",
        interaction_id: id,
        recovered_from_interaction: true,
        ...stored,
      },
    };
  }

  return {
    success: true,
    failed: false,
    pending: true,
    provider: "gemini",
    model: model(input),
    provider_job_id: fileId,
    provider_status: status || "processing",
  };
}

GeminiProvider.getStatus = async function patchedGeminiFounderStatus(input = {}) {
  const key = apiKey(input);
  const fileId = text(input.job_id || input.provider_job_id || input.provider_file_id);
  if (!fileId) throw new Error("GEMINI_FILE_ID_INVALID");

  const { response, result } = await googleJson(
    `/files/${encodeURIComponent(fileId)}`,
    key,
  );

  if (!response.ok) {
    const recovered = await interactionFallback(input, fileId, key);
    if (recovered) return recovered;
    const message = text(result?.error?.message || result?.message || result?.error);
    throw new Error(`GEMINI_API_ERROR:${message || response.status}`);
  }

  const state = text(result.state).toUpperCase();
  if (state === "FAILED") {
    return {
      success: false,
      failed: true,
      pending: false,
      provider: "gemini",
      model: model(input),
      provider_job_id: fileId,
      provider_status: "failed",
      error: text(result?.error?.message || result?.error) || "Gemini generation failed",
    };
  }

  if (state !== "ACTIVE") {
    return {
      success: true,
      failed: false,
      pending: true,
      provider: "gemini",
      model: model(input),
      provider_job_id: fileId,
      provider_status: state.toLowerCase() || "processing",
    };
  }

  const downloaded = await downloadFile(fileId, key);
  const stored = await persistVideo(
    downloaded.bytes,
    downloaded.mime_type,
    fileId,
    input,
  );

  return {
    success: true,
    failed: false,
    pending: false,
    provider: "gemini",
    model: model(input),
    provider_job_id: fileId,
    provider_status: "completed",
    output: {
      provider_job_id: fileId,
      status: "completed",
      provider_status: "completed",
      ...stored,
    },
  };
};

export const GEMINI_FOUNDER_STATUS_RECOVERY_PATCH = Object.freeze({
  contract: "GEMINI_FOUNDER_STATUS_RECOVERY_PATCH_V1",
  files_api_key_query_transport: true,
  interaction_inline_fallback: true,
});
