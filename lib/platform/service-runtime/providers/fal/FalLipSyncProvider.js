import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

const DEFAULT_MODEL = "fal-ai/sync-lipsync/v3";
const REACT_MODEL = "fal-ai/sync-lipsync/react-1";
const ALLOWED_MODELS = new Set([
  "fal-ai/sync-lipsync/v3",
  "fal-ai/sync-lipsync/v2/pro",
  "fal-ai/sync-lipsync/v2",
  REACT_MODEL,
]);
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

function resolveModel(value = null) {
  const model = text(value) || DEFAULT_MODEL;
  if (!ALLOWED_MODELS.has(model)) {
    throw new Error(`FAL_LIPSYNC_MODEL_NOT_APPROVED:${model}`);
  }
  return model;
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

async function rawJson({ url, apiKey, method = "GET", body = null }) {
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
    try { result = JSON.parse(raw); } catch { result = {}; }
  }
  return { response, result, raw };
}

function requestError({ response, result, raw }) {
  const detail =
    result?.detail ||
    result?.error?.message ||
    result?.error ||
    result?.message ||
    raw.slice(0, 1500) ||
    `status ${response.status}`;
  return new Error(`FAL_LIPSYNC_REQUEST_FAILED:${detail}`);
}

async function requestJson(options) {
  const attempted = await rawJson(options);
  if (!attempted.response.ok) throw requestError(attempted);
  return attempted.result;
}

function queueRouteCandidates(requestId, model) {
  const encoded = encodeURIComponent(requestId);
  const family = model.includes("/v3")
    ? "fal-ai/sync-lipsync/v3"
    : model.includes("/v2")
      ? "fal-ai/sync-lipsync/v2"
      : model.includes("/react-1")
        ? REACT_MODEL
        : "fal-ai/sync-lipsync";
  return [...new Set([
    `${QUEUE_BASE}/${model}/requests/${encoded}`,
    `${QUEUE_BASE}/${family}/requests/${encoded}`,
    `${QUEUE_BASE}/fal-ai/sync-lipsync/requests/${encoded}`,
  ])];
}

async function requestQueueWithFallback({ requestId, apiKey, model, suffix = "" }) {
  let lastFailure = null;
  for (const base of queueRouteCandidates(requestId, model)) {
    const attempted = await rawJson({ url: `${base}${suffix}`, apiKey });
    if (attempted.response.ok) {
      return { result: attempted.result, base_url: base, resolved_url: `${base}${suffix}` };
    }
    lastFailure = attempted;
    if (![404, 405].includes(attempted.response.status)) throw requestError(attempted);
  }
  throw requestError(lastFailure);
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
  model: DEFAULT_MODEL,

  async submit({
    video_url,
    audio_url,
    sync_mode = "cut_off",
    model = DEFAULT_MODEL,
    credential_id = null,
    active_speaker_detection = true,
    model_mode = "face",
    prompt = "neutral",
    temperature = 0.5,
  } = {}) {
    if (!text(video_url)) throw new Error("FAL_LIPSYNC_VIDEO_URL_REQUIRED");
    if (!text(audio_url)) throw new Error("FAL_LIPSYNC_AUDIO_URL_REQUIRED");
    const selectedModel = resolveModel(model);
    const { apiKey } = await resolveCredential(credential_id);

    const options = selectedModel === "fal-ai/sync-lipsync/v3"
      ? {
          sync_mode,
          active_speaker_detection: active_speaker_detection
            ? { auto_detect: true, v3: true }
            : undefined,
        }
      : selectedModel === REACT_MODEL
        ? {
            sync_mode,
            model_mode,
            prompt,
            temperature: Math.max(0, Math.min(1, Number(temperature) || 0.5)),
            active_speaker_detection: active_speaker_detection
              ? { auto_detect: true, v3: true }
              : undefined,
          }
        : undefined;

    const result = await requestJson({
      url: `${QUEUE_BASE}/${selectedModel}`,
      apiKey,
      method: "POST",
      body: compactObject({
        video_url,
        audio_url,
        sync_mode,
        ...(options ? { options } : {}),
      }),
    });
    const requestId = text(result.request_id || result.requestId);
    const output = videoUrl(result);
    if (!requestId && !output) throw new Error("FAL_LIPSYNC_OUTPUT_OR_REQUEST_ID_REQUIRED");
    return {
      success: true,
      model: selectedModel,
      request_id: requestId || null,
      pending: Boolean(requestId && !output),
      output_url: output,
      status_url: text(result.status_url) || (requestId ? `${QUEUE_BASE}/${selectedModel}/requests/${encodeURIComponent(requestId)}/status` : null),
      response_url: text(result.response_url) || (requestId ? `${QUEUE_BASE}/${selectedModel}/requests/${encodeURIComponent(requestId)}` : null),
      raw: result,
    };
  },

  async poll({ request_id, model = DEFAULT_MODEL, credential_id = null } = {}) {
    const requestId = text(request_id);
    if (!requestId) throw new Error("FAL_LIPSYNC_REQUEST_ID_REQUIRED");
    const selectedModel = resolveModel(model);
    const { apiKey } = await resolveCredential(credential_id);
    const statusAttempt = await requestQueueWithFallback({
      requestId,
      apiKey,
      model: selectedModel,
      suffix: "/status",
    });
    const status = statusAttempt.result;
    const state = normalizedStatus(status);
    const failed = ["FAILED", "ERROR", "CANCELLED", "CANCELED"].includes(state);
    if (failed || (state === "COMPLETED" && status?.error)) {
      throw new Error(`FAL_LIPSYNC_FAILED:${text(status?.error?.message || status?.error || status?.message || state)}`);
    }
    const completed = ["COMPLETED", "SUCCESS", "SUCCEEDED", "DONE"].includes(state);
    if (!completed) {
      return {
        success: true,
        pending: true,
        model: selectedModel,
        request_id: requestId,
        status: state || "IN_PROGRESS",
        resolved_status_url: statusAttempt.resolved_url,
        raw: status,
      };
    }
    const sameFamily = await rawJson({ url: statusAttempt.base_url, apiKey });
    let resultAttempt = null;
    if (sameFamily.response.ok) {
      resultAttempt = { result: sameFamily.result, resolved_url: statusAttempt.base_url };
    } else if ([404, 405].includes(sameFamily.response.status)) {
      resultAttempt = await requestQueueWithFallback({
        requestId,
        apiKey,
        model: selectedModel,
      });
    } else {
      throw requestError(sameFamily);
    }
    const output = videoUrl(resultAttempt.result);
    if (!output) throw new Error("FAL_LIPSYNC_COMPLETED_WITHOUT_VIDEO");
    return {
      success: true,
      pending: false,
      model: selectedModel,
      request_id: requestId,
      status: state || "COMPLETED",
      output_url: output,
      resolved_result_url: resultAttempt.resolved_url,
      raw: resultAttempt.result,
    };
  },
};
