import { supabase } from "@/lib/shared/supabase/client";

import loadOperationalSettings
from "@/lib/settings/loadOperationalSettings";

import createAlert
from "@/lib/alerts/createAlert";

import createOperationalEscalation
from "@/lib/governance/createOperationalEscalation";

export async function updateKitchenStatus({
  orderId,
  status,
}) {

  const {
    data: order,
  } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  const kitchenSettings =
    await loadOperationalSettings({

      tenantId:
        order?.tenant_id,

      domain:
        "KITCHEN",

    });

  const updates = {
    kitchen_status: status,
  };

  // ===== STARTED =====
  if (
    status ===
    "PREPARING"
  ) {
    updates.started_at =
      new Date();
  }

  // ===== SLA MONITORING =====
  if (
    status === "READY" ||
    status === "SERVED"
  ) {

    const startedAt =
      order?.started_at
        ? new Date(order.started_at)
        : null;

    if (startedAt) {

      const durationMinutes =
        Math.floor(
          (
            Date.now() -
            startedAt.getTime()
          ) / 60000
        );

      if (
        kitchenSettings?.auto_alert_delays
      ) {

        if (
          durationMinutes >=
          Number(
            kitchenSettings?.critical_time_minutes || 30
          )
        ) {

          await createAlert({

            tenant_id:
              order?.tenant_id,

            message:
              `CRITICAL kitchen delay detected for order ${orderId} (${durationMinutes} min)`,

            severity:
              "critical",

          });

          await createOperationalEscalation({

            tenantId:
              order?.tenant_id,

            category:
              "KITCHEN_SLA_FAILURE",

            severity:
              "critical",

            reason:
              `Kitchen exceeded SLA threshold (${durationMinutes} minutes)`,

            referenceId:
              orderId,

          });

        } else if (
          durationMinutes >=
          Number(
            kitchenSettings?.warning_time_minutes || 15
          )
        ) {

          await createAlert({

            tenant_id:
              order?.tenant_id,

            message:
              `Kitchen SLA warning for order ${orderId} (${durationMinutes} min)`,

            severity:
              "warning",

          });

        }

      }

    }

  }

  // ===== COMPLETED =====
  if (
    status === "READY" ||
    status === "SERVED"
  ) {
    updates.completed_at =
      new Date();
  }

  const {
    error,
  } = await supabase
    .from("orders")
    .update(updates)
    .eq("id", orderId);

  if (error) {

    console.error(
      "KITCHEN STATUS ERROR",
      error
    );

    throw error;
  }

  return true;
}
