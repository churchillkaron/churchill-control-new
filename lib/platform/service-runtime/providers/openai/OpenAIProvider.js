import fs from "node:fs/promises";

import OpenAI, { toFile } from "openai";

import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

async function getOpenAIClient(credentialId = null) {
  const credential = credentialId
    ? await CredentialRuntime.resolve(credentialId)
    : null;
  const apiKey = credential?.secret_reference || process.env.OPENAI_API_KEY;

  if (!apiKey) throw new Error("OPENAI_CREDENTIAL_REQUIRED");
  return new OpenAI({ apiKey });
}

function firstUrl(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(firstUrl).find(Boolean) || null;

  return (
    value.file_url ||
    value.fileUrl ||
    value.audio_url ||
    value.audioUrl ||
    value.video_url ||
    value.videoUrl ||
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

function parseStructuredText(value) {
  const source = String(value || "").replace(/^\uFEFF/, "").trim();
  if (!source) return null;
  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(source.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Continue with the next conservative extraction.
    }
  }
  return null;
}

function responseOutputText(response = {}) {
  const direct = String(response.output_text || "").trim();
  if (direct) return direct;

  const parts = [];
  for (const item of Array.isArray(response.output) ? response.output : []) {
    if (item?.type !== "message") continue;
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (content?.type === "output_text" && content.text) {
        parts.push(String(content.text));
      }
    }
  }
  return parts.join("\n").trim();
}

function responsesTextFormat(input = {}) {
  const requested =
    input.text?.format ||
    input.response_format ||
    input.responseFormat ||
    null;

  if (!requested || typeof requested !== "object") return null;

  if (requested.type === "json_schema" && requested.json_schema) {
    return {
      type: "json_schema",
      ...requested.json_schema,
    };
  }

  if (["text", "json_object", "json_schema"].includes(requested.type)) {
    return requested;
  }

  return null;
}

function responseFailure(response = {}) {
  const status = String(response.status || "").toLowerCase();
  if (status === "failed") {
    return response.error?.message || response.error?.code || "OPENAI_TEXT_RESPONSE_FAILED";
  }
  if (status === "incomplete") {
    return response.incomplete_details?.reason || "OPENAI_TEXT_RESPONSE_INCOMPLETE";
  }
  return null;
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

  if (!model) throw new Error("OPENAI_IMAGE_MODEL_REQUIRED");
  if (!prompt) throw new Error("OPENAI_IMAGE_PROMPT_REQUIRED");

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

  if (!imageValue) throw new Error("OPENAI_IMAGE_OUTPUT_REQUIRED");

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
  const format = responsesTextFormat(input);
  const providerOptions = input.provider_options || input.providerOptions || {};
  const configuredText = providerOptions.text || input.text || null;

  if (!model) throw new Error("OPENAI_TEXT_MODEL_REQUIRED");
  if (!requestInput) throw new Error("OPENAI_TEXT_INPUT_REQUIRED");

  const response = await client.responses.create(compactObject({
    model,
    input: requestInput,
    instructions: input.instructions_text || input.system_prompt || input.systemPrompt,
    temperature: input.temperature,
    max_output_tokens: input.max_output_tokens || input.maxOutputTokens,
    text: format || configuredText
      ? {
          ...(configuredText || {}),
          ...(format ? { format } : {}),
        }
      : undefined,
    tools: input.tools,
    tool_choice: input.tool_choice || input.toolChoice,
    metadata: input.request_metadata || input.requestMetadata,
    ...providerOptions,
  }));

  const failure = responseFailure(response);
  if (failure) throw new Error(`OPENAI_TEXT_RESPONSE_NOT_COMPLETE:${failure}`);

  const responseText = responseOutputText(response);
  if (!responseText) throw new Error("OPENAI_TEXT_OUTPUT_REQUIRED");
  const structured = parseStructuredText(responseText);

  return {
    success: true,
    provider: "openai",
    model,
    output: {
      ...(structured || {}),
      text: responseText,
      raw: response,
      response_status: response.status || null,
    },
  };
}

