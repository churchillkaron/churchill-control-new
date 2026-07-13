import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function consumePreparedInventory({
  organization_id,
  organizationId,
  entity_id = null,
  entityId = null,
  prepared_item_name,
  quantity = 1,
  reference_id = null,
}) {

  try {
    const resolvedOrganizationId =
      organization_id || organizationId;

    const resolvedEntityId =
      entity_id || entityId || null;

    if (!resolvedOrganizationId) {
      throw new Error("organization_id required");
    }

    if (!resolvedEntityId) {
      throw new Error("entity_id required");
    }

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
        "organization_id",
        resolvedOrganizationId
      )
      .eq(
        "entity_id",
        resolvedEntityId
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

          organization_id:
            resolvedOrganizationId,

          entity_id:
            resolvedEntityId,

          item_id:
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
