import createChannel from "./createChannel";

export default function subscribeOrders(
  callback
) {

  const channel =
    createChannel(
      "orders-live"
    );

  channel
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        service_unit: "orders",
      },
      callback
    )
    .subscribe();

  return channel;
}
