export default function buildOperationalContext({

  tables = [],

  orders = [],

  payments = [],

}) {

  // =====================================
  // OCCUPIED TABLES
  // =====================================

  const occupiedTables =
    tables.filter(
      (t) =>
        t.status ===
        "OCCUPIED"
    );

  // =====================================
  // VIP DETECTION
  // =====================================

  const vipTables =
    occupiedTables.filter(
      (t) =>
        Number(
          t.total_spent || 0
        ) > 10000
    );

  // =====================================
  // DELAYED ORDERS
  // =====================================

  const delayedOrders =
    orders.filter(
      (o) => {

        const created =
          new Date(
            o.created_at
          ).getTime();

        const now =
          Date.now();

        const minutes =
          (
            now - created
          ) / 1000 / 60;

        return (
          minutes > 20 &&
          o.status !== "DONE"
        );

      }
    );

  // =====================================
  // REVENUE
  // =====================================

  const revenueToday =
    payments.reduce(
      (sum, p) =>
        sum +
        Number(
          p.amount_paid || 0
        ),
      0
    );

  // =====================================
  // KITCHEN PRESSURE
  // =====================================

  let kitchenPressure =
    "LOW";

  if (
    delayedOrders.length > 5
  ) {

    kitchenPressure =
      "HIGH";

  } else if (
    delayedOrders.length > 2
  ) {

    kitchenPressure =
      "MEDIUM";

  }

  return {

    occupiedTables:
      occupiedTables.length,

    vipTables:
      vipTables.length,

    delayedOrders:
      delayedOrders.length,

    kitchenPressure,

    revenueToday,

  };

}
