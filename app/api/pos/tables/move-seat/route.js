import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function scoped(query, { organizationId, tenantId }) {
  if (organizationId) return query.eq("organization_id", organizationId);
  return query.eq("tenant_id", tenantId);
}

async function recalcOrder(orderId, context) {
  const { data: items, error } = await scoped(
    supabaseAdmin
      .from("order_items")
      .select("*")
      .eq("order_id", orderId),
    context
  );

  if (error) throw error;

  const total = (items || []).reduce(
    (sum, item) =>
      sum +
      Number(item.price || 0) *
        Number(item.quantity || 1),
    0
  );

  await scoped(
    supabaseAdmin
      .from("orders")
      .update({
        total,
        total_amount: total,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId),
    context
  );

  return total;
}

export async function POST(req) {
  try {
    const body = await req.json();

    const tenantId = body.tenantId || body.tenant_id || null;
    const organizationId =
      body.organizationId || body.organization_id || null;

    const fromTableId = body.fromTableId;
    const toTableId = body.toTableId;
    const seatPosition = body.seatPosition;

    if (!tenantId && !organizationId) {
      return Response.json(
        { success: false, error: "Missing tenant/organization" },
        { status: 400 }
      );
    }

    if (!fromTableId || !toTableId || !seatPosition) {
      return Response.json(
        { success: false, error: "Missing move seat data" },
        { status: 400 }
      );
    }

    const context = { tenantId, organizationId };

    const { data: sourceTable, error: sourceError } =
      await scoped(
        supabaseAdmin
          .from("restaurant_tables")
          .select("*")
          .eq("id", fromTableId),
        context
      ).single();

    if (sourceError || !sourceTable) {
      throw sourceError || new Error("Source table not found");
    }

    const { data: targetTable, error: targetError } =
      await scoped(
        supabaseAdmin
          .from("restaurant_tables")
          .select("*")
          .eq("id", toTableId),
        context
      ).single();

    if (targetError || !targetTable) {
      throw targetError || new Error("Target table not found");
    }

    const { data: sourceOrders, error: sourceOrdersError } =
      await scoped(
        supabaseAdmin
          .from("orders")
          .select("*, order_items(*)")
          .eq("table_id", fromTableId)
          .in("status", ["OPEN", "PENDING", "PREPARING"]),
        context
      );

    if (sourceOrdersError) throw sourceOrdersError;

    const seatItems =
      (sourceOrders || [])
        .flatMap((order) =>
          (order.order_items || []).map((item) => ({
            ...item,
            source_order_id: order.id,
          }))
        )
        .filter((item) => {
          const seat =
            item.seat_position ||
            item.seat_number ||
            item.modifiers?.seat;

          return String(seat) === String(seatPosition);
        });

    if (seatItems.length) {
      let { data: targetOrder, error: targetOrderError } =
        await scoped(
          supabaseAdmin
            .from("orders")
            .select("*")
            .eq("table_id", toTableId)
            .eq("status", "OPEN")
            .order("created_at", { ascending: false })
            .limit(1),
          context
        ).maybeSingle();

      if (targetOrderError) throw targetOrderError;

      if (!targetOrder) {
        const now = new Date().toISOString();

        const created = await supabaseAdmin
          .from("orders")
          .insert({
            tenant_id: tenantId,
            organization_id: organizationId,
            table_id: toTableId,
            table_number: targetTable.table_number,
            session_id:
              targetTable.active_session_id ||
              sourceTable.active_session_id ||
              null,
            total: 0,
            total_amount: 0,
            status: "OPEN",
            staff_name: "Staff",
            created_at: now,
          })
          .select()
          .single();

        if (created.error) throw created.error;
        targetOrder = created.data;
      }

      const itemIds = seatItems.map((item) => item.id);

      const { error: moveError } = await scoped(
        supabaseAdmin
          .from("order_items")
          .update({
            order_id: targetOrder.id,
            updated_at: new Date().toISOString(),
          })
          .in("id", itemIds),
        context
      );

      if (moveError) throw moveError;

      const sourceOrderIds = [
        ...new Set(seatItems.map((item) => item.source_order_id)),
      ];

      for (const orderId of sourceOrderIds) {
        await recalcOrder(orderId, context);
      }

      await recalcOrder(targetOrder.id, context);
    }

    const nextSourceGuests = Math.max(
      0,
      Number(sourceTable.current_guests || 0) - 1
    );

    const nextTargetGuests =
      Number(targetTable.current_guests || 0) + 1;

    await scoped(
      supabaseAdmin
        .from("restaurant_tables")
        .update({
          current_guests: nextSourceGuests,
          status: nextSourceGuests > 0 ? "OCCUPIED" : "AVAILABLE",
          updated_at: new Date().toISOString(),
        })
        .eq("id", fromTableId),
      context
    );

    await scoped(
      supabaseAdmin
        .from("restaurant_tables")
        .update({
          current_guests: nextTargetGuests,
          status: "OCCUPIED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", toTableId),
      context
    );

    return Response.json({
      success: true,
      movedItems: seatItems.length,
      seatPosition,
      fromTableId,
      toTableId,
    });
  } catch (error) {
    console.error("[MOVE_SEAT]", error);

    return Response.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
