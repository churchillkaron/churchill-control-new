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
      if (!subscription?.table) {
        return;
      }

      channel.on(
        "postgres_changes",
        {
          event:
            subscription.event || "*",

          schema:
            subscription.schema || "public",

          table:
            subscription.table,

          filter:
            subscription.filter,
        },
        payload => {
          if (onChange) {
            onChange(payload);
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
    supabase.removeChannel(channel);
  }
}
