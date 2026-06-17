import { runOpenAIGeneration }
from "@/lib/ai/providers/runOpenAIGeneration";

import { runFluxEnhanceEngine }
from "@/lib/ai/engines/runFluxEnhanceEngine";

import { runCompositeEngine }
from "@/lib/ai/engines/runCompositeEngine";

import { runVideoEngine }
from "@/lib/ai/engines/runVideoEngine";

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