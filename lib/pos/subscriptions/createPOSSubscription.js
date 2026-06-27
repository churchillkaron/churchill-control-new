import { supabase } from "@/lib/shared/supabase/client";

export default function createPOSSubscription({
  organization_id,
  table = "pos_realtime_events",
  onInsert,
}) {

  try {

    const channel =
      supabase
        .channel(
          `pos-${organization_id}-${table}`
        )
        .on(
          "postgres_changes",
          {

            event:
              "INSERT",

            schema:
              "public",

            table,

            filter:
              `organization_id=eq.${organization_id}`,
          },

          (payload) => {

            if (
              onInsert
            ) {

              onInsert(
                payload.new
              );
            }
          }
        )
        .subscribe();

    return {

      success: true,

      channel,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
