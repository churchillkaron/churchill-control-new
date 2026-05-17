import logAuditEvent from "@/lib/audit/logAuditEvent";
import broadcastEvent from "@/lib/realtime/broadcastEvent";

export default async function publishEvent({
  tenant_id,
  user_id,
  type,
  payload = {},
}) {

  await logAuditEvent({
    tenant_id,
    user_id,
    action: type,
    entity_type: "event",
    entity_id: null,
    metadata: payload,
  });

  await broadcastEvent({
    channel: "system-events",
    event: type,
    payload,
  });

  return {
    success: true,
    type,
    timestamp:
      new Date().toISOString(),
  };
}
