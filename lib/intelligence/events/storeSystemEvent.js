import publishEvent
from "@/lib/event-bus/core/publishEvent";

export default async function storeSystemEvent({

  tenant_id,

  type,

  payload = {},

}) {

  return await publishEvent({

    tenant_id,

    event_type: type,

    payload,

  });

}
