import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function execute({
  organizationId,
  station = null,
}) {

  let query =
    supabaseAdmin
      .from("kitchen_tickets")
      .select(`
        *,
        orders(
          id,
          order_number,
          table_number
        )
      `)
      .eq(
        "organization_id",
        organizationId
      )
      .neq(
        "status",
        "COMPLETED"
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

  if (station) {
    query =
      query.eq(
        "station",
        station
      );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}
