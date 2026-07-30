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

function directUrl(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return null;
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

function allUrls(value, output = []) {
  if (!value) return output;
  if (Array.isArray(value)) {
    for (const item of value) allUrls(item, output);
    return output;
  }
  const url = directUrl(value);
  if (url && !output.includes(url)) output.push(url);
  if (typeof value === "object") {
    for (const key of [
      "images",
      "assets",
      "references",
      "reference_images",
      "referenceImages",
      "selectedAssets",
      "source_assets",
      "sourceAssets",
    ]) {
      if (value[key]) allUrls(value[key], output);
    }
  }
  return output;
}

function firstUrl(value) {
  return allUrls(value)[0] || null;
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""),
  );
}

function providerOptions(input = {}) {
  const options = {
    ...(input.provider_options || input.providerOptions || {}),
    ...(input.provider_parameters || input.providerParameters || {}),
  };
  for (const key of [
    "reference_images",
    "referenceImages",
    "identity_profile_id",
    "identity_atlas_asset_node_id",
    "identity_atlas_url",
    "identity_atlas_hash",
    "identity_keyframe_node_id",
    "identity_keyframe_review_node_id",
    "identity_keyframe_task_id",
    "identity_keyframe_review_task_id",
    "identity_keyframe_url",
    "identity_keyframe_approved",
    "use_reference_image_edit",
    "response_format",
    "minimum_identity_score",
    "minimum_story_score",
    "minimum_total_score",
  ]) {
    delete options[key];
  }
  return options;
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
    input.provider_parameters?.response_format ||
    input.providerParameters?.responseFormat ||
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

function imageReferenceUrls(input = {}) {
  return allUrls([
    input.reference_images,
    input.referenceImages,
    input.provider_parameters?.reference_images,
    input.providerParameters?.referenceImages,
    input.generation?.provider_parameters?.reference_images,
    input.image,
    input.identity_source,
    input.identitySource,
    input.source,
  ]).slice(0, 16);
}

async function materializeImageReferences(input = {}) {
  const urls = imageReferenceUrls(input);
  const materialized = [];
  try {
    for (const [index, url] of urls.entries()) {
      const item = await materializeMedia({
        url,
        file_name: `identity-reference-${index + 1}.png`,
        mime_type: "image/png",
        organization_id:
          input.context?.organization_id ||
          input.organization_id ||
          null,
        policy: input.media_policy || input.mediaPolicy || {},
      });
      const buffer = await fs.readFile(item.file_path);
      const file = await toFile(
        buffer,
        item.original_file_name || `identity-reference-${index + 1}.png`,
        { type: item.mime_type || "image/png" },
      );
      materialized.push({ item, file, url });
    }
    return materialized;
  } catch (error) {
    for (const entry of materialized) await entry.item.cleanup().catch(() => null);
    throw error;
  }
}

async function generateImage(client, input = {}) {
  const model = input.model;
  const prompt = input.prompt || input.instructions?.prompt;
  const output = input.output_spec || input.outputSpec || {};
  const references = imageReferenceUrls(input);

  if (!model) throw new Error("OPENAI_IMAGE_MODEL_REQUIRED");
  if (!prompt) throw new Error("OPENAI_IMAGE_PROMPT_REQUIRED");

  let response;
  let referenceFiles = [];
  try {
    if (references.length) {
      referenceFiles = await materializeImageReferences(input);
      if (!referenceFiles.length) {
        throw new Error("OPENAI_IMAGE_REFERENCE_MATERIALIZATION_REQUIRED");
      }
      response = await client.images.edit(compactObject({
        model,
        image: referenceFiles.map((entry) => entry.file),
        prompt,
        size: input.size || output.size,
        quality: input.quality || output.quality,
        background: input.background || output.background,
        output_format: input.output_format || input.outputFormat || output.format,
        input_fidelity:
          input.input_fidelity ||
          input.inputFidelity ||
          input.provider_parameters?.input_fidelity ||
          input.generation?.provider_parameters?.input_fidelity,
        n: input.count || input.n || output.count,
        user: input.user,
        ...providerOptions(input),
      }));
    } else {
      response = await client.images.generate(compactObject({
        model,
        prompt,
        size: input.size || output.size,
        quality: input.quality || output.quality,
        background: input.background || output.background,
        output_format: input.output_format || input.outputFormat || output.format,
        n: input.count || input.n || output.count,
        moderation: input.moderation,
        user: input.user,
        ...providerOptions(input),
      }));
    }
  } finally {
    for (const entry of referenceFiles) await entry.item.cleanup().catch(() => null);
  }

  const imageValue = extractImageUrl(response);
  if (!imageValue) throw new Error("OPENAI_IMAGE_OUTPUT_REQUIRED");

  return {
    success: true,
    provider: "openai",
    model,
    output: {
      image_url: imageValue.startsWith?.("http") ? imageValue : null,
      image_base64: imageValue.startsWith?.("http") ? null : imageValue,
      generation_mode: references.length ? "REFERENCE_IMAGE_EDIT" : "TEXT_TO_IMAGE",
      reference_image_count: references.length,
      raw: response,
    },
  };
}

async function generateText(client, input = {}) {
  const model = input.model;
  const requestInput = input.messages || input.input || input.prompt;
  const format = responsesTextFormat(input);
  const options = providerOptions(input);
  const configuredText = options.text || input.text || null;

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
    ...options,
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

function analysisUrls(input = {}) {
  return allUrls([
    input.image,
    input.media,
    input.source,
    input.assets,
    input.reference_images,
    input.referenceImages,
  ]).slice(0, 16);
}

async function analyseMedia(client, input = {}) {
  const model = input.model;
  const prompt = input.prompt || input.instructions?.prompt;
  const mediaUrls = analysisUrls(input);

  if (!model) throw new Error("OPENAI_ANALYSIS_MODEL_REQUIRED");
  if (!prompt) throw new Error("OPENAI_ANALYSIS_PROMPT_REQUIRED");
  if (!mediaUrls.length) throw new Error("OPENAI_ANALYSIS_MEDIA_REQUIRED");

  const options = providerOptions(input);
  const format = responsesTextFormat(input);
  const configuredText = options.text || input.text || null;
  const response = await client.responses.create(compactObject({
    model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          ...mediaUrls.map((imageUrl, index) => ({
            type: "input_image",
            image_url: imageUrl,
            detail: index === 0 ? "high" : "auto",
          })),
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
    ...options,
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
      analyzed_image_count: mediaUrls.length,
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
    organization_id:
      input.context?.organization_id ||
      input.organization_id ||
      null,
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
      ...providerOptions(input),
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
