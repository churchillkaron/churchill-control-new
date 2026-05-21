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
        table: "orders",
      },
      callback
    )
    .subscribe();

  return channel;
}
