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
            .select("id, current_guests")
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
          {
            success: false,
            error: "Cannot merge table into itself"
          },
          { status: 400 }
        );
      }

      const { data: destinationTable, error: destinationError } =
        await scoped(
          supabaseAdmin
            .from("restaurant_tables")
            .select("id, table_number, current_guests")
            .eq("id", destinationTableId)
        ).single();

      if (destinationError || !destinationTable) {
        throw destinationError || new Error("Destination table not found");
      }

      const { data: sourceTable, error: sourceError } =
        await scoped(
          supabaseAdmin
            .from("restaurant_tables")
            .select("id, current_guests")
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
      ].filter(
        (id) => id !== destinationTableId
      );

      const mergeRows = cleanMergeIds.map((id) => ({
        tenant_id: tenant_id || null,
        organization_id: organization_id || null,
        master_table_id: destinationTableId,
        merged_table_id: id,
      }));

      await supabaseAdmin
        .from("restaurant_table_merges")
        .delete()
        .in(
          "merged_table_id",
          cleanMergeIds
        );

      const { error: mergeInsertError } =
        await supabaseAdmin
          .from("restaurant_table_merges")
          .insert(mergeRows);

      if (mergeInsertError) {
        throw mergeInsertError;
      }

      const { error: moveOrderError } =
        await scoped(
          supabaseAdmin
            .from("orders")
            .update({
              table_id: destinationTableId,
              table_number: destinationTable.table_number,
            })
            .in("table_id", allOrderTableIds)
            .in("status", ["OPEN", "PENDING", "PREPARING"])
        );

      if (moveOrderError) {
        throw moveOrderError;
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
              updated_at: new Date().toISOString(),
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
              updated_at: new Date().toISOString(),
            })
            .in("id", sourceGroupIds)
        );

      if (sourceUpdateError) {
        throw sourceUpdateError;
      }

      result = {
        sourceTableId,
        destinationTableId,
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
