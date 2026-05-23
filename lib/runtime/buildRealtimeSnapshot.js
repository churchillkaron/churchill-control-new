export default function buildRealtimeSnapshot({

  tables = [],

  orders = [],

  payments = [],

  notifications = [],

  insights = [],

  mission = null,

}) {

  // =====================================
  // ACTIVE TABLES
  // =====================================

  const activeTables =
    tables.map((table) => ({

      id:
        table.id,

      table:
        table.table_number ||
        table.name,

      status:
        table.status,

      spend:
        Number(
          table.total_spent || 0
        ),

    }));

  // =====================================
  // ACTIVE ORDERS
  // =====================================

  const activeOrders =
    orders.map((order) => ({

      id:
        order.id,

      status:
        order.status,

      created_at:
        order.created_at,

      total:
        Number(
          order.total_amount || 0
        ),

    }));

  // =====================================
  // REVENUE
  // =====================================

  const revenueToday =
    payments.reduce(
      (sum, payment) => {

        return (
          sum +
          Number(
            payment.amount_paid || 0
          )
        );

      },
      0
    );

  return {

    revenueToday,

    activeTables,

    activeOrders,

    notifications,

    insights,

    mission,

    generated_at:
      new Date()
        .toISOString(),

  };

}
