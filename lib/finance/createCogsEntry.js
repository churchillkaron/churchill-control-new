import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function createCogsEntry({
  tenantId,
  orderId,
  dishId,
  quantity,
  revenueAmount = 0,
}) {
  try {
    if (!tenantId || !dishId || !quantity) {
      return {
        success: false,
        error: "MISSING_REQUIRED_FIELDS",
      };
    }

    const { data: latestBatch, error: batchError } =
      await supabaseAdmin
        .from("production_batches")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("dish_id", dishId)
        .order("produced_at", {
          ascending: false,
        })
       .limit(1)
        .single();

    if (batchError) throw batchError;

    const unitCost = Number(
      latestBatch?.cost_per_unit || 0
    );

    const totalCost =
      unitCost * Number(quantity);

    const profit =
      Number(revenueAmount || 0) - totalCost;

    const { error: insertError } =
      await supabaseAdmin
        .from("cogs_entries")
        .insert({
          tenant_id: tenantId,
          order_id: orderId || null,
          dish_id: dishId,
          quantity: Number(quantity),
          cost_amount: totalCost,
          revenue_amount: Number(
            revenueAmount || 0
          ),
          profit_amount: profit,
        });

    if (insertError) throw insertError;

    return {
      success: true,
      unit_cost: unitCost,
      total_cost: totalCost,
      revenue_amount: Number(
        revenueAmount || 0
      ),
      profit_amount: profit,
    };
  } catch (error) {
    console.error(
      "CREATE COGS ENTRY ERROR:",
      error
    );

    console.error(
  "FULL COGS ERROR:",
  JSON.stringify(error, null, 2)
);

return {
  success: false,
  error: error.message,
};
  }
}
