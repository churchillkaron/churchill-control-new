import { supabase } from "@/lib/shared/supabase/client";

export async function loadKitchenPerformance(
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
    );

  if (error) {

    console.error(
      "KITCHEN PERFORMANCE ERROR",
      error
    );

    return [];
  }

  const stationMap = {};

  for (const item of data || []) {

    const station =
      item.station ||
      "UNKNOWN";

    if (
      !stationMap[
        station
      ]
    ) {

      stationMap[
        station
      ] = {

        station,

        total: 0,

        ready: 0,

        pending: 0,

        preparing: 0,
      };
    }

    stationMap[
      station
    ].total += 1;

    if (
      item.status ===
      "READY"
    ) {

      stationMap[
        station
      ].ready += 1;
    }

    if (
      item.status ===
      "PENDING"
    ) {

      stationMap[
        station
      ].pending += 1;
    }

    if (
      item.status ===
      "PREPARING"
    ) {

      stationMap[
        station
      ].preparing += 1;
    }
  }

  return Object.values(
    stationMap
  );
}
