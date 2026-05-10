import { runOpenAIGeneration }
from "@/lib/ai/providers/runOpenAIGeneration";

export const providerRegistry = {

  "full-ai": {

    provider:
      "openai",

    runner:
      runOpenAIGeneration,

  },

  "enhance": {

    provider:
      "flux",

    runner:
      runOpenAIGeneration,

  },

  "composite": {

    provider:
      "sdxl",

    runner:
      runOpenAIGeneration,

  },

  "video": {

    provider:
      "runway",

    runner:
      runOpenAIGeneration,

  },

};