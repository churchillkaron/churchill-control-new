import { supabase }
from "@/lib/shared/supabase/client";

export default function subscribeTables(
  callback
) {

  const channel =
    supabase.channel(
      "restaurant-tables-live"
    );

  channel.on(

    "postgres_changes",

    {
      event: "*",
      schema: "public",
      table: "restaurant_tables",
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
