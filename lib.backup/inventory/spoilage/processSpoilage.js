import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function processSpoilage({
  prepared_inventory_id,
  spoilage_quantity,
  reason = "EXPIRED",
}) {

  try {

    const {
      data: item,
      error: itemError,
    } = await supabaseAdmin
      .from(
        "prepared_inventory"
      )
      .select("*")
      .eq(
        "id",
        prepared_inventory_id
      )
      .single();

    if (itemError) {
      throw itemError;
    }

    const currentQuantity =
      Number(
        item.quantity || 0
      );

    const spoilage =
      Number(
        spoilage_quantity || 0
      );

    const remaining =
      currentQuantity -
      spoilage;

    // ===== UPDATE INVENTORY =====
    const {
      error: updateError,
    } = await supabaseAdmin
      .from(
        "prepared_inventory"
      )
      .update({

        quantity:
          remaining,
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
            spoilage,

          reason,

          created_at:
            new Date().toISOString(),
        },
      ]);

    if (wasteError) {
      throw wasteError;
    }

    return {

      success: true,

      spoiled:
        spoilage,

      remaining,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
