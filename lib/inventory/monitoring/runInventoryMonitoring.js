import processAutoSpoilage from "@/lib/inventory/auto-spoilage/processAutoSpoilage";

import generateInventoryAlerts from "@/lib/inventory/alerts/generateInventoryAlerts";

export default async function runInventoryMonitoring({
  tenant_id,
}) {

  try {

    // ===== AUTO SPOILAGE =====
    const spoilage =
      await processAutoSpoilage();

    // ===== ALERTS =====
    const alerts =
      await generateInventoryAlerts({
        tenant_id,
      });

    return {

      success: true,

      spoilage,

      alerts,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
