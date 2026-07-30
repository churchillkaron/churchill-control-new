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
    output_compression: first(
      input.output_compression,
      input.outputCompression,
      options.output_compression,
      options.outputCompression,
    ),
    moderation: first(input.moderation, options.moderation),
    n: first(input.n, input.count, options.n),
    input_fidelity:
      references.length && supportsInputFidelity(model)
        ? inputFidelity
        : undefined,
    provider_options: pick(options, [
      "output_compression",
    ]),
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
  const configuredText = first(input.text, options.text);
  const reasoning = first(input.reasoning, options.reasoning);
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

export const OpenAIProvider = {
  ...BaseOpenAIProvider,
  id: "openai",

  async execute(input = {}) {
    return BaseOpenAIProvider.execute(sanitize(input));
  },
};

export const OpenAIProviderSanitizedRuntime = {
  sanitize,
  sanitizeImage,
  sanitizeResponses,
  sanitizeTranscription,
  supportsInputFidelity,
};
