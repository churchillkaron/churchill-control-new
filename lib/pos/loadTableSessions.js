import { supabase } from "@/lib/shared/supabase/client";

export async function loadTableSessions(
  tenantId
) {

  const {
    data,
    error,
  } = await supabase
    .from("table_sessions")
    .select("*")
    .eq(
      "tenant_id",
      tenantId
    )
    .eq(
      "status",
      "ACTIVE"
    );

  if (error) {
    console.error(
      "LOAD TABLE SESSIONS ERROR",
      error
    );

    return {};
  }

  const formatted = {};

  data.forEach(
    (session) => {

      formatted[
        session.table_number
      ] = {
        id: session.id,

        startedAt:
          new Date(
            session.started_at
          ).getTime(),

        guests:
          session.guests || 0,

        orders:
          session.orders || 0,

        revenue:
          session.revenue || 0,
      };
    }
  );

  return formatted;
}
