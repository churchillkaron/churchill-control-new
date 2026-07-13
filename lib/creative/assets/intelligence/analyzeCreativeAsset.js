import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";


function safeJsonParse(value) {

  try {

    return JSON.parse(value);

  } catch {

    return null;

  }

}


function fallbackAnalysis(assetType) {

  return {

    description:
      "Creative asset",

    tags:
      ["asset"],

    visual_style:
      "professional",

    mood:
      "neutral",

    lighting:
      "natural",

    scene_type:
      assetType || "unknown",

    objects:
      [],

    activities:
      [],

    environments:
      [],

    recommended_uses:
      [],

    application_contexts:
      [],

    visual_risks:
      [],

    asset_confidence:
      40,

  };

}


export async function analyzeCreativeAsset({

  fileUrl,

  assetType,

  businessProfile = null,

}) {


  try {


    if (!fileUrl) {

      return fallbackAnalysis(assetType);

    }



    const prompt = `

Analyze this creative asset.

Understand only what is visibly present.

Do not invent products, services, promotions,
campaigns, events, offers, or business activities.

The asset may be used by any organization
in any industry.

Return ONLY valid JSON:

{

"description":"",

"tags":[],

"visual_style":"",

"mood":"",

"lighting":"",

"scene_type":"",

"objects":[],

"activities":[],

"environments":[],

"recommended_uses":[],

"application_contexts":[],

"brand_relevance_score":0,

"industry_relevance_score":0,

"visual_risks":[],

"asset_confidence":0

}


recommended_uses examples:

- website
- document
- presentation
- training
- communication
- product_material
- social_content
- advertising
- internal_use


application_contexts describe possible
business contexts without assuming industry.

`;



    const execution =
      await ServiceExecutionRuntime.execute({

        organization_id:
          businessProfile?.organization_id,


        service_id:
          "ai.image.analyze",


        provider_id:
          "openai",


        input:{

          model:
            "gpt-4.1-mini",

          prompt,

          image:
            fileUrl,

        },


        metadata:{

          module:
            "CREATIVE",

          operation:
            "ANALYZE_ASSET",

        },


        category:
          "AI",

      });



    const parsed =
      safeJsonParse(
        execution?.output?.text || ""
      );



    if (!parsed) {

      return fallbackAnalysis(assetType);

    }



    return {

      description:
        parsed.description || "",


      tags:
        Array.isArray(parsed.tags)
          ? parsed.tags
          : [],


      visual_style:
        parsed.visual_style || "",


      mood:
        parsed.mood || "",


      lighting:
        parsed.lighting || "",


      scene_type:
        parsed.scene_type ||
        assetType ||
        "",


      objects:
        parsed.objects || [],


      activities:
        parsed.activities || [],


      environments:
        parsed.environments || [],


      recommended_uses:
        parsed.recommended_uses || [],


      application_contexts:
        parsed.application_contexts || [],


      brand_relevance_score:
        Number(
          parsed.brand_relevance_score || 0
        ),


      industry_relevance_score:
        Number(
          parsed.industry_relevance_score || 0
        ),


      visual_risks:
        parsed.visual_risks || [],


      asset_confidence:
        Number(
          parsed.asset_confidence || 0
        ),

    };


  } catch(error) {


    console.error(
      "ANALYZE CREATIVE ASSET ERROR:",
      error
    );


    return fallbackAnalysis(assetType);

  }

}
