import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function processAutoSpoilage() {

  try {

    const now =
      new Date().toISOString();

    // ===== FIND EXPIRED =====
    const {
      data: expiredItems,
      error: expiredError,
    } = await supabaseAdmin
      .from(
        "prepared_inventory"
      )
      .select("*")
      .lte(
        "expiry_date",
        now
      )
      .gt(
        "quantity",
        0
      );

    if (expiredError) {
      throw expiredError;
    }

    const results = [];

    for (const item of expiredItems || []) {

      const spoiledQuantity =
        Number(
          item.quantity || 0
        );

      // ===== ZERO INVENTORY =====
      const {
        error: updateError,
      } = await supabaseAdmin
        .from(
          "prepared_inventory"
        )
        .update({

          quantity: 0,

          spoilage_quantity:
            Number(
              item.spoilage_quantity || 0
            ) + spoiledQuantity,
        })
        .eq(
          "id",
          item.id
        );

      if (updateError) {
        throw updateError;
      }

      // ===== WASTE LEDGER =====
      const {
        error: wasteError,
      } = await supabaseAdmin
        .from(
          "waste_ledger"
        )
        .insert([
          {

            tenant_id:
              item.tenant_id,

            batch_id:
              item.batch_id,

            quantity:
              spoiledQuantity,

            reason:
              "AUTO_EXPIRY_SPOILAGE",

            created_at:
              new Date().toISOString(),
          },
        ]);

      if (wasteError) {
        throw wasteError;
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

            tenant_id:
              item.tenant_id,

            ingredient_id:
              item.id,

            ingredient_name:
              item.item_name,

            movement_type:
              "AUTO_SPOILAGE",

            quantity:
              spoiledQuantity,

            previous_quantity:
              spoiledQuantity,

            new_quantity: 0,

            reference_type:
              "PREPARED_INVENTORY",

            reference_id:
              item.id,

            created_at:
              new Date().toISOString(),
          },
        ]);

      if (ledgerError) {
        throw ledgerError;
      }

      results.push({

        item_name:
          item.item_name,

        spoiled:
          spoiledQuantity,
      });
    }

    return {

      success: true,

      processed:
        results.length,

      results,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
