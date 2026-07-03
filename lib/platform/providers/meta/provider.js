import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "meta",
  name: "Meta",
  type: PROVIDER_TYPES.MARKETING,
  capabilities: [
    "facebook",
    "instagram",
    "messenger",
    "whatsapp",
    "ads",
    "pages",
  ],

  async execute({ capability, context, payload }) {
    throw new Error(
      `Meta provider '${capability}' not implemented`
    );
  },
});
