import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "elevenlabs",
  name: "ElevenLabs",
  type: PROVIDER_TYPES.AI,
  authentication: "api_key",
  billing_units: [
  "audio_second"
],
  capabilities: [
  "VOICE_AI"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `ElevenLabs provider '${capability}' not implemented`
    );
  },
});
