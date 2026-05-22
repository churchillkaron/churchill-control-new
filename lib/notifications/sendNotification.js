import publishEvent
from "@/lib/event-bus/core/publishEvent";

export default async function sendNotification({

  tenant_id,

  user_id,

  title,

  message,

  level = "info",

}) {

  return await publishEvent({

    tenant_id,

    event_type:
      "SYSTEM_NOTIFICATION",

    payload: {

      user_id,

      title,

      message,

      level,

    },

  });

}
