import {
  supabaseClient,
} from "@/lib/shared/supabase/client";

export function createSafeRealtimeChannel({
  name,
  subscriptions = [],
  onChange,
  onStatus,
}) {
  if (
    typeof window === "undefined" ||
    !supabaseClient ||
    !name ||
    !Array.isArray(subscriptions) ||
    !subscriptions.length
  ) {
    return null;
  }

  try {
    const channel =
      supabaseClient.channel(name);

    subscriptions.forEach(
      subscription => {
        if (!subscription?.table) return;

        const configuration = {
          event:
            subscription.event || "*",
          schema:
            subscription.schema || "public",
          table:
            subscription.table,
        };

        if (subscription.filter) {
          configuration.filter =
            subscription.filter;
        }

        channel.on(
          "postgres_changes",
          configuration,
          payload => {
            try {
              onChange?.(
                payload,
                subscription
              );
            } catch (error) {
              console.warn(
                "[realtime] change handler failed",
                {
                  name,
                  table:
                    subscription.table,
                  error,
                }
              );
            }
          }
        );
      }
    );

    channel.subscribe(
      status => {
        try {
          onStatus?.(status);
        } catch {}
      }
    );

    return channel;
  } catch (error) {
    console.warn(
      "[realtime] channel creation failed",
      {
        name,
        error,
      }
    );
    return null;
  }
}

export function removeSafeRealtimeChannel(
  channel
) {
  if (!channel || !supabaseClient) return;

  try {
    supabaseClient.removeChannel(
      channel
    );
  } catch {}
}
