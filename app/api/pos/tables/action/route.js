import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {
  try {
    const body = await req.json();

    const { action, payload = {} } = body;

    if (!action) {
      return Response.json(
        { success: false, error: "Missing action" },
        { status: 400 }
      );
    }

    const tenant_id =
      payload.tenant_id ||
      payload.tenantId ||
      null;

    const organization_id =
      payload.organization_id ||
      payload.organizationId ||
      null;

    if (!tenant_id && !organization_id) {
      return Response.json(
        { success: false, error: "Missing organization/tenant context" },
        { status: 400 }
      );
    }

    let queryScope = (query) => {
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

      const query = supabaseAdmin
        .from("restaurant_tables")
        .update({
          status: "CLOSED",
          current_guests: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tableId);

      result = await queryScope(query);
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

      const query = supabaseAdmin
        .from("restaurant_tables")
        .update({
          status: guestCount > 0 ? "OCCUPIED" : "AVAILABLE",
          current_guests: guestCount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tableId);

      result = await queryScope(query);
    }

    if (action === "MERGE_TABLES") {
      const masterTableId = payload.masterTableId;
      const targetTableId = payload.targetTableId;

      if (!masterTableId || !targetTableId) {
        return Response.json(
          { success: false, error: "Missing merge table ids" },
          { status: 400 }
        );
      }

      const mergeInsert = {
        master_table_id: masterTableId,
        merged_table_id: targetTableId,
      };

      if (tenant_id) {
        mergeInsert.tenant_id = tenant_id;
      }

      const mergeResult = await supabaseAdmin
        .from("restaurant_table_merges")
        .insert(mergeInsert);

      if (mergeResult.error) {
        throw mergeResult.error;
      }

      const masterQuery = supabaseAdmin
        .from("restaurant_tables")
        .update({
          status: "OCCUPIED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", masterTableId);

      const targetQuery = supabaseAdmin
        .from("restaurant_tables")
        .update({
          status: "MERGED",
          current_guests: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetTableId);

      await queryScope(masterQuery);
      result = await queryScope(targetQuery);
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
