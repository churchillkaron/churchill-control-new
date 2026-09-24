export const INTELLIGENCE_MODEL_REGISTRY = Object.freeze({
  live: Object.freeze({
    runtime_model: "qwen3:1.7b",
    display_model: "Qwen/Qwen3-1.7B-GGUF",
  }),
  deep: Object.freeze({
    runtime_model: "qwen3:4b-instruct",
    display_model: "qwen3:4b-instruct",
  }),
});

export const DEFAULT_INTELLIGENCE_RUNTIME_MODEL =
  INTELLIGENCE_MODEL_REGISTRY.deep.runtime_model;

export function displayIntelligenceRuntimeModel(value) {
  const runtimeModel = String(value ?? "").trim();
  if (!runtimeModel) return INTELLIGENCE_MODEL_REGISTRY.deep.display_model;

  const match = Object.values(INTELLIGENCE_MODEL_REGISTRY).find(
    (entry) => entry.runtime_model === runtimeModel,
  );
  return match?.display_model || runtimeModel;
}

export default INTELLIGENCE_MODEL_REGISTRY;
