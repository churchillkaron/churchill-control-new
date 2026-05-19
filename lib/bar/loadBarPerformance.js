import { supabase } from "@/lib/shared/supabase/client";

export async function loadBarPerformance(
  tenant_id
) {

  if (!tenant_id) {
    return [];
  }

  const {
    data,
    error,
  } = await supabase
    .from(
      "kitchen_ticket_items"
    )
    .select("*")
    .eq(
      "tenant_id",
      tenant_id
    )
    .eq(
      "station",
      "BAR"
    );

  if (error) {

    console.error(
      "BAR PERFORMANCE ERROR",
      error
    );

    return [];
  }

  const stats = {

    total: 0,

    pending: 0,

    preparing: 0,

    ready: 0,

    served: 0,
  };

  for (const item of data || []) {

    stats.total += 1;

    if (
      item.status ===
      "PENDING"
    ) {

      stats.pending += 1;
    }

    if (
      item.status ===
      "PREPARING"
    ) {

      stats.preparing += 1;
    }

    if (
      item.status ===
      "READY"
    ) {

      stats.ready += 1;
    }

    if (
      item.status ===
      "SERVED"
    ) {

      stats.served += 1;
    }
  }

  return stats;
}
