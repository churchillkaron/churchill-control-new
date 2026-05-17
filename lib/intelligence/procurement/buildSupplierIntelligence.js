import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildSupplierIntelligence({
  tenant_id,
}) {

  try {

    const {
      data: purchaseOrders,
      error,
    } = await supabaseAdmin
      .from("purchase_orders")
      .select(`
        id,
        supplier_name,
        total_amount,
        status,
        created_at
      `)
      .eq(
        "tenant_id",
        tenant_id
      )
      .limit(500);

    if (error) {
      throw error;
    }

    const supplierMap = {};

    for (const po of purchaseOrders || []) {

      const supplier =
        po.supplier_name ||
        "UNKNOWN";

      if (
        !supplierMap[
          supplier
        ]
      ) {

        supplierMap[
          supplier
        ] = {

          supplier,

          total_orders: 0,

          total_spend: 0,

          approved_orders: 0,

          pending_orders: 0,
        };
      }

      supplierMap[
        supplier
      ].total_orders += 1;

      supplierMap[
        supplier
      ].total_spend +=
        Number(
          po.total_amount || 0
        );

      if (
        po.status ===
        "approved"
      ) {

        supplierMap[
          supplier
        ].approved_orders += 1;
      }

      if (
        po.status ===
        "pending"
      ) {

        supplierMap[
          supplier
        ].pending_orders += 1;
      }
    }

    const suppliers =
      Object.values(
        supplierMap
      ).sort(
        (a, b) =>
          b.total_spend -
          a.total_spend
      );

    return {
      success: true,

      suppliers,

      total_suppliers:
        suppliers.length,

      generated_at:
        new Date().toISOString(),
    };

  } catch (error) {

    return {
      success: false,

      error:
        error.message,
    };
  }
}
