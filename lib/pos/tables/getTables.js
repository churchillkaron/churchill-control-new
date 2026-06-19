import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function getTables({
  tenant_id,
  organization_id,
}) {
  try {

    let query = supabaseAdmin
      .from("restaurant_tables")
      .select(`
        id,
        tenant_id,
        organization_id,
        table_name,
        table_number,
        capacity,
        status,
        current_guests,
        active_session_id,
        zone_id,
        created_at,
        updated_at
      `)
      .order("table_number", {
        ascending: true,
      });

    if (organization_id) {
      query = query.eq(
        "organization_id",
        organization_id
      );
    } else {
      query = query.eq(
        "tenant_id",
        tenant_id
      );
    }

    const {
      data: tables,
      error,
    } = await query;

    if (error) throw error;

    const sessionIds =
      (tables || [])
        .map(
          t => t.active_session_id
        )
        .filter(Boolean);

    let orders = [];

    if (sessionIds.length) {

      const result =
        await supabaseAdmin
          .from("orders")
          .select(`
            id,
            session_id,
            final_amount,
            total,
            status
          `)
          .in(
            "session_id",
            sessionIds
          );

      if (result.error) {
        throw result.error;
      }

      orders =
        result.data || [];
    }

    const tablesWithTotals =
      (tables || []).map(table => {

        const sessionOrders =
          orders.filter(
            order =>
              order.session_id ===
              table.active_session_id
          );

        const total =
          sessionOrders.reduce(
            (sum, order) =>
              sum +
              Number(
                order.final_amount ||
                order.total ||
                0
              ),
            0
          );

        return {
          ...table,
          status:
            (table.active_session_id || total > 0)
              ? "OCCUPIED"
              : "AVAILABLE",
          current_guests:
            table.current_guests || 1,
          total,
        };
      });

    return {
      success: true,
      tables: tablesWithTotals,
    };

  } catch (error) {

    return {
      success: false,
      error: error.message,
    };

  }
}
