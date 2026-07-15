import { supabase } from "@/lib/shared/supabase/client";

export async function loadStaffPerformance(
  tenant_id
) {

  if (!tenant_id) {
    return [];
  }

  const {
    data: orders,
  } = await supabase
    .from("orders")
    .select("*")
    .eq(
      "tenant_id",
      tenant_id
    )
    .eq(
      "status",
      "PAID"
    );

  const map = {};

  for (const order of orders || []) {

    const staff =
      order.staff_name ||
      "UNKNOWN";

    if (!map[staff]) {

      map[staff] = {

        name: staff,

        orders: 0,

        revenue: 0,
      };
    }

    map[staff].orders += 1;

    map[staff].revenue +=
      Number(
        order.total_amount || 0
      );
  }

  const result =
    Object.values(map);

  return result.sort(
    (
      a,
      b
    ) =>
      b.revenue -
      a.revenue
  );
}
