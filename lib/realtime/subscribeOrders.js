import { supabase }
from "@/lib/shared/supabase/client";

export default function subscribeOrders(
  callback
) {

  const channel =
    supabase.channel(
      "orders-live"
    );

  channel.on(

    "postgres_changes",

    {
      event: "*",
      schema: "public",
      table: "orders",
    },

    (payload) => {

      callback(payload);

    }

  );

  channel.subscribe();

  return () => {

    supabase.removeChannel(
      channel
    );

  };

}
