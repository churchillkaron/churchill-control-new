import checkSystemHealth
from "@/lib/health/checkSystemHealth";

import logAuditEvent
from "@/lib/audit/logAuditEvent";

export default async function createHealthSnapshot({

  tenant_id = null,

} = {}) {

  const health =
    await checkSystemHealth();

  if (tenant_id) {

    await logAuditEvent({

      tenant_id,

      performed_by: null,

      performed_by_name:
        "SYSTEM",

      action_type:
        "SYSTEM_HEALTH_CHECK",

      entity_type:
        "system",

      entity_id: null,

      metadata: health,

    });

  }

  return health;

}
