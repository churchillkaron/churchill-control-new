import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

const DEFAULT_MODEL = "fal-ai/ace-step/prompt-to-audio";
const QUEUE_BASE = "https://queue.fal.run";
const JOB_SEPARATOR = "::";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

function normalizedModel(value) {
  const model = text(value) || DEFAULT_MODEL;
  if (!/^fal-ai\/[a-z0-9._/-]+$/i.test(model)) {
    throw new Error(`FAL_MODEL_INVALID:${model}`);
  }
  return model;
}

function queueUrl(model) {
  return `${QUEUE_BASE}/${model}`;
}

function requestUrl(model, requestId) {
  return `${queueUrl(model)}/requests/${encodeURIComponent(requestId)}`;
}

function statusUrl(model, requestId) {
  return `${requestUrl(model, requestId)}/status`;
}

function encodeJobId(model, requestId) {
  return `${model}${JOB_SEPARATOR}${requestId}`;
}

function decodeJobId(value, fallbackModel = DEFAULT_MODEL) {
  const raw = text(value);
  if (!raw) throw new Error("FAL_REQUEST_ID_REQUIRED");
  const index = raw.lastIndexOf(JOB_SEPARATOR);
  if (index < 0) {
    return {
      model: normalizedModel(fallbackModel),
      requestId: raw,
    };
  }
  return {
    model: normalizedModel(raw.slice(0, index)),
    requestId: text(raw.slice(index + JOB_SEPARATOR.length)),
  };
}

function trustedFalUrl(value, label) {
  const source = text(value);
  if (!source) return null;
  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    throw new Error(`FAL_${label}_URL_INVALID`);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    !(
      hostname === "queue.fal.run" ||
      hostname.endsWith(".fal.run") ||
      hostname === "fal.ai" ||
      hostname.endsWith(".fal.ai")
    )
  ) {
    throw new Error(`FAL_${label}_URL_UNTRUSTED`);
  }
  return parsed.toString();
}

function queueReferences(result = {}, model, requestId) {
  const raw = object(result);
  return {
    status_url: trustedFalUrl(
      raw.status_url || raw.statusUrl || statusUrl(model, requestId),
      "STATUS",
    ),
    response_url: trustedFalUrl(
      raw.response_url || raw.responseUrl || requestUrl(model, requestId),
      "RESPONSE",
    ),
    cancel_url: trustedFalUrl(
      raw.cancel_url || raw.cancelUrl,
      "CANCEL",
    ),
  };
}

function suppliedQueueReferences(input = {}, decoded) {
  const queue = object(input.queue);
  const providerStatus = object(input.provider_status);
  const raw = object(input.raw);
  const references = {
    status_url:
      input.status_url ||
      input.statusUrl ||
      queue.status_url ||
      queue.statusUrl ||
      providerStatus.status_url ||
      providerStatus.statusUrl ||
      raw.status_url ||
      raw.statusUrl,
    response_url:
      input.response_url ||
      input.responseUrl ||
      queue.response_url ||
      queue.responseUrl ||
      providerStatus.response_url ||
      providerStatus.responseUrl ||
      raw.response_url ||
      raw.responseUrl,
    cancel_url:
      input.cancel_url ||
      input.cancelUrl ||
      queue.cancel_url ||
      queue.cancelUrl ||
      providerStatus.cancel_url ||
      providerStatus.cancelUrl ||
      raw.cancel_url ||
      raw.cancelUrl,
  };
  return {
    status_url: trustedFalUrl(
      references.status_url || statusUrl(decoded.model, decoded.requestId),
      "STATUS",
    ),
    response_url: trustedFalUrl(
      references.response_url || requestUrl(decoded.model, decoded.requestId),
      "RESPONSE",
    ),
    cancel_url: trustedFalUrl(references.cancel_url, "CANCEL"),
  };
}

