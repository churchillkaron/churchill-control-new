import processAutoSpoilage from "@/lib/inventory/spoilage/workflows/processAutoSpoilage";

import generateInventoryAlerts from "@/lib/inventory/runtime/generateInventoryAlerts";

export default async function runInventoryMonitoring({
  organization_id,
  organizationId,
  entity_id = null,
  entityId = null,
}) {

  try {
    const resolvedOrganizationId =
      organization_id || organizationId;

    const resolvedEntityId =
      entity_id || entityId || null;

    // ===== AUTO SPOILAGE =====
    const spoilage =
      await processAutoSpoilage();

    // ===== ALERTS =====
    const alerts =
      await generateInventoryAlerts({
        organization_id:
          resolvedOrganizationId,
        entity_id:
          resolvedEntityId,
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
