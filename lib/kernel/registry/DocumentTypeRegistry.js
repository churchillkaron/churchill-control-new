const registry = new Map();

export const DocumentTypeRegistry = {

  register(definition) {

    if (!definition?.id) {
      throw new Error("document id required");
    }

    registry.set(
      definition.id,
      definition
    );

    return definition;
  },

  get(id) {
    return registry.get(id) || null;
  },

  all() {
    return [...registry.values()];
  },

  remove(id) {
    registry.delete(id);
  },

  clear() {
    registry.clear();
  },

};
