import { runOpenAIGeneration }
from "@/lib/marketing/ai/providers/runOpenAIGeneration";

import { runFluxEnhanceEngine }
from "@/lib/marketing/ai/engines/runFluxEnhanceEngine";

import { runCompositeEngine }
from "@/lib/marketing/ai/engines/runCompositeEngine";

import { runVideoEngine }
from "@/lib/marketing/ai/engines/runVideoEngine";

export const providerRegistry = {

  // =====================================
  // FULL AI IMAGE GENERATION
  // =====================================

  "full-ai": {

    provider:
      "openai",

    type:
      "image-generation",

    runner:
      runOpenAIGeneration,

  },

  // =====================================
  // IMAGE ENHANCEMENT
  // =====================================

  "enhance": {

    provider:
      "flux",

    type:
      "image-enhancement",

    runner:
      runFluxEnhanceEngine,

  },

  // =====================================
  // ASSET COMPOSITION
  // =====================================

  "composite": {

    provider:
      "sdxl",

    type:
      "asset-composition",

    runner:
      runCompositeEngine,

  },

  // =====================================
  // VIDEO ENGINE
  // =====================================

  "video": {

    provider:
      "runway",

    type:
      "video-generation",

    runner:
      runVideoEngine,

  },

};