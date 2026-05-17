import publishEvent from "@/lib/events/publishEvent";

export default async function sendNotification({
  tenant_id,
  user_id,
  title,
  message,
  level = "info",
}) {

  return await publishEvent({
    tenant_id,
    user_id,
    type: "SYSTEM_NOTIFICATION",
    payload: {
      title,
      message,
      level,
    },
  });
}
