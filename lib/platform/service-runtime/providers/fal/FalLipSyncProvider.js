import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

const MODEL = "fal-ai/sync-lipsync/v2/pro";
const QUEUE_BASE = "https://queue.fal.run";

function text(value) {
  return String(value ?? "").trim();
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) =>
      item !== undefined && item !== null && item !== ""
    ),
  );
}

async function resolveCredential(credentialId = null) {
  const credential = credentialId
    ? await CredentialRuntime.resolve(credentialId)
    : null;
  const apiKey =
    credential?.secret_reference ||
    credential?.api_key ||
    process.env.FAL_KEY ||
    process.env.FAL_API_KEY ||
    null;
  if (!apiKey) throw new Error("FAL_CREDENTIAL_REQUIRED");
  return { credential, apiKey };
}

async function requestJson({ url, apiKey, method = "GET", body = null }) {
  const response = await fetch(url, {
    method,
    redirect: "follow",
    headers: compactObject({
      Authorization: `Key ${apiKey}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    }),
    ...(body ? { body: JSON.stringify(body) } : {}),
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

  if (!response.ok) {
    const detail =
      result?.detail ||
      result?.error?.message ||
      result?.error ||
      result?.message ||
      raw.slice(0, 1500) ||
      `status ${response.status}`;
    throw new Error(`FAL_LIPSYNC_REQUEST_FAILED:${detail}`);
  }

  return result;
}

function videoUrl(result = {}) {
  return text(
    result?.video?.url ||
    result?.data?.video?.url ||
    result?.output?.video?.url ||
    result?.response?.video?.url ||
    result?.response?.data?.video?.url ||
    result?.payload?.video?.url ||
    result?.url,
  ) || null;
}

function normalizedStatus(result = {}) {
  return text(result.status || result.state || result.phase).toUpperCase();
}

export const FalLipSyncProvider = {
  id: "fal_lipsync",
  model: MODEL,

  async submit({
    video_url,
    audio_url,
    sync_mode = "cut_off",
    credential_id = null,
  } = {}) {
    if (!text(video_url)) throw new Error("FAL_LIPSYNC_VIDEO_URL_REQUIRED");
    if (!text(audio_url)) throw new Error("FAL_LIPSYNC_AUDIO_URL_REQUIRED");

    const { apiKey } = await resolveCredential(credential_id);
    const result = await requestJson({
      url: `${QUEUE_BASE}/${MODEL}`,
      apiKey,
      method: "POST",
      body: {
        video_url,
        audio_url,
        sync_mode,
      },
    });

    const requestId = text(result.request_id || result.requestId);
    const output = videoUrl(result);
    if (!requestId && !output) {
      throw new Error("FAL_LIPSYNC_OUTPUT_OR_REQUEST_ID_REQUIRED");
    }

    return {
      success: true,
      model: MODEL,
      request_id: requestId || null,
      pending: Boolean(requestId && !output),
      output_url: output,
      status_url: requestId
        ? `${QUEUE_BASE}/${MODEL}/requests/${encodeURIComponent(requestId)}/status`
        : null,
      response_url: requestId
        ? `${QUEUE_BASE}/${MODEL}/requests/${encodeURIComponent(requestId)}`
        : null,
      raw: result,
    };
  },

  async poll({ request_id, credential_id = null } = {}) {
    const requestId = text(request_id);
    if (!requestId) throw new Error("FAL_LIPSYNC_REQUEST_ID_REQUIRED");

    const { apiKey } = await resolveCredential(credential_id);
    const status = await requestJson({
      url: `${QUEUE_BASE}/${MODEL}/requests/${encodeURIComponent(requestId)}/status`,
      apiKey,
    });

    const state = normalizedStatus(status);
    const failed = ["FAILED", "ERROR", "CANCELLED", "CANCELED"].includes(state);
    if (failed) {
      throw new Error(
        `FAL_LIPSYNC_FAILED:${text(status?.error?.message || status?.error || status?.message || state)}`,
      );
    }

    const completed = ["COMPLETED", "SUCCESS", "SUCCEEDED", "DONE"].includes(state);
    if (!completed) {
      return {
        success: true,
        pending: true,
        request_id: requestId,
        status: state || "IN_PROGRESS",
        raw: status,
      };
    }

    const result = await requestJson({
      url: `${QUEUE_BASE}/${MODEL}/requests/${encodeURIComponent(requestId)}`,
      apiKey,
    });
    const output = videoUrl(result);
    if (!output) throw new Error("FAL_LIPSYNC_COMPLETED_WITHOUT_VIDEO");

    return {
      success: true,
      pending: false,
      request_id: requestId,
      status: state || "COMPLETED",
      output_url: output,
      raw: result,
    };
  },
};