function structuredPrompt(input = {}) {
  const generation = object(input.generation);
  const direct = text(
    input.prompt ||
    input.promptText ||
    input.provider_prompt ||
    generation.provider_prompt,
  );
  if (direct) return direct;

  const intent = object(input.intent);
  const requirements = object(input.requirements);
  const plan = object(input.creative_plan || input.plan);
  const concept = object(plan.concept);
  const story = object(plan.story);
  const music = object(plan.music_world);
  return [
    text(intent.purpose || input.purpose),
    text(intent.emotion || input.emotion),
    text(concept.creative_thesis || concept.message),
    text(story.emotional_arc || concept.narrative),
    text(music.tempo_character),
    text(music.groove),
    text(requirements.music_direction),
    "Original instrumental editorial soundtrack for a premium commercial film.",
    "Support authentic ambience, action-synchronised sound effects and editorial transitions without masking them.",
    "No vocals, spoken words, recognizable copyrighted melody, protected artist imitation, trailer braams, generic corporate uplift, truncation or looping.",
  ].filter(Boolean).join(" ");
}

function durationSeconds(input = {}) {
  const generation = object(input.generation);
  const output = object(
    input.output_spec || input.outputSpec || generation.output_spec,
  );
  const duration = finite(
    input.duration_seconds ??
    input.duration ??
    output.duration_seconds ??
    generation.estimated_seconds,
    60,
  );
  if (!duration || duration <= 0 || duration > 240) {
    throw new Error(`FAL_MUSIC_DURATION_INVALID:${duration}`);
  }
  return duration;
}

function falErrorMessage(result = {}, status, rawText = "") {
  const detail = Array.isArray(result.detail)
    ? result.detail.map((item) => {
        const location = list(item?.loc).map(text).filter(Boolean).join(".");
        const message = text(item?.msg || item?.message || item?.type);
        return [location, message].filter(Boolean).join(": ");
      }).filter(Boolean).join("; ")
    : text(result.detail);
  return [
    `FAL request failed with status ${status}`,
    detail,
    text(result?.error?.message || result?.error || result?.message),
    text(rawText).slice(0, 1000),
  ].filter(Boolean).join(" | ");
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
    throw new Error(falErrorMessage(result, response.status, raw));
  }
  return result;
}

function outputUrl(result = {}) {
  return text(
    result?.audio?.url ||
    result?.data?.audio?.url ||
    result?.output?.audio?.url ||
    result?.response?.audio?.url ||
    result?.response?.data?.audio?.url ||
    result?.payload?.audio?.url ||
    result?.url,
  ) || null;
}

function normalizedStatus(result = {}) {
  return text(result.status || result.state || result.phase).toUpperCase();
}

function failureDetail(result = {}) {
  return text(
    result?.error?.message ||
    result?.error ||
    result?.message ||
    result?.detail,
  ) || "FAL music generation failed";
}