async function analyseMedia(client, input = {}) {
  const model = input.model;
  const prompt = input.prompt || input.instructions?.prompt;
  const mediaUrl = firstUrl(input.image || input.media || input.source || input.assets);

  if (!model) throw new Error("OPENAI_ANALYSIS_MODEL_REQUIRED");
  if (!prompt) throw new Error("OPENAI_ANALYSIS_PROMPT_REQUIRED");
  if (!mediaUrl) throw new Error("OPENAI_ANALYSIS_MEDIA_REQUIRED");

  const providerOptions = input.provider_options || input.providerOptions || {};
  const format = responsesTextFormat(input);
  const configuredText = providerOptions.text || input.text || null;
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
    text: format || configuredText
      ? {
          ...(configuredText || {}),
          ...(format ? { format } : {}),
        }
      : undefined,
    metadata: input.request_metadata || input.requestMetadata,
    ...providerOptions,
  }));

  const failure = responseFailure(response);
  if (failure) throw new Error(`OPENAI_ANALYSIS_RESPONSE_NOT_COMPLETE:${failure}`);

  const responseText = responseOutputText(response);
  if (!responseText) throw new Error("OPENAI_ANALYSIS_OUTPUT_REQUIRED");
  const structured = parseStructuredText(responseText);

  return {
    success: true,
    provider: "openai",
    model,
    output: {
      ...(structured || {}),
      text: responseText,
      raw: response,
      response_status: response.status || null,
    },
  };
}

function normalizeTimedItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      id: item.id ?? index,
      start_seconds: Number.isFinite(Number(item.start)) ? Number(item.start) : null,
      end_seconds: Number.isFinite(Number(item.end)) ? Number(item.end) : null,
      text: item.text ?? item.word ?? "",
      speaker: item.speaker ?? item.speaker_id ?? null,
      confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : null,
      raw: item,
    }))
    .filter((item) => item.text || item.start_seconds !== null || item.end_seconds !== null);
}

async function transcribeMedia(client, input = {}) {
  const model = input.model;
  const mediaUrl = firstUrl(
    input.file ||
    input.audio ||
    input.video ||
    input.media ||
    input.source ||
    input.assets,
  );

  if (!model) throw new Error("OPENAI_TRANSCRIPTION_MODEL_REQUIRED");
  if (!mediaUrl && !input.upload_file) {
    throw new Error("OPENAI_TRANSCRIPTION_MEDIA_REQUIRED");
  }

  const materialized = await materializeMedia({
    file: input.upload_file || null,
    url: mediaUrl,
    file_name: input.file_name || input.fileName || null,
    mime_type: input.mime_type || input.mimeType || null,
    policy: input.media_policy || input.mediaPolicy || {},
  });

  try {
    const buffer = await fs.readFile(materialized.file_path);
    const file = await toFile(
      buffer,
      materialized.original_file_name || input.file_name || "media",
      { type: materialized.mime_type || input.mime_type || undefined },
    );
    const response = await client.audio.transcriptions.create(compactObject({
      file,
      model,
      language: input.language,
      prompt: input.prompt,
      response_format: input.response_format || input.responseFormat,
      temperature: input.temperature,
      timestamp_granularities:
        input.timestamp_granularities || input.timestampGranularities,
      chunking_strategy: input.chunking_strategy || input.chunkingStrategy,
      ...(input.provider_options || input.providerOptions || {}),
    }));
    const segments = normalizeTimedItems(response.segments);
    const words = normalizeTimedItems(response.words);

    return {
      success: true,
      provider: "openai",
      model,
      output: {
        text: response.text || "",
        language: response.language || input.language || null,
        duration_seconds:
          Number.isFinite(Number(response.duration)) ? Number(response.duration) : null,
        segments,
        words,
        speakers: response.speakers || null,
        checksum_sha256: materialized.checksum,
        source_url: materialized.final_url || mediaUrl || null,
        raw: response,
      },
    };
  } finally {
    await materialized.cleanup();
  }
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

      case "ai.speech.to.text":
        return transcribeMedia(client, input);

      default:
        throw new Error(`OpenAI capability not supported: ${input.capability}`);
    }
  },
};
