import {
  supabase,
} from "@/lib/shared/supabase/client";

export function createSafeRealtimeChannel({
  name,
  subscriptions = [],
  onChange,
}) {

  const channel =
    supabase.channel(name);

  subscriptions.forEach(
    subscription => {

      channel.on(
        "postgres_changes",
        {
          event:
            subscription.event || "*",

          schema:
            "public",

          table:
            subscription.table,

          filter:
            subscription.filter,
        },
        payload => {

          if (onChange) {

            onChange(
              payload
            );

          }

        }
      );

    }
  );

  channel.subscribe();

  return channel;

}

export function removeSafeRealtimeChannel(
  channel
) {

  if (channel) {

    supabase.removeChannel(
      channel
    );

  }

}
