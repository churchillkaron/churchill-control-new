export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function readValue(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const requestedOrganizationId = readValue(
      body,
      "organizationId",
      "organization_id"
    );
    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
    });

    if (!access.success) {
      return Response.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
      );
    }

    const organizationId = access.organizationId;
    const tableId = readValue(body, "tableId", "table_id");

    if (!tableId) {
      return Response.json(
        { success: false, error: "Missing tableId" },
        { status: 400 }
      );
    }

    const { data: selectedTable, error: tableError } = await supabaseAdmin
      .from("restaurant_tables")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("id", tableId)
      .maybeSingle();

    if (tableError) throw tableError;

    if (!selectedTable) {
      return Response.json(
        { success: false, error: "Restaurant table not found" },
        { status: 404 }
      );
    }

    const { data: merges, error: mergeError } = await supabaseAdmin
      .from("restaurant_table_merges")
      .select("master_table_id, merged_table_id")
      .eq("organization_id", organizationId)
      .or(`master_table_id.eq.${tableId},merged_table_id.eq.${tableId}`);

    if (mergeError) throw mergeError;

    let effectiveTableId = tableId;
    const mergedRow = (merges || []).find(
      (row) => row.merged_table_id === tableId
    );

    if (mergedRow) {
      effectiveTableId = mergedRow.master_table_id;
    }

    const tableIds = new Set([effectiveTableId]);

    (merges || []).forEach((row) => {
      if (row.master_table_id === effectiveTableId) {
        tableIds.add(row.merged_table_id);
      }
    });

    const { data: relatedMerges, error: relatedMergeError } =
      await supabaseAdmin
        .from("restaurant_table_merges")
        .select("master_table_id, merged_table_id")
        .eq("organization_id", organizationId)
        .eq("master_table_id", effectiveTableId);

    if (relatedMergeError) throw relatedMergeError;

    (relatedMerges || []).forEach((row) => {
      tableIds.add(row.merged_table_id);
    });

    const { data: orders, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(`
        *,
        order_items(*)
      `)
      .eq("organization_id", organizationId)
      .in("table_id", [...tableIds])
      .in("status", ["OPEN", "PENDING", "PREPARING"])
      .order("created_at", { ascending: true });

    if (orderError) throw orderError;

    const persistedOrders = orders || [];
    const items = persistedOrders.flatMap(
      (order) => order.order_items || []
    );
    const subtotal = persistedOrders.reduce(
      (sum, order) => sum + numeric(order.subtotal),
      0
    );
    const service = persistedOrders.reduce(
      (sum, order) =>
        sum + numeric(order.service_charge_amount || order.service_charge),
      0
    );
    const vat = persistedOrders.reduce(
      (sum, order) => sum + numeric(order.vat_amount || order.tax_amount),
      0
    );
    const discount = persistedOrders.reduce(
      (sum, order) => sum + numeric(order.discount_amount),
      0
    );
    const total = persistedOrders.reduce(
      (sum, order) =>
        sum + numeric(order.total_amount || order.total),
      0
    );

    return Response.json({
      success: true,
      effective_table_id: effectiveTableId,
      merged_table_ids: [...tableIds],
      orders: persistedOrders,
      summary: {
        subtotal: Number(subtotal.toFixed(2)),
        service: Number(service.toFixed(2)),
        vat: Number(vat.toFixed(2)),
        discount: Number(discount.toFixed(2)),
        total: Number(total.toFixed(2)),
        item_count: items.length,
      },
    });
  } catch (error) {
    console.error("OPEN TABLE ERROR", error);

    return Response.json(
      {
        success: false,
        error: error?.message || "Unable to open table",
      },
      { status: 500 }
    );
  }
}
