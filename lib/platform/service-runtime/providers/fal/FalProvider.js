function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) =>
      item !== undefined && item !== null && item !== "",
    ),
  );
}

function providerConfiguration(input = {}) {
  const payload = object(input.payload);
  return object(
    input.provider_configuration ||
    input.providerConfiguration ||
    input.generation?.provider_configuration ||
    input.generation?.providerConfiguration ||
    input.pricing_resolution?.provider_configuration ||
    input.generation?.pricing_resolution?.provider_configuration ||
    payload.provider_configuration ||
    payload.providerConfiguration ||
    payload.generation?.provider_configuration ||
    payload.generation?.providerConfiguration,
  );
}

function resolveApiKey(input = {}) {
  const credential = object(input.credential);
  const apiKey = text(
    input.api_key ||
    input.apiKey ||
    input.access_token ||
    input.token ||
    credential.api_key ||
    credential.apiKey ||
    credential.access_token ||
    credential.token ||
    credential.secret_reference ||
    process.env.FAL_KEY ||
    process.env.FAL_API_KEY,
  );
  if (!apiKey) throw new Error("FAL_CREDENTIAL_REQUIRED");
  return apiKey;
}

function resolveModel(input = {}) {
  const generation = object(input.generation);
  const payload = object(input.payload);
  const payloadGeneration = object(payload.generation);
  const configuration = providerConfiguration(input);
  return text(
    input.model ||
    generation.model ||
    payload.model ||
    payloadGeneration.model ||
    configuration.model ||
    configuration.model_id ||
    configuration.modelId ||
    configuration.fal_model ||
    configuration.falModel,
  );
}

function resolveSubmitEndpoint(input = {}, model = "") {
  const generation = object(input.generation);
  const payload = object(input.payload);
  const payloadGeneration = object(payload.generation);
  const configuration = providerConfiguration(input);
  const explicit = text(
    input.endpoint ||
    input.submit_endpoint ||
    input.submitEndpoint ||
    input.api_url ||
    input.apiUrl ||
    generation.endpoint ||
    payload.endpoint ||
    payload.submit_endpoint ||
    payload.submitEndpoint ||
    payload.api_url ||
    payload.apiUrl ||
    payloadGeneration.endpoint ||
    configuration.endpoint ||
    configuration.submit_endpoint ||
    configuration.submitEndpoint ||
    process.env.FAL_API_URL,
  );
  if (explicit) return explicit.replace(/\/$/, "");
  if (!model) throw new Error("FAL_MODEL_OR_ENDPOINT_REQUIRED");
  return `https://queue.fal.run/${model.replace(/^\/+|\/+$/g, "")}`;
}

function requestBase(endpoint = "") {
  return endpoint
    .replace(/\/requests\/[^/]+(?:\/status)?$/i, "")
    .replace(/\/$/, "");
}

function resolveStatusEndpoint(input = {}, model = "", jobId = "") {
  const payload = object(input.payload);
  const configuration = providerConfiguration(input);
  const explicit = text(
    input.status_url ||
    input.statusUrl ||
    input.status_endpoint ||
    input.statusEndpoint ||
    payload.status_url ||
    payload.statusUrl ||
    payload.status_endpoint ||
    payload.statusEndpoint ||
    configuration.status_url ||
    configuration.statusUrl ||
    configuration.status_endpoint ||
    configuration.statusEndpoint ||
    process.env.FAL_STATUS_API_URL,
  );
  if (explicit) {
    return explicit
      .replace("{request_id}", encodeURIComponent(jobId))
      .replace("{job_id}", encodeURIComponent(jobId));
  }
  const submitEndpoint = resolveSubmitEndpoint(input, model);
  return `${requestBase(submitEndpoint)}/requests/${encodeURIComponent(jobId)}/status`;
}

function resolveResultEndpoint(input = {}, model = "", jobId = "") {
  const payload = object(input.payload);
  const configuration = providerConfiguration(input);
  const explicit = text(
    input.response_url ||
    input.responseUrl ||
    input.result_url ||
    input.resultUrl ||
    input.result_endpoint ||
    input.resultEndpoint ||
    payload.response_url ||
    payload.responseUrl ||
    payload.result_url ||
    payload.resultUrl ||
    payload.result_endpoint ||
    payload.resultEndpoint ||
    configuration.response_url ||
    configuration.responseUrl ||
    configuration.result_endpoint ||
    configuration.resultEndpoint ||
    process.env.FAL_RESULT_API_URL,
  );
  if (explicit) {
    return explicit
      .replace("{request_id}", encodeURIComponent(jobId))
      .replace("{job_id}", encodeURIComponent(jobId));
  }
  const submitEndpoint = resolveSubmitEndpoint(input, model);
  return `${requestBase(submitEndpoint)}/requests/${encodeURIComponent(jobId)}`;
}

function internalParameter(key = "") {
  return /^(?:asset_scope|task_materialization|pricing_resolution|performance_contract|identity_profile|identity_reference|reference_asset|perceptual_review|source_generation|production_|creative_|human_approval|review_|contract_hash)/i.test(
    key,
  );
}

function providerParameters(input = {}) {
  const generation = object(input.generation);
  const merged = {
    ...object(generation.provider_parameters),
    ...object(input.provider_parameters),
    ...object(input.provider_options || input.providerOptions),
  };
  return Object.fromEntries(
    Object.entries(merged).filter(([key, value]) =>
      !internalParameter(key) &&
      value !== undefined && value !== null && value !== "",
    ),
  );
}

