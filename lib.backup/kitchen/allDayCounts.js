export function buildAllDayCounts(
  orders,
  station
) {

  const counts = {};

  orders.forEach(
    order => {

      (order.order_items || [])
        .filter(
          item =>

            item.station ===
              station &&

            ![
              "SERVED",
              "CANCELLED",
              "CLOSED",
            ].includes(
              item.status
            )
        )
        .forEach(item => {

          const key =
            item.item_name ||
            "Unknown";

          if (
            !counts[key]
          ) {

            counts[key] = {
              quantity: 0,
              cooking: 0,
              ready: 0,
            };

          }

          counts[key].quantity +=
            Number(
              item.quantity || 0
            );

          if (
            item.status ===
            "COOKING"
          ) {

            counts[key].cooking +=
              Number(
                item.quantity || 0
              );

          }

          if (
            item.status ===
            "READY"
          ) {

            counts[key].ready +=
              Number(
                item.quantity || 0
              );

          }

        });

    }
  );

  return Object.entries(
    counts
  ).map(
    ([name, data]) => ({

      name,

      ...data,

    })
  );

}
