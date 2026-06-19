import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import calculateOrderTotals from "@/lib/pos/orders/calculateOrderTotals";

export async function POST(req) {
  try {
    const {
      tableId,
      organization_id,
      tenant_id,
    } = await req.json();

    if (!tableId) {
      return Response.json(
        {
          success: false,
          error: "Missing tableId"
        },
        { status: 400 }
      );
    }

    let mergeQuery =
      supabaseAdmin
        .from("restaurant_table_merges")
        .select(
          "master_table_id, merged_table_id"
        )
        .or(
          `master_table_id.eq.${tableId},merged_table_id.eq.${tableId}`
        );

    if (organization_id) {
      mergeQuery =
        mergeQuery.eq(
          "organization_id",
          organization_id
        );
    } else if (tenant_id) {
      mergeQuery =
        mergeQuery.eq(
          "tenant_id",
          tenant_id
        );
    }

    const {
      data: merges,
      error: mergeError,
    } = await mergeQuery;

    if (mergeError) {
      throw mergeError;
    }

    let effectiveTableId = tableId;

    const mergedRow =
      (merges || []).find(
        (m) => m.merged_table_id === tableId
      );

    if (mergedRow) {
      effectiveTableId =
        mergedRow.master_table_id;
    }

    const tableIds = new Set([
      effectiveTableId
    ]);

    (merges || []).forEach((m) => {
      if (
        m.master_table_id ===
        effectiveTableId
      ) {
        tableIds.add(
          m.merged_table_id
        );
      }
    });

    let orderQuery =
      supabaseAdmin
        .from("orders")
        .select(`
          *,
          order_items(*)
        `)
        .in(
          "table_id",
          [...tableIds]
        )
        .in("status", [
          "OPEN",
          "PENDING",
          "PREPARING"
        ]);

    if (organization_id) {
      orderQuery =
        orderQuery.eq(
          "organization_id",
          organization_id
        );
    } else if (tenant_id) {
      orderQuery =
        orderQuery.eq(
          "tenant_id",
          tenant_id
        );
    }

    const {
      data: orders,
      error,
    } = await orderQuery;

    if (error) throw error;

    const items =
      (orders || []).flatMap(
        order => order.order_items || []
      );

    const totals =
      calculateOrderTotals({
        items,
        taxRate: 7,
        serviceChargeRate: 5,
      });

    const subtotal =
      totals.subtotal;

    const vat =
      totals.tax;

    const service =
      totals.service_charge;

    const total =
      totals.total;

    return Response.json({
      success: true,
      effective_table_id:
        effectiveTableId,
      merged_table_ids:
        [...tableIds],
      orders:
        orders || [],

      summary: {
        subtotal,
        vat,
        service,
        total,
        item_count: items.length,
      },
    });

  } catch (err) {
    return Response.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 }
    );
  }
}