function promptFor(input = {}) {
  const generation = object(input.generation);
  return text(
    input.prompt ||
    input.provider_prompt ||
    input.instructions?.prompt ||
    generation.provider_prompt,
  );
}

function requestBody(input = {}) {
  const generation = object(input.generation);
  const output = object(
    input.output_spec ||
    input.outputSpec ||
    generation.output_spec,
  );
  const prompt = promptFor(input);
  const parameters = providerParameters(input);
  const duration = finite(
    input.duration_seconds ??
    input.duration ??
    parameters.duration_seconds ??
    output.duration_seconds,
  );

  return compactObject({
    prompt: prompt || undefined,
    duration_seconds: duration ?? undefined,
    instrumental:
      input.instrumental ??
      parameters.instrumental ??
      output.instrumental,
    audio_format:
      input.audio_format ||
      parameters.audio_format ||
      output.format,
    ...parameters,
  });
}

function responseMessage(result = {}, fallback = "FAL request failed") {
  return text(
    result?.detail?.[0]?.msg ||
    result?.error?.message ||
    result?.error ||
    result?.message ||
    fallback,
  );
}

function requestId(result = {}) {
  return text(
    result.request_id ||
    result.requestId ||
    result.id ||
    result.job_id ||
    result.jobId,
  );
}

function outputUrls(result = {}) {
  const candidates = [
    result.audio?.url,
    result.audio_url,
    result.audioUrl,
    result.file?.url,
    result.video?.url,
    result.video_url,
    result.image?.url,
    result.images?.[0]?.url,
    result.output?.url,
    result.output?.audio?.url,
    result.output?.video?.url,
    result.output?.images?.[0]?.url,
    result.url,
  ].map(text).filter(Boolean);
  return [...new Set(candidates)];
}

function completedStatus(value) {
  return ["COMPLETED", "SUCCEEDED", "SUCCESS", "DONE"].includes(
    text(value).toUpperCase(),
  );
}

async function jsonRequest(url, { apiKey, method = "GET", body = null, headers = {} } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Key ${apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      responseMessage(result, `FAL request failed with status ${response.status}`),
    );
  }
  return result;
}

export const FalProvider = {
  id: "fal",

  async assertReady(input = {}) {
    resolveApiKey(input);
    const model = resolveModel(input);
    const endpoint = resolveSubmitEndpoint(input, model);
    if (!model && !endpoint) throw new Error("FAL_MODEL_OR_ENDPOINT_REQUIRED");
    return {
      ready: true,
      provider: "fal",
      model: model || null,
      endpoint,
    };
  },

  async execute(input = {}) {
    const apiKey = resolveApiKey(input);
    const model = resolveModel(input);
    const endpoint = resolveSubmitEndpoint(input, model);
    const body = requestBody(input);
    if (!Object.keys(body).length) throw new Error("FAL_INPUT_REQUIRED");

    const result = await jsonRequest(endpoint, {
      apiKey,
      method: input.method || "POST",
      body,
      headers: object(input.headers),
    });
    const jobId = requestId(result);
    const urls = outputUrls(result);
    if (!jobId && !urls.length) throw new Error("FAL_OUTPUT_OR_JOB_REQUIRED");

    const statusUrl = text(result.status_url || result.statusUrl) ||
      (jobId ? resolveStatusEndpoint({ endpoint }, model, jobId) : null);
    const responseUrl = text(result.response_url || result.responseUrl) ||
      (jobId ? resolveResultEndpoint({ endpoint }, model, jobId) : null);
    const cancelUrl = text(result.cancel_url || result.cancelUrl) || null;
    const providerStatusInput = compactObject({
      model: model || undefined,
      endpoint,
      submit_endpoint: endpoint,
      status_url: statusUrl || undefined,
      response_url: responseUrl || undefined,
      cancel_url: cancelUrl || undefined,
    });

    return {
      success: true,
      provider: "fal",
      model: model || null,
      endpoint,
      provider_status_input: providerStatusInput,
      output: {
        provider_job_id: jobId || null,
        status: jobId && !urls.length ? "processing" : "completed",
        urls,
        audio_url: urls.find((url) => /\.(?:mp3|wav|m4a|aac|flac|ogg)(?:\?|$)/i.test(url)) || null,
        endpoint,
        submit_endpoint: endpoint,
        status_url: statusUrl,
        response_url: responseUrl,
        cancel_url: cancelUrl,
        provider_status_input: providerStatusInput,
        raw: result,
      },
    };
  },

  async getStatus(input = {}) {
    const jobId = text(
      input.job_id || input.jobId || input.provider_job_id,
    );
    if (!jobId) throw new Error("FAL_JOB_ID_REQUIRED");

    const apiKey = resolveApiKey(input);
    const model = resolveModel(input);
    const statusEndpoint = resolveStatusEndpoint(input, model, jobId);
    const status = await jsonRequest(statusEndpoint, {
      apiKey,
      method: input.method || "GET",
      headers: object(input.headers),
    });

    if (!completedStatus(status.status)) return status;

    const resultEndpoint = resolveResultEndpoint(input, model, jobId);
    const result = await jsonRequest(resultEndpoint, {
      apiKey,
      method: "GET",
      headers: object(input.headers),
    });
    return {
      ...status,
      status: "COMPLETED",
      result,
      urls: outputUrls(result),
    };
  },
};
