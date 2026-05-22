import { getServiceSupabase }
from "@/lib/shared/supabase/service";

const supabase =
  getServiceSupabase();

export default async function closeTableSession({
  tenantId,
  tableNumber,
}) {

  // =========================
  // ACTIVE SESSION
  // =========================

  const {
    data: sessions,
    error: sessionError,
  } = await supabase

    .from("table_sessions")

    .select("*")

    .eq(
      "tenant_id",
      tenantId
    )

    .eq(
      "table_number",
      tableNumber
    )

    .in(
      "status",
      [
        "OPEN",
        "ACTIVE",
        "OCCUPIED",
      ]
    )

    .limit(1);

  if (sessionError) {
    throw sessionError;
  }

  if (
    !sessions ||
    !sessions.length
  ) {

    return {
      success: false,
    };

  }

  const session =
    sessions[0];

  // =========================
  // ORDERS
  // =========================

  const {
    data: orders,
    error: orderError,
  } = await supabase

    .from("orders")

    .select("*")

    .eq(
      "table_number",
      tableNumber
    );

  if (orderError) {
    throw orderError;
  }

  const revenue =
    (orders || []).reduce(
      (
        sum,
        order
      ) =>

        sum +

        Number(
          order.total_amount || 0
        ),

      0
    );

  // =========================
  // CLOSE SESSION
  // =========================

  const {
    error: updateError,
  } = await supabase

    .from("table_sessions")

    .update({

      status:
        "CLOSED",

      revenue,

      orders:
        (orders || []).length,

      closed_at:
        new Date().toISOString(),

    })

    .eq(
      "id",
      session.id
    );

  if (updateError) {
    throw updateError;
  }

  return {

    success: true,

  };

}
