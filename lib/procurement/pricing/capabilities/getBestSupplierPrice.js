import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export default async function getBestSupplierPrice({
  item_id,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin

      .from("supplier_prices")

      .select(`
        *,
        parties (
          id,
          display_name,
          legal_name,
          risk_level,
          is_active,
          is_blocked
        )
      `)

      .eq(
        "item_id",
        item_id
      )

      .order(
        "price",
        {
          ascending: true,
        }
      )

      .limit(1)

      .single();

    if (error) {

      throw error;

    }

    return {

      success: true,

      best_supplier:
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
