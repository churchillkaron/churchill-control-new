import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import OpenAI from "openai";

function text(value) {
  return String(value ?? "").trim();
}

function mimeType(format) {
  switch (format) {
    case "opus":
      return "audio/ogg";
    case "aac":
      return "audio/aac";
    case "flac":
      return "audio/flac";
    case "wav":
      return "audio/wav";
    case "pcm":
      return "audio/L16";
    case "mp3":
    default:
      return "audio/mpeg";
  }
}

function extension(format) {
  return format === "pcm" ? "pcm" : format;
}

export async function executeOpenAITextToSpeech(input = {}) {
  const credential = input.credential || {};
  const apiKey = text(credential.api_key);
  const model = text(input.model);
  const speechText = text(input.input || input.text || input.message);
  const voice = text(
    input.voice ||
    input.payload?.voice ||
    process.env.AVANTIQO_TTS_VOICE ||
    "marin",
  );
  const format = text(
    input.response_format ||
    input.responseFormat ||
    input.payload?.response_format ||
    "mp3",
  ).toLowerCase();
  const instructions = text(
    input.instructions ||
    input.payload?.instructions ||
    "Speak naturally, clearly and conversationally. Match the language of the supplied text.",
  );

  if (!apiKey) throw new Error("OPENAI_TTS_MANAGED_CREDENTIAL_REQUIRED");
  if (!model) throw new Error("OPENAI_TTS_MODEL_REQUIRED");
  if (!speechText) throw new Error("OPENAI_TTS_TEXT_REQUIRED");
  if (!voice) throw new Error("OPENAI_TTS_VOICE_REQUIRED");

  const client = new OpenAI({ apiKey });
  const response = await client.audio.speech.create({
    model,
    voice,
    input: speechText.slice(0, 4096),
    instructions: instructions || undefined,
    response_format: format,
    speed:
      Number.isFinite(Number(input.speed))
        ? Number(input.speed)
        : undefined,
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("OPENAI_TTS_AUDIO_REQUIRED");

  const filePath = path.join(
    "/tmp",
    `avantiqo-tts-${randomUUID()}.${extension(format)}`,
  );

  await fs.writeFile(filePath, buffer);

  return {
    success: true,
    provider: "openai",
    model,
    status: "completed",
    output: {
      status: "completed",
      file_path: filePath,
      mime_type: mimeType(format),
      response_format: format,
      byte_length: buffer.length,
      voice,
    },
  };
}
