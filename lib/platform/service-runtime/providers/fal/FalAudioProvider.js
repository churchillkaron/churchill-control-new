import { fal } from "@fal-ai/client";

import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

function firstValue(...values) {
  return values.find(
    (value) => value !== undefined && value !== null,
  ) ?? null;
}

async function resolveCredential(credentialId = null) {
  const credential = credentialId
    ? await CredentialRuntime.resolve(credentialId)
    : null;
  const apiKey =
    credential?.secret_reference ||
    process.env.FAL_KEY ||
    process.env.FAL_API_KEY;

  if (!apiKey) {
    throw new Error("FAL_CREDENTIAL_REQUIRED");
  }

  fal.config({ credentials: apiKey });
  return apiKey;
}

function audioUrl(data = {}) {
  const audio = data.audio || data.output || data.file || null;

  return firstValue(
    typeof audio === "string" ? audio : null,
    audio?.url,
    data.audio_url,
    data.url,
    data.files?.[0]?.url,
  );
}

function duration(input = {}) {
  return Math.max(
    1,
    Math.min(
      120,
      Number(
        input.duration_seconds ||
        input.duration ||
        10,
      ),
    ),
  );
}

function buildMusicPrompt(input = {}) {
  return [
    input.prompt,
    input.direction,
    input.emotional_function,
    input.instrumentation,
    input.tempo ? `Tempo: ${input.tempo}` : null,
    input.key ? `Key: ${input.key}` : null,
    input.arc ? `Narrative arc: ${input.arc}` : null,
    "Instrumental unless lyrics are explicitly supplied.",
    "Original composition only. Do not imitate a living artist or protected recording.",
    "Deliver clean editorial structure with a usable opening, development and ending.",
  ].filter(Boolean).join("\n");
}

function buildSfxPrompt(input = {}) {
  return [
    input.prompt,
    input.description,
    input.environment,
    input.action,
    input.perspective ? `Perspective: ${input.perspective}` : null,
    input.distance ? `Distance: ${input.distance}` : null,
    "Physically believable, clean, isolated and suitable for professional film mixing.",
    "No music, narration or unrelated sounds unless explicitly requested.",
  ].filter(Boolean).join("\n");
}

function buildVoiceText(input = {}) {
  const performance = [
    input.performance,
    input.emotion,
    input.pace ? `Pace: ${input.pace}` : null,
    input.pronunciation ? `Pronunciation: ${input.pronunciation}` : null,
  ].filter(Boolean).join(". ");

  return performance
    ? `[${performance}] ${input.text || input.prompt || ""}`
    : input.text || input.prompt || "";
}

async function subscribe(model, input) {
  const result = await fal.subscribe(model, {
    input,
    logs: false,
  });
  const url = audioUrl(result?.data || {});

  if (!url) {
    throw new Error(`FAL_AUDIO_OUTPUT_MISSING:${model}`);
  }

  return {
    success: true,
    provider: "fal",
    model,
    request_id: result.requestId || null,
    output: {
      audio_url: url,
      url,
      provider_result: result.data,
    },
  };
}

export const FalAudioProvider = {
  id: "fal",

  async execute({
    capability,
    model,
    credential_id,
    ...input
  } = {}) {
    await resolveCredential(credential_id);

    if (capability === "ai.voice.generate") {
      const text = buildVoiceText(input);
      if (!text.trim()) throw new Error("VOICE_TEXT_REQUIRED");

      return subscribe(
        model || "xai/tts/v1",
        {
          text,
          voice: input.voice || undefined,
          language: input.language || undefined,
          output_format: input.output_format || "mp3",
        },
      );
    }

    if (capability === "ai.music.generate") {
      const prompt = buildMusicPrompt(input);
      if (!prompt.trim()) throw new Error("MUSIC_DIRECTION_REQUIRED");

      return subscribe(
        model || "fal-ai/stable-audio-3/small/music/text-to-audio",
        {
          prompt,
          duration: duration(input),
        },
      );
    }

    if (capability === "ai.sfx.generate") {
      const prompt = buildSfxPrompt(input);
      if (!prompt.trim()) throw new Error("SFX_DIRECTION_REQUIRED");

      return subscribe(
        model || "fal-ai/stable-audio-3/small/sfx/text-to-audio",
        {
          prompt,
          duration: duration(input),
        },
      );
    }

    throw new Error(
      `Fal audio capability not supported: ${capability}`,
    );
  },
};
