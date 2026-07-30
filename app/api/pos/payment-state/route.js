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
    const tableNumber = readValue(body, "tableNumber", "table_number");

    if (tableNumber === null || tableNumber === undefined || tableNumber === "") {
      return Response.json(
        { success: false, error: "Missing tableNumber" },
        { status: 400 }
      );
    }

    const { data: table, error: tableError } = await supabaseAdmin
      .from("restaurant_tables")
      .select("id, table_number, table_name, active_session_id, status")
      .eq("organization_id", organizationId)
      .eq("table_number", tableNumber)
      .maybeSingle();

    if (tableError) throw tableError;

    if (!table) {
      return Response.json(
        { success: false, error: "Restaurant table not found" },
        { status: 404 }
      );
    }

    const { data: mergeRows, error: mergeError } = await supabaseAdmin
      .from("restaurant_table_merges")
      .select("master_table_id, merged_table_id")
      .eq("organization_id", organizationId)
      .or(`master_table_id.eq.${table.id},merged_table_id.eq.${table.id}`);

    if (mergeError) throw mergeError;

    let effectiveTableId = table.id;
    const parentMerge = (mergeRows || []).find(
      (row) => row.merged_table_id === table.id
    );

    if (parentMerge) effectiveTableId = parentMerge.master_table_id;

    const { data: childMerges, error: childMergeError } = await supabaseAdmin
      .from("restaurant_table_merges")
      .select("merged_table_id")
      .eq("organization_id", organizationId)
      .eq("master_table_id", effectiveTableId);

    if (childMergeError) throw childMergeError;

    const tableIds = [
      effectiveTableId,
      ...(childMerges || []).map((row) => row.merged_table_id),
    ];

    const { data: sessions, error: sessionError } = await supabaseAdmin
      .from("table_sessions")
      .select("*")
      .eq("organization_id", organizationId)
      .in("table_id", tableIds)
      .not("status", "in", "(CLOSED,COMPLETED,CANCELLED)")
      .order("created_at", { ascending: false });

    if (sessionError) throw sessionError;

    const session = (sessions || [])[0] || null;

    const { data: orders, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(`
        *,
        order_items(*)
      `)
      .eq("organization_id", organizationId)
      .in("table_id", tableIds)
      .not("status", "in", "(CANCELLED,VOID)")
      .order("created_at", { ascending: true });

    if (orderError) throw orderError;

    const persistedOrders = orders || [];
    const orderIds = persistedOrders.map((order) => order.id);
    const sessionIds = [...new Set(
      persistedOrders.map((order) => order.session_id).filter(Boolean)
    )];

    let payments = [];

    if (orderIds.length || sessionIds.length) {
      let query = supabaseAdmin
        .from("payments")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("status", "PAID");

      if (orderIds.length && sessionIds.length) {
        query = query.or(
          `order_id.in.(${orderIds.join(",")}),session_id.in.(${sessionIds.join(",")})`
        );
      } else if (orderIds.length) {
        query = query.in("order_id", orderIds);
      } else {
        query = query.in("session_id", sessionIds);
      }

      const paymentResult = await query.order("paid_at", { ascending: true });
      if (paymentResult.error) throw paymentResult.error;
      payments = paymentResult.data || [];
    }

    const items = persistedOrders.flatMap((order) =>
      (order.order_items || []).map((item) => ({
        ...item,
        order_id: order.id,
        session_id: order.session_id,
      }))
    );
    const subtotal = persistedOrders.reduce(
      (sum, order) => sum + numeric(order.subtotal),
      0
    );
    const serviceCharge = persistedOrders.reduce(
      (sum, order) => sum + numeric(order.service_charge_amount),
      0
    );
    const tax = persistedOrders.reduce(
      (sum, order) => sum + numeric(order.vat_amount || order.tax_amount),
      0
    );
    const discount = persistedOrders.reduce(
      (sum, order) => sum + numeric(order.discount_amount),
      0
    );
    const total = persistedOrders.reduce(
      (sum, order) => sum + numeric(order.total_amount || order.total),
      0
    );
    const paidAmount = payments.reduce(
      (sum, payment) => sum + numeric(payment.amount),
      0
    );
    const remainingBalance = Math.max(
      0,
      Number((total - paidAmount).toFixed(2))
    );

    return Response.json({
      success: true,
      state: {
        table,
        effectiveTableId,
        mergedTableIds: tableIds,
        session: session || {
          table_id: effectiveTableId,
          table_number: table.table_number,
        },
        orders: persistedOrders,
        items,
        payments,
        subtotal: Number(subtotal.toFixed(2)),
        serviceCharge: Number(serviceCharge.toFixed(2)),
        tax: Number(tax.toFixed(2)),
        discount: Number(discount.toFixed(2)),
        total: Number(total.toFixed(2)),
        paidAmount: Number(paidAmount.toFixed(2)),
        remainingBalance,
      },
    });
  } catch (error) {
    console.error("POS PAYMENT STATE ERROR", error);

    return Response.json(
      {
        success: false,
        error: error?.message || "Unable to load payment state",
      },
      { status: 500 }
    );
  }
}
