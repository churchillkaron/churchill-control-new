import {
  OpenAIProvider as BaseOpenAIProvider,
} from "./OpenAIProvider";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function first(...values) {
  return values.find((value) =>
    value !== undefined && value !== null && value !== "",
  );
}

function rawOptions(input = {}) {
  return {
    ...object(input.provider_options || input.providerOptions),
    ...object(input.provider_parameters || input.providerParameters),
  };
}

function pick(source = {}, keys = []) {
  return Object.fromEntries(
    keys
      .filter((key) => source[key] !== undefined && source[key] !== null)
      .map((key) => [key, source[key]]),
  );
}

function referenceImages(input = {}, options = {}) {
  return [
    ...list(input.reference_images),
    ...list(input.referenceImages),
    ...list(options.reference_images),
    ...list(options.referenceImages),
    ...list(input.generation?.provider_parameters?.reference_images),
    ...list(input.generation?.providerParameters?.referenceImages),
  ];
}

function supportsInputFidelity(model = "") {
  const normalized = String(model || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("mini")) return false;
  return normalized.startsWith("gpt-image-1") ||
    normalized.startsWith("gpt-image-1.5") ||
    normalized.startsWith("gpt-image-");
}

function sanitizeImage(input = {}) {
  const options = rawOptions(input);
  const references = referenceImages(input, options);
  const model = String(input.model || "").trim();
  const inputFidelity = first(
    input.input_fidelity,
    input.inputFidelity,
    options.input_fidelity,
    options.inputFidelity,
    input.generation?.provider_parameters?.input_fidelity,
  );
  const outputCompression = first(
    input.output_compression,
    input.outputCompression,
    options.output_compression,
    options.outputCompression,
  );
  const moderation = first(input.moderation, options.moderation);

  return {
    ...input,
    reference_images: references,
    size: first(input.size, options.size),
    quality: first(input.quality, options.quality),
    background: first(input.background, options.background),
    output_format: first(
      input.output_format,
      input.outputFormat,
      options.output_format,
      options.outputFormat,
    ),
    output_compression: outputCompression,
    moderation,
    n: first(input.n, input.count, options.n),
    input_fidelity:
      references.length && supportsInputFidelity(model)
        ? inputFidelity
        : undefined,
    provider_options: {
      ...(outputCompression !== undefined
        ? { output_compression: outputCompression }
        : {}),
      ...(moderation !== undefined
        ? { moderation }
        : {}),
    },
    provider_parameters: {},
    provider_sanitization: {
      contract: "OPENAI_PROVIDER_INPUT_SANITIZATION_V1",
      capability: input.capability,
      endpoint_family: references.length ? "IMAGES_EDIT" : "IMAGES_GENERATE",
      reference_image_count: references.length,
      input_fidelity_supported: supportsInputFidelity(model),
      unrecognized_provider_options_removed: true,
    },
  };
}

function sanitizeResponses(input = {}) {
  const options = rawOptions(input);
  const responseFormat = first(
    input.response_format,
    input.responseFormat,
    options.response_format,
    options.responseFormat,
  );
  const configuredTextValue = first(input.text, options.text);
  const configuredText = Object.keys(object(configuredTextValue)).length
    ? object(configuredTextValue)
    : undefined;
  const reasoningValue = first(input.reasoning, options.reasoning);
  const reasoning = Object.keys(object(reasoningValue)).length
    ? object(reasoningValue)
    : undefined;
  const capability = String(input.capability || "").trim();

  return {
    ...input,
    response_format: responseFormat,
    text: configuredText,
    temperature:
      capability === "ai.reasoning.execute"
        ? undefined
        : first(input.temperature, options.temperature),
    max_output_tokens: first(
      input.max_output_tokens,
      input.maxOutputTokens,
      options.max_output_tokens,
      options.maxOutputTokens,
    ),
    provider_options: {
      ...pick(options, [
        "top_p",
        "store",
        "truncation",
        "service_tier",
        "prompt_cache_key",
        "safety_identifier",
        "parallel_tool_calls",
        "max_tool_calls",
        "include",
      ]),
      ...(reasoning ? { reasoning } : {}),
    },
    provider_parameters: responseFormat
      ? { response_format: responseFormat }
      : {},
    provider_sanitization: {
      contract: "OPENAI_PROVIDER_INPUT_SANITIZATION_V1",
      capability,
      endpoint_family: "RESPONSES",
      sampling_controls_removed_for_reasoning:
        capability === "ai.reasoning.execute",
      malformed_text_options_removed:
        Boolean(configuredTextValue) && !configuredText,
      malformed_reasoning_options_removed:
        Boolean(reasoningValue) && !reasoning,
      unrecognized_provider_options_removed: true,
    },
  };
}

