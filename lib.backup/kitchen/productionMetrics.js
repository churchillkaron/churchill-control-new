export function buildProductionMetrics(
  orders,
  station
) {

  let totalItems = 0;

  let cookingItems = 0;

  let readyItems = 0;

  let rushItems = 0;

  let vipItems = 0;

  let totalWait = 0;

  let timerCount = 0;

  orders.forEach(
    order => {

      (order.order_items || [])

        .filter(
          item =>

            item.station ===
              station &&

            ![
              "SERVED",
              "CLOSED",
              "CANCELLED",
            ].includes(
              item.status
            )
        )

        .forEach(item => {

          const qty =
            Number(
              item.quantity || 0
            );

          totalItems += qty;

          if (
            item.status ===
            "COOKING"
          ) {

            cookingItems += qty;

          }

          if (
            item.status ===
            "READY"
          ) {

            readyItems += qty;

          }

          if (
            item.rush
          ) {

            rushItems += qty;

          }

          if (
            item.vip
          ) {

            vipItems += qty;

          }

          const start =
            item.kitchen_started_at ||
            item.created_at;

          if (start) {

            totalWait +=
              Math.max(
                0,
                Math.floor(
                  (
                    Date.now() -

                    new Date(
                      start
                    ).getTime()

                  ) / 60000
                )
              );

            timerCount++;

          }

        });

    }
  );

  const avgWait =

    timerCount > 0

      ? Math.floor(
          totalWait /
          timerCount
        )

      : 0;

  let health =
    "GOOD";

  if (
    avgWait >= 20
  ) {

    health =
      "CRITICAL";

  } else if (
    avgWait >= 15
  ) {

    health =
      "BAD";

  } else if (
    avgWait >= 10
  ) {

    health =
      "WARNING";

  }

  return {

    totalItems,

    cookingItems,

    readyItems,

    rushItems,

    vipItems,

    avgWait,

    health,

  };

}
