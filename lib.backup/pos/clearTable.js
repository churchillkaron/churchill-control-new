import { supabase } from "@/lib/shared/supabase/client";

export async function clearTable({
  table,
  tenant_id,
}) {

  // ===== CLOSE SESSION =====
  const {
    error: sessionError,
  } = await supabase
    .from("table_sessions")
    .update({
      status: "CLOSED",
      closed_at:
        new Date(),
    })
    .eq(
      "tenant_id",
      tenant_id
    )
    .eq(
      "table_number",
      table
    )
    .eq(
      "status",
      "ACTIVE"
    );

  if (sessionError) {
    console.error(
      "CLEAR TABLE ERROR",
      sessionError
    );

    throw sessionError;
  }

  // ===== COMPLETE ORDERS =====
  const {
    error: orderError,
  } = await supabase
    .from("orders")
    .update({
      status:
        "COMPLETED",
    })
    .eq(
      "tenant_id",
      tenant_id
    )
    .eq(
      "table_number",
      table
    )
    .eq(
      "status",
      "ACTIVE"
    );

  if (orderError) {
    console.error(
      "ORDER COMPLETE ERROR",
      orderError
    );

    throw orderError;
  }

  return true;
}
