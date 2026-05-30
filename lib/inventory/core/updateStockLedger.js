import { supabase } from "@/lib/supabase";

export async function updateStockLedger({
  tenantId,
  itemId,
}) {
  const { data: movements } =
    await supabase
      .from("inventory_movements")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .order("movement_date", {
        ascending: true,
      });

  let quantity = 0;
  let value = 0;

  for (const move of movements || []) {
    const qty =
      Number(move.quantity || 0);

    const cost =
      Number(
        move.total_cost || 0
      );

    if (
      [
        "PURCHASE",
        "PRODUCTION",
        "ADJUSTMENT_IN",
      ].includes(
        move.movement_type
      )
    ) {
      quantity += qty;
      value += cost;
    }

    if (
      [
        "SALE",
        "WASTE",
        "ADJUSTMENT_OUT",
      ].includes(
        move.movement_type
      )
    ) {
      quantity -= qty;
      value -= cost;
    }
  }

  const average =
    quantity > 0
      ? value / quantity
      : 0;

  const existing =
    await supabase
      .from(
        "inventory_stock_ledger"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .maybeSingle();

  if (existing.data) {
    await supabase
      .from(
        "inventory_stock_ledger"
      )
      .update({
        quantity_on_hand:
          quantity,
        inventory_value:
          value,
        weighted_average_cost:
          average,
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        existing.data.id
      );
  } else {
    await supabase
      .from(
        "inventory_stock_ledger"
      )
      .insert({
        tenant_id: tenantId,
        item_id: itemId,
        quantity_on_hand:
          quantity,
        inventory_value:
          value,
        weighted_average_cost:
          average,
      });
  }

  return {
    quantity,
    value,
    average,
  };
}
