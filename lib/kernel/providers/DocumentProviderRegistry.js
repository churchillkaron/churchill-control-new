const providers = new Map();

export const DocumentProviderRegistry = {

  register(provider) {

    if (!provider?.id) {
      throw new Error("provider id required");
    }

    providers.set(
      provider.id,
      provider
    );

    return provider;
  },

  all() {
    return [...providers.values()];
  },

  get(id) {
    return providers.get(id) || null;
  },

  clear() {
    providers.clear();
  },

};
