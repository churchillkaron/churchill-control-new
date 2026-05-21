import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function generateConsolidatedFinancials() {

  try {

    const {
      data: entities,
      error: entityError,
    } = await supabaseAdmin
      .from("business_entities")
      .select("*");

    if (entityError) {
      throw entityError;
    }

    const results = [];

    let totalAssets = 0;

    let totalLiabilities = 0;

    let totalRevenue = 0;

    for (const entity of entities || []) {

      const {
        data: ledger,
      } = await supabaseAdmin
        .from("general_ledger")
        .select("*")
        .eq(
          "tenant_id",
          entity.entity_code
        );

      let assets = 0;

      let liabilities = 0;

      let revenue = 0;

      for (const row of ledger || []) {

        const amount =
          Number(
            row.amount || 0
          );

        const account =
          (
            row.account_name || ""
          ).toLowerCase();

        if (
          account.includes(
            "bank"
          ) ||
          account.includes(
            "cash"
          )
        ) {

          assets += amount;
        }

        if (
          account.includes(
            "payable"
          )
        ) {

          liabilities += amount;
        }

        if (
          account.includes(
            "revenue"
          )
        ) {

          revenue += amount;
        }
      }

      totalAssets += assets;

      totalLiabilities += liabilities;

      totalRevenue += revenue;

      results.push({

        entity:
          entity.entity_name,

        assets,

        liabilities,

        revenue,
      });
    }

    return {

      success: true,

      entities:
        results,

      consolidated: {

        assets:
          totalAssets,

        liabilities:
          totalLiabilities,

        revenue:
          totalRevenue,
      },
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
