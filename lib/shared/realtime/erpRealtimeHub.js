import { supabase } from "@/lib/shared/supabase/client";

/**
 * ERP REALTIME HUB
 * Central subscription layer for all modules
 */

const channels = {};

export function subscribe(channelName, table, callback) {

  if (channels[channelName]) {
    return channels[channelName];
  }

  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table
      },
      (payload) => {
        callback(payload);
      }
    )
    .subscribe();

  channels[channelName] = channel;

  return channel;
}

export function unsubscribe(channelName) {

  const channel = channels[channelName];

  if (channel) {
    supabase.removeChannel(channel);
    delete channels[channelName];
  }
}
