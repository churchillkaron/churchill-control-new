import {
  analyzeCreativeBusiness,
} from "../analysis/CreativeBusinessAnalyzer";


export const CreativeIntelligenceRuntime = {


  async analyzeBusiness({

    organization = {},

    brand = {},

    industry = null,

    objective = "",

    assets = [],

  }) {


    return analyzeCreativeBusiness({

      organization,

      brand,

      industry,

      objective,

      assets,

    });


  },


  async createCreativePlan({

    organization = {},

    brand = {},

    industry = null,

    objective = "",

    assets = [],

    requestedOutputs = [],

  }) {


    const analysis =
      analyzeCreativeBusiness({

        organization,

        brand,

        industry,

        objective,

        assets,

      });



    return {

      analysis,


      objective,


      recommended_outputs:

        requestedOutputs.length

          ? requestedOutputs

          : analysis
              .creative_opportunity
              .recommended_formats,


      production_direction: {

        asset_strategy:

          analysis
            .creative_opportunity
            .asset_first

            ? "assets_first"

            : "generate_missing_assets",


        creative_standard:

          "high_quality_realistic",


        avoid_generic_ai:

          true,

      },


      status:

        "PLANNED",

    };


  },


};