function sanitizeTranscription(input = {}) {
  const options = rawOptions(input);
  return {
    ...input,
    response_format: first(
      input.response_format,
      input.responseFormat,
      options.response_format,
      options.responseFormat,
    ),
    temperature: first(input.temperature, options.temperature),
    timestamp_granularities: first(
      input.timestamp_granularities,
      input.timestampGranularities,
      options.timestamp_granularities,
      options.timestampGranularities,
    ),
    chunking_strategy: first(
      input.chunking_strategy,
      input.chunkingStrategy,
      options.chunking_strategy,
      options.chunkingStrategy,
    ),
    provider_options: {},
    provider_parameters: {},
    provider_sanitization: {
      contract: "OPENAI_PROVIDER_INPUT_SANITIZATION_V1",
      capability: input.capability,
      endpoint_family: "AUDIO_TRANSCRIPTIONS",
      unrecognized_provider_options_removed: true,
    },
  };
}

function sanitize(input = {}) {
  switch (input.capability) {
    case "ai.image.generate":
      return sanitizeImage(input);
    case "ai.text.generate":
    case "ai.reasoning.execute":
    case "document.classify":
    case "document.ocr":
    case "ai.image.analyze":
      return sanitizeResponses(input);
    case "ai.speech.to.text":
      return sanitizeTranscription(input);
    default:
      return {
        ...input,
        provider_options: {},
        provider_parameters: {},
      };
  }
}

function remoteUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function dataUrl(value) {
  return typeof value === "string" && /^data:image\//i.test(value);
}

function imageMimeFromUrl(value = "") {
  const source = String(value).toLowerCase().split(/[?#]/)[0];
  if (source.endsWith(".png")) return "image/png";
  if (source.endsWith(".webp")) return "image/webp";
  if (source.endsWith(".gif")) return "image/gif";
  if (source.endsWith(".avif")) return "image/avif";
  return "image/jpeg";
}

async function localizeRemoteImage(value) {
  if (dataUrl(value) || !remoteUrl(value)) return value;

  const response = await fetch(value, {
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    throw new Error(
      `OPENAI_ANALYSIS_MEDIA_FETCH_FAILED:${response.status}:${response.statusText}`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("OPENAI_ANALYSIS_MEDIA_EMPTY");
  if (bytes.length > 20 * 1024 * 1024) {
    throw new Error(`OPENAI_ANALYSIS_MEDIA_TOO_LARGE:${bytes.length}`);
  }

  const headerMime = String(
    response.headers.get("content-type") || "",
  ).split(";")[0].trim().toLowerCase();
  const mime = headerMime.startsWith("image/")
    ? headerMime
    : imageMimeFromUrl(value);

  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function localizeMediaValue(value) {
  if (typeof value === "string") return localizeRemoteImage(value);
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => localizeMediaValue(item)));
  }
  if (!value || typeof value !== "object") return value;

  const localized = { ...value };
  for (const key of [
    "url",
    "file_url",
    "fileUrl",
    "image_url",
    "imageUrl",
    "thumbnail_url",
    "thumbnailUrl",
  ]) {
    if (localized[key] !== undefined) {
      localized[key] = await localizeMediaValue(localized[key]);
    }
  }
  return localized;
}

async function localizeAnalysisMedia(input = {}) {
  if (input.capability !== "ai.image.analyze") return input;

  const localized = { ...input };
  let localizedCount = 0;
  for (const key of [
    "image",
    "media",
    "source",
    "assets",
    "reference_images",
    "referenceImages",
  ]) {
    if (localized[key] === undefined || localized[key] === null) continue;
    const before = JSON.stringify(localized[key]);
    localized[key] = await localizeMediaValue(localized[key]);
    if (JSON.stringify(localized[key]) !== before) localizedCount += 1;
  }

  return {
    ...localized,
    provider_sanitization: {
      ...object(localized.provider_sanitization),
      private_media_localization_contract:
        "OPENAI_PRIVATE_MEDIA_LOCALIZATION_V1",
      private_media_localized_field_count: localizedCount,
      private_media_sent_as_data_url: localizedCount > 0,
    },
  };
}

export const OpenAIProvider = {
  ...BaseOpenAIProvider,
  id: "openai",

  async execute(input = {}) {
    const sanitized = sanitize(input);
    const localized = await localizeAnalysisMedia(sanitized);
    return BaseOpenAIProvider.execute(localized);
  },
};

export const OpenAIProviderSanitizedRuntime = {
  sanitize,
  sanitizeImage,
  sanitizeResponses,
  sanitizeTranscription,
  supportsInputFidelity,
  localizeAnalysisMedia,
};