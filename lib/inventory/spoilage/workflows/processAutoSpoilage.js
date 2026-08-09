import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function processAutoSpoilage({
  organizationId,
} = {}) {
  try {
    if (!organizationId) {
      throw new Error("organizationId required");
    }

    const now =
      new Date().toISOString();

    const {
      data: expiredItems,
      error: expiredError,
    } = await supabaseAdmin
      .from("prepared_inventory")
      .select("*")
      .eq("organization_id", organizationId)
      .lte("expiry_date", now)
      .gt("quantity", 0);

    if (expiredError) {
      throw expiredError;
    }

    const results = [];

    for (const item of expiredItems || []) {
      const spoiledQuantity =
        Number(item.quantity || 0);

      const {
        error: updateError,
      } = await supabaseAdmin
        .from("prepared_inventory")
        .update({
          quantity: 0,
          spoilage_quantity:
            Number(item.spoilage_quantity || 0) +
            spoiledQuantity,
        })
        .eq("organization_id", organizationId)
        .eq("id", item.id);

      if (updateError) {
        throw updateError;
      }

      const {
        error: wasteError,
      } = await supabaseAdmin
        .from("waste_ledger")
        .insert([
          {
            organization_id:
              organizationId,
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

      const {
        error: ledgerError,
      } = await supabaseAdmin
        .from("inventory_ledger")
        .insert([
          {
            organization_id:
              organizationId,
            item_id:
              item.id,
            item_name:
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
