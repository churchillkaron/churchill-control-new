export function analyzeCreativeBusiness({

  organization = {},

  brand = {},

  industry = null,

  objective = "",

  assets = [],

}) {


  return {

    business_context: {

      organization,

      industry,

      objective,

    },


    brand_direction: {

      tone:
        brand.voice_tone ||
        "professional",

      visual_style:
        brand.style_keywords ||
        [],

    },


    audience_hypothesis: [

      "existing customers",

      "potential customers",

      "target market",

    ],


    creative_opportunity: {

      asset_first:
        assets.length > 0,

      missing_assets:
        assets.length === 0,

      recommended_formats:[

        "image",

        "video",

        "document",

      ],

    },


    confidence:

      assets.length > 0
        ? 80
        : 60,


  };

}
