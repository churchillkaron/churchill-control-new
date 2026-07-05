import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "veo",
  name: "Google Veo",
  type: PROVIDER_TYPES.AI,
  authentication: "api_key",
  billing_units: [
  "video_second"
],
  capabilities: [
  "VIDEO_AI"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `Google Veo provider '${capability}' not implemented`
    );
  },
});
