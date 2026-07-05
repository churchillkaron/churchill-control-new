import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "s3",
  name: "Amazon S3",
  type: PROVIDER_TYPES.STORAGE,
  authentication: "api_key",
  billing_units: [
  "gb"
],
  capabilities: [
  "STORAGE"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `Amazon S3 provider '${capability}' not implemented`
    );
  },
});
