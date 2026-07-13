import {
  CreativeGenerationRuntime,
} from "@/lib/creative/generation/runtime/CreativeGenerationRuntime";


export async function runCampaignGeneration({

  organizationId,

  poster = {},

  selectedAssets = [],

  pageId = null,

  selectedBusiness = null,

}) {


  const capability =

    poster?.engine === "video"

      ? "creative.video.generate"

      :

        "creative.image.generate";


  return CreativeGenerationRuntime.create({

    organization_id:
      organizationId,

    capability,


    input: {

      poster,

      selectedAssets,

      selectedBusiness,

      pageId,

    },


    metadata: {

      source:
        "marketing_compatibility_adapter",

    },

  });


}
