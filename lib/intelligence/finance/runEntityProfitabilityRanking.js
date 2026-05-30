import { supabase } from "@/lib/supabase";

export async function runEntityProfitabilityRanking({
  tenantId,
  entities,
}) {
  const rankings =
    entities
      .map((entity) => {
        const revenue =
          Number(
            entity.revenue || 0
          );

        const profit =
          Number(
            entity.netProfit || 0
          );

        const margin =
          revenue > 0
            ? (
                profit /
                revenue
              ) * 100
            : 0;

        return {
          tenant_id: tenantId,
          entity_name:
            entity.name,
          revenue,
          net_profit:
            profit,
          margin,
        };
      })
      .sort(
        (a, b) =>
          b.margin - a.margin
      )
      .map((row, index) => ({
        ...row,
        ranking_position:
          index + 1,
      }));

  const { data, error } =
    await supabase
      .from(
        "entity_profitability_rankings"
      )
      .insert(rankings)
      .select();

  if (error) {
    throw error;
  }

  return data;
}
