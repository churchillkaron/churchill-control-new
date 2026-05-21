import checkSystemHealth from "@/lib/health/checkSystemHealth";
import logAuditEvent from "@/lib/audit/logAuditEvent";

export default async function createHealthSnapshot() {
  const health = await checkSystemHealth();

  await logAuditEvent({
    tenant_id: null,
    user_id: null,
    action: "SYSTEM_HEALTH_CHECK",
    entity_type: "system",
    entity_id: null,
    metadata: health,
  });

  return health;
}
