export const PROVIDER_TYPES = {
  AI: "ai",
  MARKETING: "marketing",
  COMMUNICATION: "communication",
  PAYMENT: "payment",
  STORAGE: "storage",
  OCR: "ocr",
  MAPS: "maps",
  GOVERNMENT: "government",
  OTHER: "other",
};

class ProviderRuntime {

  constructor() {
    this.providers = new Map();
  }

  register(provider) {

    if (!provider?.id) {
      throw new Error("Provider id required");
    }

    this.providers.set(
      provider.id,
      Object.freeze({

        enabled: true,

        authentication: "none",

        billing_units: [],

        industries: ["all"],

        regions: ["global"],

        models: [],

        pricing: {},

        limits: {},

        metadata: {},

        ...provider,

      })
    );

  }

  get(id) {
    return this.providers.get(id) || null;
  }

  list() {
    return [...this.providers.values()];
  }

  byType(type) {
    return this.list().filter(
      p => p.type === type
    );
  }

  supports(capability) {
    return this.list().filter(
      p =>
        (p.capabilities || [])
          .includes(capability)
    );
  }

}

export const providerRuntime =
  new ProviderRuntime();
