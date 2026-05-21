import { supabase } from "@/lib/shared/supabase/client";

export async function updateKitchenStatus({
  orderId,
  status,
}) {

  const updates = {
    kitchen_status: status,
  };

  // ===== STARTED =====
  if (
    status ===
    "PREPARING"
  ) {
    updates.started_at =
      new Date();
  }

  // ===== COMPLETED =====
  if (
    status === "READY" ||
    status === "SERVED"
  ) {
    updates.completed_at =
      new Date();
  }

  const {
    error,
  } = await supabase
    .from("orders")
    .update(updates)
    .eq("id", orderId);

  if (error) {

    console.error(
      "KITCHEN STATUS ERROR",
      error
    );

    throw error;
  }

  return true;
}
