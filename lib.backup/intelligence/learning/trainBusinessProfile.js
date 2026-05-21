import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

export default async function trainBusinessProfile({
  tenant_id,
}) {

  try {

    const executive =
      await buildExecutiveOverview({
        tenant_id,
      });

    const profile = {

      revenue_level:
        executive?.revenue
          ?.total_revenue || 0,

      operational_status:
        executive?.operations
          ?.status || "UNKNOWN",

      customer_count:
        executive?.customers
          ?.total_customers || 0,

      forecast_status:
        executive?.forecast
          ?.demand_status || "NORMAL",

      updated_at:
        new Date().toISOString(),
    };

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("ai_business_profiles")
      .upsert([
        {
          tenant_id,
          profile,
          updated_at:
            new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      profile: data,
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
