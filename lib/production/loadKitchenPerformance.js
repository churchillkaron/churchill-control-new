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
    .from("work_center_ticket_items")
    .select(`
      id,
      status,
      work_center_id,
      work_centers (
        id,
        name
      )
    `)
    .eq(
      "tenant_id",
      tenant_id
    );

  if (error) {
    console.error(
      "WORK CENTER PERFORMANCE ERROR",
      error
    );

    return [];
  }

  const workCenterMap = {};

  for (const item of data || []) {

    const workCenter =
      item?.work_centers?.name ||
      "Unassigned";

    if (
      !workCenterMap[
        workCenter
      ]
    ) {

      workCenterMap[
        workCenter
      ] = {

        workCenter,

        total: 0,

        ready: 0,

        pending: 0,

        preparing: 0,
      };
    }

    workCenterMap[
      workCenter
    ].total += 1;

    if (
      item.status ===
      "READY"
    ) {

      workCenterMap[
        workCenter
      ].ready += 1;
    }

    if (
      item.status ===
      "PENDING"
    ) {

      workCenterMap[
        workCenter
      ].pending += 1;
    }

    if (
      item.status ===
      "PREPARING"
    ) {

      workCenterMap[
        workCenter
      ].preparing += 1;
    }
  }

  return Object.values(
    workCenterMap
  );
}
