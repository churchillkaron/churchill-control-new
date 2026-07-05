import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "hailuo",
  name: "Hailuo AI",
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
      `Hailuo AI provider '${capability}' not implemented`
    );
  },
});
