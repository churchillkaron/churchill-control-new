import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {
  try {
    const body = await req.json();

    const { action, payload = {} } = body;

    const tenant_id =
      payload.tenant_id ||
      payload.tenantId ||
      null;

    const organization_id =
      payload.organization_id ||
      payload.organizationId ||
      null;

    if (!action) {
      return Response.json(
        { success: false, error: "Missing action" },
        { status: 400 }
      );
    }

    if (!tenant_id && !organization_id) {
      return Response.json(
        { success: false, error: "Missing organization/tenant context" },
        { status: 400 }
      );
    }

    const scoped = (query) => {
      if (organization_id) {
        return query.eq("organization_id", organization_id);
      }

      return query.eq("tenant_id", tenant_id);
    };

    let result = null;

    if (action === "CLOSE_TABLE") {
      const tableId = payload.tableId;

      if (!tableId) {
        return Response.json(
          { success: false, error: "Missing tableId" },
          { status: 400 }
        );
      }

      result = await scoped(
        supabaseAdmin
          .from("restaurant_tables")
          .update({
            status: "CLOSED",
            current_guests: 0,
            updated_at: new Date().toISOString(),
          })
          .eq("id", tableId)
      );
    }

    if (action === "MOVE_GUESTS") {
      const tableId = payload.tableId;
      const guestCount = Number(payload.guestCount || 0);

      if (!tableId) {
        return Response.json(
          { success: false, error: "Missing tableId" },
          { status: 400 }
        );
      }

      result = await scoped(
        supabaseAdmin
          .from("restaurant_tables")
          .update({
            status: guestCount > 0 ? "OCCUPIED" : "AVAILABLE",
            current_guests: guestCount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", tableId)
      );
    }


    if (action === "TRANSFER_TABLE") {
      const fromTableId = payload.fromTableId;
      const toTableId = payload.toTableId;

      if (!fromTableId || !toTableId) {
        return Response.json(
          {
            success: false,
            error: "Missing transfer table ids"
          },
          { status: 400 }
        );
      }

      if (fromTableId === toTableId) {
        return Response.json(
          {
            success: false,
            error: "Cannot transfer into same table"
          },
          { status: 400 }
        );
      }

      const { data: sourceTable, error: sourceError } =
        await scoped(
          supabaseAdmin
            .from("restaurant_tables")
            .select("id, current_guests, active_session_id")
            .eq("id", fromTableId)
        ).single();

      if (sourceError || !sourceTable) {
        throw sourceError || new Error("Source table not found");
      }

      const { data: destinationTable, error: destinationError } =
        await scoped(
          supabaseAdmin
            .from("restaurant_tables")
            .select("id, table_number, current_guests")
            .eq("id", toTableId)
        ).single();

      if (destinationError || !destinationTable) {
        throw destinationError || new Error("Destination table not found");
      }

      const { error: moveOrderError } =
        await scoped(
          supabaseAdmin
            .from("orders")
            .update({
              table_id: toTableId,
              table_number: destinationTable.table_number,
            })
            .eq("table_id", fromTableId)
            .in("status", ["OPEN", "PENDING", "PREPARING"])
        );

      if (moveOrderError) {
        throw moveOrderError;
      }

      const totalGuests =
        Number(destinationTable.current_guests || 0) +
        Number(sourceTable.current_guests || 0);

      await scoped(
        supabaseAdmin
          .from("restaurant_tables")
          .update({
            status: "OCCUPIED",
            current_guests: totalGuests,
            active_session_id: sourceTable.active_session_id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", toTableId)
      );

      await scoped(
        supabaseAdmin
          .from("restaurant_tables")
          .update({
            status: "AVAILABLE",
            current_guests: 0,
            active_session_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", fromTableId)
      );

      result = {
        fromTableId,
        toTableId,
      };
    }

    if (action === "MERGE_TABLES") {
      const sourceTableId = payload.masterTableId;
      const destinationTableId = payload.targetTableId;

      if (!sourceTableId || !destinationTableId) {
        return Response.json(
          { success: false, error: "Missing merge table ids" },
          { status: 400 }
        );
      }

      if (sourceTableId === destinationTableId) {
        return Response.json(
          { success: false, error: "Cannot merge table into itself" },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();

      const { data: destinationTable, error: destinationError } =
        await scoped(
          supabaseAdmin
            .from("restaurant_tables")
            .select("id, table_number, current_guests, active_session_id")
            .eq("id", destinationTableId)
        ).single();

      if (destinationError || !destinationTable) {
        throw destinationError || new Error("Destination table not found");
      }

      const { data: sourceTable, error: sourceError } =
        await scoped(
          supabaseAdmin
            .from("restaurant_tables")
            .select("id, table_number, current_guests, active_session_id")
            .eq("id", sourceTableId)
        ).single();

      if (sourceError || !sourceTable) {
        throw sourceError || new Error("Source table not found");
      }

      const { data: childMerges, error: childMergeError } =
        await scoped(
          supabaseAdmin
            .from("restaurant_table_merges")
            .select("merged_table_id")
            .eq("master_table_id", sourceTableId)
        );

      if (childMergeError) {
        throw childMergeError;
      }

      const sourceGroupIds = [
        sourceTableId,
        ...((childMerges || []).map((m) => m.merged_table_id)),
      ];

      const allOrderTableIds = [
        destinationTableId,
        ...sourceGroupIds,
      ];

      const cleanMergeIds = [
        ...new Set(sourceGroupIds)
      ].filter((id) => id !== destinationTableId);

      const { data: openOrders, error: openOrdersError } =
        await scoped(
          supabaseAdmin
            .from("orders")
            .select("*, order_items(*)")
            .in("table_id", allOrderTableIds)
            .in("status", ["OPEN", "PENDING", "PREPARING"])
            .order("created_at", { ascending: true })
        );

      if (openOrdersError) {
        throw openOrdersError;
      }

      let masterOrder =
        (openOrders || []).find(
          (order) =>
            order.table_id === destinationTableId &&
            order.status === "OPEN"
        ) || null;

      if (!masterOrder && (openOrders || []).length > 0) {
        masterOrder = openOrders[0];

        const { error: masterMoveError } =
          await scoped(
            supabaseAdmin
              .from("orders")
              .update({
                table_id: destinationTableId,
                table_number: destinationTable.table_number,
                status: "OPEN",
                updated_at: now,
              })
              .eq("id", masterOrder.id)
          );

        if (masterMoveError) {
          throw masterMoveError;
        }
      }

      if (!masterOrder) {
        const created =
          await supabaseAdmin
            .from("orders")
            .insert({
              tenant_id: tenant_id || null,
              organization_id: organization_id || null,
              table_id: destinationTableId,
              table_number: destinationTable.table_number,
              session_id:
                destinationTable.active_session_id ||
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

        if (created.error) {
          throw created.error;
        }

        masterOrder = created.data;
      }

      const sourceOrders =
        (openOrders || []).filter(
          (order) => order.id !== masterOrder.id
        );

      const sourceOrderIds =
        sourceOrders.map((order) => order.id);

      const itemIdsToMove =
        sourceOrders.flatMap((order) =>
          (order.order_items || []).map((item) => item.id)
        );

      if (itemIdsToMove.length > 0) {
        const { error: itemMoveError } =
          await scoped(
            supabaseAdmin
              .from("order_items")
              .update({
                order_id: masterOrder.id,
                updated_at: now,
              })
              .in("id", itemIdsToMove)
          );

        if (itemMoveError) {
          throw itemMoveError;
        }
      }

      if (sourceOrderIds.length > 0) {
        const { error: closeSourceOrdersError } =
          await scoped(
            supabaseAdmin
              .from("orders")
              .update({
                status: "CLOSED",
                total: 0,
                total_amount: 0,
                updated_at: now,
              })
              .in("id", sourceOrderIds)
          );

        if (closeSourceOrdersError) {
          throw closeSourceOrdersError;
        }
      }

      const { data: masterItems, error: masterItemsError } =
        await scoped(
          supabaseAdmin
            .from("order_items")
            .select("*")
            .eq("order_id", masterOrder.id),
        );

      if (masterItemsError) {
        throw masterItemsError;
      }

      const masterTotal =
        (masterItems || []).reduce(
          (sum, item) =>
            sum +
            Number(item.price || 0) *
              Number(item.quantity || 1),
          0
        );

      const { error: masterUpdateError } =
        await scoped(
          supabaseAdmin
            .from("orders")
            .update({
              table_id: destinationTableId,
              table_number: destinationTable.table_number,
              total: masterTotal,
              total_amount: masterTotal,
              status: "OPEN",
              updated_at: now,
            })
            .eq("id", masterOrder.id)
        );

      if (masterUpdateError) {
        throw masterUpdateError;
      }

      await supabaseAdmin
        .from("restaurant_table_merges")
        .delete()
        .in("merged_table_id", cleanMergeIds);

      if (cleanMergeIds.length > 0) {
        const mergeRows = cleanMergeIds.map((id) => ({
          tenant_id: tenant_id || null,
          organization_id: organization_id || null,
          master_table_id: destinationTableId,
          merged_table_id: id,
        }));

        const { error: mergeInsertError } =
          await supabaseAdmin
            .from("restaurant_table_merges")
            .insert(mergeRows);

        if (mergeInsertError) {
          throw mergeInsertError;
        }
      }

      const totalGuests =
        Number(destinationTable.current_guests || 0) +
        Number(sourceTable.current_guests || 0);

      const { error: destinationUpdateError } =
        await scoped(
          supabaseAdmin
            .from("restaurant_tables")
            .update({
              status: "OCCUPIED",
              current_guests: totalGuests,
              updated_at: now,
            })
            .eq("id", destinationTableId)
        );

      if (destinationUpdateError) {
        throw destinationUpdateError;
      }

      const { error: sourceUpdateError } =
        await scoped(
          supabaseAdmin
            .from("restaurant_tables")
            .update({
              status: "MERGED",
              current_guests: 0,
              active_session_id: null,
              updated_at: now,
            })
            .in("id", sourceGroupIds)
        );

      if (sourceUpdateError) {
        throw sourceUpdateError;
      }

      result = {
        sourceTableId,
        destinationTableId,
        masterOrderId: masterOrder.id,
        movedItems: itemIdsToMove.length,
        closedOrders: sourceOrderIds.length,
        movedTableIds: sourceGroupIds,
      };
    }

    return Response.json({
      success: true,
      data: result,
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
