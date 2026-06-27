import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function approvePurchaseOrder({
  purchase_order_id,
  approved_by = "MANAGER",
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("purchase_orders")
      .update({

        status:
          "APPROVED",

        approved_by,

        approved_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        purchase_order_id
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {

      success: true,

      purchase_order:
        data,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
