import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "xero",
  name: "Xero",
  type: PROVIDER_TYPES.OTHER,
  authentication: "oauth2",
  billing_units: [
  "api_call"
],
  capabilities: [
  "ACCOUNTING_SYNC"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `Xero provider '${capability}' not implemented`
    );
  },
});