export const FalProvider = {
  id: "fal",

  async execute(input = {}) {
    if (text(input.capability) !== "ai.music.generate") {
      throw new Error(`FAL_CAPABILITY_NOT_SUPPORTED:${text(input.capability)}`);
    }

    const { apiKey } = await resolveCredential(input.credential_id);
    const model = normalizedModel(input.model || input.generation?.model);
    const prompt = structuredPrompt(input);
    if (!prompt) throw new Error("FAL_MUSIC_DIRECTION_REQUIRED");

    const duration = durationSeconds(input);
    const generation = object(input.generation);
    const providerParameters = {
      ...object(generation.provider_parameters),
      ...object(input.provider_parameters),
      ...object(input.provider_options || input.providerOptions),
    };
    const body = compactObject({
      prompt,
      instrumental:
        input.instrumental ?? providerParameters.instrumental ?? true,
      duration,
      number_of_steps:
        input.number_of_steps ?? providerParameters.number_of_steps,
      seed: input.seed ?? providerParameters.seed,
      scheduler: input.scheduler ?? providerParameters.scheduler,
      guidance_type:
        input.guidance_type ?? providerParameters.guidance_type,
      granularity_scale:
        input.granularity_scale ?? providerParameters.granularity_scale,
      guidance_interval:
        input.guidance_interval ?? providerParameters.guidance_interval,
      guidance_interval_decay:
        input.guidance_interval_decay ??
        providerParameters.guidance_interval_decay,
      guidance_scale:
        input.guidance_scale ?? providerParameters.guidance_scale,
      minimum_guidance_scale:
        input.minimum_guidance_scale ??
        providerParameters.minimum_guidance_scale,
      tag_guidance_scale:
        input.tag_guidance_scale ?? providerParameters.tag_guidance_scale,
      lyric_guidance_scale:
        input.lyric_guidance_scale ??
        providerParameters.lyric_guidance_scale,
    });

    const result = await requestJson({
      url: queueUrl(model),
      apiKey,
      method: "POST",
      body,
    });
    const requestId = text(result.request_id || result.requestId);
    const audioUrl = outputUrl(result);
    if (!requestId && !audioUrl) {
      throw new Error("FAL_OUTPUT_OR_REQUEST_ID_REQUIRED");
    }
    const queue = requestId
      ? queueReferences(result, model, requestId)
      : { status_url: null, response_url: null, cancel_url: null };

    return {
      success: true,
      provider: "fal",
      model,
      output: {
        provider_job_id: requestId
          ? encodeJobId(model, requestId)
          : null,
        provider_request_id: requestId || null,
        status: requestId && !audioUrl ? "queued" : "completed",
        status_url: queue.status_url,
        response_url: queue.response_url,
        cancel_url: queue.cancel_url,
        audio_url: audioUrl,
        result: audioUrl,
        duration_seconds: duration,
        instrumental: body.instrumental,
        prompt_contract: {
          serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
          serialized_at_execution: true,
          submitted_character_count: prompt.length,
        },
        queue_contract: {
          contract: "FAL_AUTHORITATIVE_QUEUE_URLS_V1",
          status_url_preserved: Boolean(queue.status_url),
          response_url_preserved: Boolean(queue.response_url),
          reconstructed: false,
        },
        raw: result,
      },
    };
  },

  async getStatus(input = {}) {
    const { apiKey } = await resolveCredential(input.credential_id);
    const decoded = decodeJobId(
      input.job_id || input.jobId || input.provider_job_id,
      input.model,
    );
    const queue = suppliedQueueReferences(input, decoded);

    const status = await requestJson({
      url: queue.status_url,
      apiKey,
    });
    const state = normalizedStatus(status);
    const failed = [
      "FAILED",
      "ERROR",
      "CANCELLED",
      "CANCELED",
    ].includes(state);
    const completed = [
      "COMPLETED",
      "SUCCEEDED",
      "SUCCESS",
      "DONE",
    ].includes(state);

    if (failed) {
      return {
        success: false,
        failed: true,
        pending: false,
        provider: "fal",
        model: decoded.model,
        provider_job_id: encodeJobId(decoded.model, decoded.requestId),
        provider_status: state.toLowerCase(),
        error: failureDetail(status),
        queue,
        raw: status,
      };
    }

    if (!completed) {
      return {
        success: true,
        failed: false,
        pending: true,
        provider: "fal",
        model: decoded.model,
        provider_job_id: encodeJobId(decoded.model, decoded.requestId),
        provider_status: state.toLowerCase() || "processing",
        queue,
        raw: status,
      };
    }

    const result = await requestJson({
      url: queue.response_url,
      apiKey,
    });
    const audioUrl = outputUrl(result);
    if (!audioUrl) throw new Error("FAL_COMPLETED_AUDIO_URL_REQUIRED");

    return {
      success: true,
      failed: false,
      pending: false,
      provider: "fal",
      model: decoded.model,
      provider_job_id: encodeJobId(decoded.model, decoded.requestId),
      provider_status: "completed",
      queue,
      output: {
        audio_url: audioUrl,
        result: audioUrl,
        raw: result,
      },
      raw: result,
    };
  },
};
