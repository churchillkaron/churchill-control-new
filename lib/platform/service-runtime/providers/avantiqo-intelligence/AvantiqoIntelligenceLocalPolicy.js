const LOCAL_MODEL = "Qwen/Qwen3-4B-GGUF:Q4_K_M";

export const AVANTIQO_INTELLIGENCE_LOCAL_MODEL = LOCAL_MODEL;
export const AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_TOKENS = 20480;
export const AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_SAFETY_TOKENS = 512;
export const AVANTIQO_INTELLIGENCE_LOCAL_FRONT_OUTPUT_CAP = 640;
export const AVANTIQO_INTELLIGENCE_LOCAL_FAST_OUTPUT_CAP = 4096;
export const AVANTIQO_INTELLIGENCE_LOCAL_DEEP_OUTPUT_CAP = 8192;

// Measured on Node01 RTX 2060 / Qwen3 4B. The model can physically consume
// substantially more than this, but long-context free re-ranking became unreliable
// around the 10.8k-token benchmark. Above this threshold, Deep should preserve
// evidence through bounded hierarchical passes instead of trusting one-shot synthesis.
export const AVANTIQO_INTELLIGENCE_LOCAL_DEEP_SINGLE_PASS_TRUSTED_PROMPT_TOKENS = 6000;
