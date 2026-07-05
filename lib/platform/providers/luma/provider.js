import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "luma",
  name: "Luma Dream Machine",
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
      `Luma Dream Machine provider '${capability}' not implemented`
    );
  },
});
