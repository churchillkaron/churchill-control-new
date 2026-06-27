import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createSupplierPrice({
  tenant_id,
  vendor_id,
  ingredient_id,
  price,
  minimum_order_quantity = 1,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("supplier_prices")
      .insert([
        {

          tenant_id,

          vendor_id,

          ingredient_id,

          price,

          minimum_order_quantity,

          created_at:
            new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {

      success: true,

      supplier_price:
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
