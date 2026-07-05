import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "google-ai",
  name: "Google AI",
  type: PROVIDER_TYPES.AI,
  authentication: "api_key",
  billing_units: [
  "token",
  "image",
  "video_second"
],
  capabilities: [
  "TEXT_AI",
  "IMAGE_AI",
  "VIDEO_AI",
  "OCR",
  "TRANSLATION"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `Google AI provider '${capability}' not implemented`
    );
  },
});
