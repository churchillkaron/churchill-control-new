import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "telegram",
  name: "Telegram",
  type: PROVIDER_TYPES.COMMUNICATION,
  authentication: "bot_token",
  billing_units: [
  "message"
],
  capabilities: [
  "TELEGRAM"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `Telegram provider '${capability}' not implemented`
    );
  },
});
