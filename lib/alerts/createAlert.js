import sendNotification from "@/lib/notifications/sendNotification";

export default async function createAlert({
  tenant_id,
  message,
  severity = "warning",
}) {

  return await sendNotification({
    tenant_id,
    user_id: null,
    title: "System Alert",
    message,
    level: severity,
  });
}
