import { supabaseAdmin } from "@/lib/shared/supabase/admin";

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

    const tableIds = new Set([tableId]);

    (merges || []).forEach((m) => {
      tableIds.add(m.master_table_id);
      tableIds.add(m.merged_table_id);
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

    return Response.json({
      success: true,
      merged_table_ids:
        [...tableIds],
      orders:
        orders || [],
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
