import { createServerSupabase } from "@/lib/shared/supabase/server";

const supabase = createServerSupabase();

export async function getTopPerformingAssets({

  organizationId,

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
        creative_assets (
          *
        ),
        marketing_campaigns (
          performance_score,
          organization_id
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
            ?.organization_id ===
          organizationId
      );

    const scored =
      filtered.map((item) => ({

        ...item.creative_assets,

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