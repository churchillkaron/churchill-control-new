import {
  CreativeGenerationRuntime,
} from "@/lib/creative/generation/runtime/CreativeGenerationRuntime";


export async function createCreativeCampaignGeneration({

  organizationId,

  entityId = null,

  campaignId = null,

  missionId = null,

  poster = {},

  selectedAssets = [],

  selectedBusiness = null,

}) {


  const capability =

    poster?.engine === "video"

      ? "creative.video.generate"

      : poster?.engine === "enhance"

        ? "creative.image.upscale"

        :

          "creative.image.generate";



  return CreativeGenerationRuntime.create({

    organization_id:
      organizationId,

    entity_id:
      entityId,

    campaign_id:
      campaignId,

    mission_id:
      missionId,


    capability,


    input:{

      poster,

      selectedAssets,

      selectedBusiness,

    },


    metadata:{

      source:
        "creative_campaign_adapter",

    },

  });

}
