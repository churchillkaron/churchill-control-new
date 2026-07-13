import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";


export const ROIIntelligenceRuntime = {


  async organization(
    organization_id
  ) {


    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from("attribution_events")
        .select("*")
        .eq(
          "organization_id",
          organization_id
        );


    if (error) {

      throw error;

    }


    const summary = {};


    for (const event of data || []) {


      const key =
        event.provider_id ||
        "internal";


      if (!summary[key]) {

        summary[key] = {

          provider:
            key,

          customers:
            0,

          revenue:
            0,

          events:
            0,

        };

      }


      summary[key].events += 1;


      summary[key].revenue +=
        Number(
          event.value || 0
        );


      if (
        event.customer_id
      ) {

        summary[key].customers += 1;

      }

    }


    return Object.values(
      summary
    );

  },


};
