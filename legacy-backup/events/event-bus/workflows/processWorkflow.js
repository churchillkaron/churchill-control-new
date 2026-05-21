import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import runEventSubscribers from "@/lib/event-bus/subscribers/runEventSubscribers";

export default async function processWorkflow({
  tenant_id,
}) {

  try {

    const {
      data: events,
      error,
    } = await supabaseAdmin
      .from("event_bus")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      )
      .eq(
        "status",
        "PENDING"
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (error) {
      throw error;
    }

    const processed = [];

    for (const event of events || []) {

      const result =
        await runEventSubscribers({

          tenant_id,

          event,
        });

      await supabaseAdmin
        .from("event_bus")
        .update({

          status:
            "PROCESSED",

          processed_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          event.id
        );

      processed.push({

        event_type:
          event.event_type,

        result,
      });
    }

    return {

      success: true,

      processed,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
