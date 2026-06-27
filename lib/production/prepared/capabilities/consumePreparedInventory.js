import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function consumePreparedInventory({
  tenant_id,
  prepared_item_name,
  quantity = 1,
  reference_id = null,
}) {

  try {

    // ===== FEFO =====
    // First Expired First Out

    const {
      data: prepared,
      error: preparedError,
    } = await supabaseAdmin
      .from(
        "prepared_inventory"
      )
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      )
      .eq(
        "item_name",
        prepared_item_name
      )
      .gt(
        "quantity",
        0
      )
      .order(
        "expiry_date",
        {
          ascending: true,
          nullsFirst: false,
        }
      )
      .limit(1)
      .single();

    if (preparedError) {
      throw preparedError;
    }

    const currentQuantity =
      Number(
        prepared.quantity || 0
      );

    const consumeQuantity =
      Number(quantity || 0);

    if (
      currentQuantity <
      consumeQuantity
    ) {

      throw new Error(
        "INSUFFICIENT_PREPARED_INVENTORY"
      );
    }

    const newQuantity =
      currentQuantity -
      consumeQuantity;

    // ===== UPDATE INVENTORY =====
    const {
      error: updateError,
    } = await supabaseAdmin
      .from(
        "prepared_inventory"
      )
      .update({

        quantity:
          newQuantity,
      })
      .eq(
        "id",
        prepared.id
      );

    if (updateError) {
      throw updateError;
    }

    // ===== INVENTORY LEDGER =====
    const {
      error: ledgerError,
    } = await supabaseAdmin
      .from(
        "inventory_ledger"
      )
      .insert([
        {

          tenant_id,

          ingredient_id:
            prepared.id,

          ingredient_name:
            prepared.item_name,

          movement_type:
            "PREPARED_CONSUMPTION",

          quantity:
            consumeQuantity,

          previous_quantity:
            currentQuantity,

          new_quantity:
            newQuantity,

          reference_type:
            "PREPARED_INVENTORY",

          reference_id,

          created_at:
            new Date().toISOString(),
        },
      ]);

    if (ledgerError) {
      throw ledgerError;
    }

    return {

      success: true,

      prepared_inventory:
        prepared.item_name,

      consumed:
        consumeQuantity,

      remaining:
        newQuantity,

      consumed_batch:
        prepared.id,

      expiry_date:
        prepared.expiry_date,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
