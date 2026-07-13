import {
  ROIIntelligenceRuntime,
} from "./ROIIntelligenceRuntime";


export const BusinessIntelligenceRuntime = {


  async analyzeOrganization(
    organization_id
  ) {


    const roi =
      await ROIIntelligenceRuntime.organization(
        organization_id
      );


    const recommendations = [];


    for (const channel of roi) {


      if (
        Number(channel.revenue || 0) > 0 &&
        Number(channel.customers || 0) > 0
      ) {

        recommendations.push({

          provider:
            channel.provider,

          type:
            "GROW_CHANNEL",

          message:
            `${channel.provider} generated ${channel.customers} customers and ${channel.revenue} revenue. Consider increasing investment.`,

        });

      }


      if (
        Number(channel.events || 0) > 100 &&
        Number(channel.customers || 0) === 0
      ) {

        recommendations.push({

          provider:
            channel.provider,

          type:
            "LOW_CONVERSION",

          message:
            `${channel.provider} has activity but no customer conversion. Review targeting or customer journey.`,

        });

      }

    }


    return {

      organization_id,

      channels:
        roi,

      recommendations,

      generated_at:
        new Date()
        .toISOString(),

    };

  },


};
