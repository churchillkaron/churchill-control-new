import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import {
  emitEvent,
} from "@/lib/shared/events/eventBus";

export default async function publishEvent({

  tenant_id,

  event_type,

  payload = {},

}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("event_bus")
      .insert([
        {
          tenant_id,
          event_type,
          payload,
          status: "PENDING",
          created_at:
            new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {

      throw error;

    }

    const runtimeResult =
      await emitEvent(

        event_type,

        {

          tenantId:
            tenant_id,

          ...payload,

        }

      );

    return {

      success: true,

      event:
        data,

      runtime:
        runtimeResult,

    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,

    };

  }

}
