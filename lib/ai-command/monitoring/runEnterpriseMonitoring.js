import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function runEnterpriseMonitoring({
  tenant_id,
}) {

  try {

    // ===== ACTIVE ORDERS =====
    const {
      data: activeOrders,
    } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      )
      .eq(
        "status",
        "ACTIVE"
      );

    // ===== OPEN PAYABLES =====
    const {
      data: payables,
    } = await supabaseAdmin
      .from("accounts_payable")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      )
      .neq(
        "status",
        "PAID"
      );

    // ===== LOW STOCK =====
    const {
      data: ingredients,
    } = await supabaseAdmin
      .from("ingredients")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      );

    const lowStock =
      (ingredients || []).filter(
        (
          ingredient
        ) =>
          Number(
            ingredient.quantity || 0
          ) < 10
      );

    return {

      success: true,

      monitoring: {

        active_orders:
          activeOrders?.length || 0,

        open_payables:
          payables?.length || 0,

        low_stock_items:
          lowStock.length,

        low_stock:
          lowStock,
      },
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
