import { supabase }
from "@/lib/shared/supabase/client";

export async function getTopPerformingAssets({

  tenantId,

  limit = 10,

}) {

  try {

    const {
      data,
      error,
    } = await supabase
      .from(
        "campaign_asset_usage"
      )
      .select(`
        asset_id,
        marketing_assets (
          *
        ),
        marketing_campaigns (
          performance_score,
          tenant_id
        )
      `);

    if (error) {

      throw error;

    }

    const filtered =
      (data || []).filter(
        (item) =>
          item
            ?.marketing_campaigns
            ?.tenant_id ===
          tenantId
      );

    const scored =
      filtered.map((item) => ({

        ...item.marketing_assets,

        performance_score:
          item
            ?.marketing_campaigns
            ?.performance_score || 0,

      }));

    scored.sort(
      (a, b) =>
        b.performance_score -
        a.performance_score
    );

    return scored.slice(
      0,
      limit
    );

  } catch (err) {

    console.error(
      "TOP PERFORMING ASSETS ERROR:",
      err
    );

    return [];

  }

}