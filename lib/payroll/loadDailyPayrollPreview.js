import { supabase } from "@/lib/shared/supabase/client";

export async function loadDailyPayrollPreview(
  tenant_id
) {

  if (!tenant_id) {
    return [];
  }

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  // ===== PAID ORDERS =====
  const {
    data: orders,
    error,
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
    )
    .gte(
      "paid_at",
      today.toISOString()
    );

  if (error) {

    console.error(
      "PAYROLL PREVIEW ERROR",
      error
    );

    return [];
  }

  // ===== SERVICE CHARGE =====
  const totalRevenue =
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

  const totalService =
    totalRevenue * 0.05;

  const fohPool =
    totalService * 0.5;

  const map = {};

  for (const order of orders || []) {

    if (
      !map[
        order.staff_name
      ]
    ) {

      map[
        order.staff_name
      ] = {

        staff_name:
          order.staff_name,

        orders: 0,

        revenue: 0,
      };
    }

    map[
      order.staff_name
    ].orders += 1;

    map[
      order.staff_name
    ].revenue +=
      Number(
        order.total_amount || 0
      );
  }

  const staff =
    Object.values(map);

  const totalOrders =
    staff.reduce(
      (
        sum,
        s
      ) =>
        sum + s.orders,
      0
    );

  return staff.map(
    (
      member
    ) => {

      const weight =
        member.orders /
        (
          totalOrders || 1
        );

      return {

        ...member,

        payout:
          Math.floor(
            fohPool *
              weight
          ),
      };
    }
  );
}
