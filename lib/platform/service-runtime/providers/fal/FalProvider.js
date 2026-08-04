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
      item !== undefined && item !== null && item !== "",
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

async function requestJson({ url, apiKey, method = "GET", body = null }) {
  const response = await fetch(url, {
    method,
    headers: compactObject({
      Authorization: `Key ${apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    }),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      result?.detail ||
      result?.error?.message ||
      result?.message ||
      `FAL request failed with status ${response.status}`,
    );
  }
  return result;
}

function outputUrl(result = {}) {
  return text(
    result?.audio?.url ||
    result?.data?.audio?.url ||
    result?.output?.audio?.url ||
    result?.url,
  ) || null;
}

function normalizedStatus(result = {}) {
  return text(result.status || result.state || result.phase).toUpperCase();
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
      instrumental: input.instrumental ?? providerParameters.instrumental ?? true,
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
        audio_url: audioUrl,
        result: audioUrl,
        duration_seconds: duration,
        instrumental: body.instrumental,
        prompt_contract: {
          serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
          serialized_at_execution: true,
          submitted_character_count: prompt.length,
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

    const status = await requestJson({
      url: statusUrl(decoded.model, decoded.requestId),
      apiKey,
    });
    const state = normalizedStatus(status);
    const failed = ["FAILED", "ERROR", "CANCELLED", "CANCELED"].includes(state);
    const completed = ["COMPLETED", "SUCCEEDED", "SUCCESS", "DONE"].includes(state);

    if (failed) {
      return {
        success: false,
        failed: true,
        pending: false,
        provider: "fal",
        model: decoded.model,
        provider_job_id: encodeJobId(decoded.model, decoded.requestId),
        provider_status: state.toLowerCase(),
        error: status?.error?.message || status?.message || "FAL music generation failed",
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
        raw: status,
      };
    }

    const result = await requestJson({
      url: requestUrl(decoded.model, decoded.requestId),
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
      output: {
        audio_url: audioUrl,
        result: audioUrl,
        raw: result,
      },
      raw: result,
    };
  },
};
