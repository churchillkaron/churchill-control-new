import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function calculateVendorPerformance({
  vendor_id,
}) {

  try {

    const {
      data: prices,
      error,
    } = await supabaseAdmin
      .from("supplier_prices")
      .select("*")
      .eq(
        "vendor_id",
        vendor_id
      );

    if (error) {
      throw error;
    }

    const totalItems =
      prices?.length || 0;

    const avgPrice =
      totalItems > 0
        ? prices.reduce(
            (
              sum,
              item
            ) =>
              sum +
              Number(
                item.price || 0
              ),
            0
          ) / totalItems
        : 0;

    return {

      success: true,

      vendor_id,

      total_items:
        totalItems,

      average_price:
        Number(
          avgPrice.toFixed(2)
        ),
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
