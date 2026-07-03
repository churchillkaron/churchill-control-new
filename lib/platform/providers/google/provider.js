import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "google",
  name: "Google",
  type: PROVIDER_TYPES.OTHER,
  capabilities: [
    "maps",
    "drive",
    "calendar",
    "vision",
    "translation",
    "business",
  ],

  async execute({ capability, context, payload }) {
    throw new Error(
      `Google provider '${capability}' not implemented`
    );
  },
});
