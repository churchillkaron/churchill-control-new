import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "openai",
  name: "OpenAI",
  type: PROVIDER_TYPES.AI,
  capabilities: [
    "chat",
    "vision",
    "embeddings",
    "ocr",
    "image",
  ],

  async execute({ capability, context, payload }) {
    throw new Error(
      `OpenAI provider '${capability}' not implemented`
    );
  },
});
