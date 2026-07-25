import OpenAI from "openai";

import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

async function getOpenAIClient(credentialId = null) {
  const credential = credentialId
    ? await CredentialRuntime.resolve(credentialId)
    : null;
  const apiKey = credential?.secret_reference || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_CREDENTIAL_REQUIRED");
  }

  return new OpenAI({ apiKey });
}

function firstUrl(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(firstUrl).find(Boolean) || null;
  }

  return (
    value.file_url ||
    value.fileUrl ||
    value.image_url ||
    value.imageUrl ||
    value.url ||
    null
  );
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""),
  );
}

function extractImageUrl(response = {}) {
  return (
    response?.data?.[0]?.url ||
    response?.data?.[0]?.b64_json ||
    response?.output?.[0]?.url ||
    response?.url ||
    null
  );
}

async function generateImage(client, input = {}) {
  const model = input.model;
  const prompt = input.prompt || input.instructions?.prompt;
  const output = input.output_spec || input.outputSpec || {};

  if (!model) {
    throw new Error("OPENAI_IMAGE_MODEL_REQUIRED");
  }

  if (!prompt) {
    throw new Error("OPENAI_IMAGE_PROMPT_REQUIRED");
  }

  const response = await client.images.generate(compactObject({
    model,
    prompt,
    size: input.size || output.size,
    quality: input.quality || output.quality,
    background: input.background || output.background,
    output_format: input.output_format || input.outputFormat || output.format,
    n: input.count || input.n || output.count,
    moderation: input.moderation,
    user: input.user,
    ...(input.provider_options || input.providerOptions || {}),
  }));
  const imageValue = extractImageUrl(response);

  if (!imageValue) {
    throw new Error("OPENAI_IMAGE_OUTPUT_REQUIRED");
  }

  return {
    success: true,
    provider: "openai",
    model,
    output: {
      image_url: imageValue.startsWith?.("http") ? imageValue : null,
      image_base64: imageValue.startsWith?.("http") ? null : imageValue,
      raw: response,
    },
  };
}

async function generateText(client, input = {}) {
  const model = input.model;
  const requestInput = input.messages || input.input || input.prompt;

  if (!model) {
    throw new Error("OPENAI_TEXT_MODEL_REQUIRED");
  }

  if (!requestInput) {
    throw new Error("OPENAI_TEXT_INPUT_REQUIRED");
  }

  const response = await client.responses.create(compactObject({
    model,
    input: requestInput,
    instructions: input.instructions_text || input.system_prompt || input.systemPrompt,
    temperature: input.temperature,
    max_output_tokens: input.max_output_tokens || input.maxOutputTokens,
    response_format: input.response_format || input.responseFormat,
    tools: input.tools,
    tool_choice: input.tool_choice || input.toolChoice,
    metadata: input.request_metadata || input.requestMetadata,
    ...(input.provider_options || input.providerOptions || {}),
  }));

  return {
    success: true,
    provider: "openai",
    model,
    output: {
      text: response.output_text || "",
      raw: response,
    },
  };
}

async function analyseMedia(client, input = {}) {
  const model = input.model;
  const prompt = input.prompt || input.instructions?.prompt;
  const mediaUrl = firstUrl(
    input.image ||
    input.media ||
    input.source ||
    input.assets,
  );

  if (!model) {
    throw new Error("OPENAI_ANALYSIS_MODEL_REQUIRED");
  }

  if (!prompt) {
    throw new Error("OPENAI_ANALYSIS_PROMPT_REQUIRED");
  }

  if (!mediaUrl) {
    throw new Error("OPENAI_ANALYSIS_MEDIA_REQUIRED");
  }

  const response = await client.responses.create(compactObject({
    model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: mediaUrl },
        ],
      },
    ],
    temperature: input.temperature,
    max_output_tokens: input.max_output_tokens || input.maxOutputTokens,
    response_format: input.response_format || input.responseFormat,
    metadata: input.request_metadata || input.requestMetadata,
    ...(input.provider_options || input.providerOptions || {}),
  }));

  return {
    success: true,
    provider: "openai",
    model,
    output: {
      text: response.output_text || "",
      raw: response,
    },
  };
}

export const OpenAIProvider = {
  id: "openai",

  async execute(input = {}) {
    const client = await getOpenAIClient(input.credential_id);

    switch (input.capability) {
      case "ai.image.generate":
        return generateImage(client, input);

      case "ai.text.generate":
      case "ai.reasoning.execute":
        return generateText(client, input);

      case "document.classify":
      case "document.ocr":
      case "ai.image.analyze":
        return analyseMedia(client, input);

      default:
        throw new Error(`OpenAI capability not supported: ${input.capability}`);
    }
  },
};
