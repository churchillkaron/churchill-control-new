import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "openai",
  name: "OpenAI",
  type: PROVIDER_TYPES.AI,
  authentication: "api_key",
  billing_units: [
  "token",
  "image",
  "audio_second",
  "video_second"
],
  capabilities: [
  "TEXT_AI",
  "IMAGE_AI",
  "VIDEO_AI",
  "VOICE_AI",
  "OCR",
  "TRANSLATION",
  "EMBEDDINGS"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `OpenAI provider '${capability}' not implemented`
    );
  },
});
