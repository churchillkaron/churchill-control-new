import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import createAlert from "@/lib/alerts/createAlert";

import storeInsightMemory from "@/lib/intelligence/memory/storeInsightMemory";

export default async function detectAnomalies({
  tenant_id,
}) {

  try {

    const {
      data: orders,
      error,
    } = await supabaseAdmin
      .from("orders")
      .select("total,status")
      .eq(
        "tenant_id",
        tenant_id
      );

    if (error) {
      throw error;
    }

    const totals =
      (orders || []).map(
        (o) =>
          Number(
            o.total || 0
          )
      );

    const avg =
      totals.length > 0
        ? totals.reduce(
            (
              sum,
              value
            ) =>
              sum + value,
            0
          ) / totals.length
        : 0;

    const anomalies = [];

    for (const order of orders || []) {

      const value =
        Number(
          order.total || 0
        );

      if (
        value >
        avg * 5
      ) {

        anomalies.push({
          type:
            "HIGH_ORDER_VALUE",
          value,
        });
      }

      if (
        order.status ===
        "cancelled"
      ) {

        anomalies.push({
          type:
            "CANCELLED_ORDER",
        });
      }
    }

    if (
      anomalies.length > 0
    ) {

      await createAlert({
        tenant_id,
        severity:
          "warning",
        message:
          `${anomalies.length} anomalies detected.`,
      });

      await storeInsightMemory({
        tenant_id,
        category:
          "anomaly_detection",
        payload: {
          anomalies,
        },
      });
    }

    return {
      success: true,
      average_order:
        avg,
      anomalies,
      anomaly_count:
        anomalies.length,
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
