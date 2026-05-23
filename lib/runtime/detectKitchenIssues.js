export default function detectKitchenIssues(
  orders = []
) {

  const delayed =
    orders.filter(
      (order) => {

        const created =
          new Date(
            order.created_at
          ).getTime();

        const diff =
          (
            Date.now() -
            created
          ) / 1000 / 60;

        return (
          diff > 20 &&
          order.status !==
            "DONE"
        );

      }
    );

  return {

    delayedOrders:
      delayed,

    pressure:

      delayed.length > 5
        ? "HIGH"

      : delayed.length > 2
        ? "MEDIUM"

      : "LOW",

  };

}
